using System.Text.Json;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Common;
using ClubManagement.DTOs.MembershipApplication;
using ClubManagement.Entities;
using ClubManagement.Entities.Committee;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Settings;
using ClubManagement.Services.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.MembershipApplication;

public interface IManagerStageService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<ManagerReadinessDto?> GetReadinessAsync(long applicationId, CancellationToken cancellationToken);
    Task EnsureReadyForManagerAsync(long applicationId, CancellationToken cancellationToken);
    Task EnsureClubVisitsForInterviewAsync(long applicationId, CancellationToken cancellationToken);
    Task EnsureAuthorizeToInterviewAsync(long applicationId, CancellationToken cancellationToken);
    Task OnEndorsementsPossiblyCompleteAsync(long applicationId, CancellationToken cancellationToken);
    Task OnApplicantPrerequisitesChangedAsync(long applicationId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ApplicationClubVisitDto>> ListClubVisitsAsync(long applicationId, CancellationToken cancellationToken);
    Task<ApplicationClubVisitDto?> AddClubVisitAsync(long applicationId, CreateApplicationClubVisitRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ManagerReadinessDto?> OverrideClubVisitsAsync(long applicationId, ClubVisitsOverrideRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<PagedResult<ApplicationListItemDto>> ListManagerQueueAsync(PagedRequest paging, CancellationToken cancellationToken);
    Task<PagedResult<ApplicationListItemDto>> ListStageAHistoryAsync(PagedRequest paging, CancellationToken cancellationToken);
    Task MarkStageAAuthorizedAsync(long applicationId, long? actorUserId, CancellationToken cancellationToken);
    Task<InterviewDto?> AssignToCommitteeMeetingAsync(
        long applicationId,
        AssignMeetingRequest request,
        long? actorUserId,
        CancellationToken cancellationToken);
    Task SendManagerRequestAsync(
        long applicationId,
        ManagerItemRequest request,
        long? actorUserId,
        CancellationToken cancellationToken);
    Task NotifyApplicantRejectedAsync(long applicationId, string reason, CancellationToken cancellationToken);
}

public class ManagerStageService : IManagerStageService
{
    public const int RequiredClubVisits = 3;

    private static readonly string[] IdPassportCodes = ["ID_PASSPORT", "ID", "PASSPORT", "NATIONAL_ID", "ID_COPY"];
    private static readonly string[] CvCodes = ["CV", "CURRICULUM_VITAE"];
    private static readonly string[] LicenseCodes = ["LICENSE", "LICENCE", "PILOT_LICENSE", "PILOT_LICENCE"];
    private static readonly string[] AnnualChequeCodes = ["CHEQUE_ANNUAL"];
    private static readonly string[] JoiningChequeCodes = ["CHEQUE_JOINING"];
    private static readonly HashSet<string> PaymentOkStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "PENDING", "PAID", "PARTIALLY_PAID", "WAIVED", "PARTIAL", "INITIATED"
    };
    private static readonly HashSet<string> PaymentReceivedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "PAID", "WAIVED", "COMPLETE", "COMPLETED", "RECEIVED", "SUCCESS", "CLEARED"
    };

    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailSender _email;
    private readonly AppPublicOptions _app;
    private readonly IApplicationDecisionNotifier _decisions;

    public ManagerStageService(
        ApplicationModuleDbContext db,
        IEmailSender email,
        IOptions<AppPublicOptions> app,
        IApplicationDecisionNotifier decisions)
    {
        _db = db;
        _email = email;
        _app = app.Value;
        _decisions = decisions;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Application_club_visit', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Application_club_visit (
        application_club_visit_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Application_club_visit PRIMARY KEY,
        application_id BIGINT NOT NULL,
        visit_date DATE NOT NULL,
        met_with NVARCHAR(200) NOT NULL,
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_Application_club_visit_created DEFAULT (SYSUTCDATETIME()),
        created_by_user_id BIGINT NULL,
        updated_by_user_id BIGINT NULL,
        CONSTRAINT FK_Application_club_visit_app FOREIGN KEY (application_id) REFERENCES dbo.MApplication(application_id) ON DELETE CASCADE
    );
END
", cancellationToken);

        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.MApplication', N'club_visits_override') IS NULL
    ALTER TABLE dbo.MApplication ADD club_visits_override BIT NOT NULL CONSTRAINT DF_app_club_visits_override DEFAULT(0);
IF COL_LENGTH(N'dbo.MApplication', N'club_visits_override_reason') IS NULL
    ALTER TABLE dbo.MApplication ADD club_visits_override_reason NVARCHAR(1000) NULL;
IF COL_LENGTH(N'dbo.MApplication', N'club_visits_override_at') IS NULL
    ALTER TABLE dbo.MApplication ADD club_visits_override_at DATETIME2 NULL;
IF COL_LENGTH(N'dbo.MApplication', N'club_visits_override_by_user_id') IS NULL
    ALTER TABLE dbo.MApplication ADD club_visits_override_by_user_id BIGINT NULL;
IF COL_LENGTH(N'dbo.MApplication', N'stage_a_authorized_at') IS NULL
    ALTER TABLE dbo.MApplication ADD stage_a_authorized_at DATETIME2 NULL;
IF COL_LENGTH(N'dbo.MApplication', N'stage_a_authorized_by_user_id') IS NULL
    ALTER TABLE dbo.MApplication ADD stage_a_authorized_by_user_id BIGINT NULL;
IF COL_LENGTH(N'dbo.MApplication', N'current_handler_user_id') IS NULL
    ALTER TABLE dbo.MApplication ADD current_handler_user_id BIGINT NULL;
IF COL_LENGTH(N'dbo.MApplication', N'previous_handler_user_id') IS NULL
    ALTER TABLE dbo.MApplication ADD previous_handler_user_id BIGINT NULL;
IF COL_LENGTH(N'dbo.Application_status_history', N'action') IS NULL
    ALTER TABLE dbo.Application_status_history ADD action NVARCHAR(40) NULL;
IF COL_LENGTH(N'dbo.Committee_meeting', N'meeting_name') IS NULL
    ALTER TABLE dbo.Committee_meeting ADD meeting_name NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.Committee_meeting', N'meeting_time') IS NULL
    ALTER TABLE dbo.Committee_meeting ADD meeting_time NVARCHAR(20) NULL;
", cancellationToken);

        await _db.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT 1 FROM dbo.Document_type WHERE code = N'ID_PASSPORT')
BEGIN
    SET IDENTITY_INSERT dbo.Document_type ON;
    INSERT INTO dbo.Document_type (document_type_id, code, name, sort_order, is_active, created_at)
    VALUES (4, N'ID_PASSPORT', N'ID / Passport copy', 4, 1, SYSUTCDATETIME());
    SET IDENTITY_INSERT dbo.Document_type OFF;
END
", cancellationToken);

        foreach (var (code, name, sort) in new (string, string, int)[]
                 {
                     ("CV", "Curriculum vitae", 2),
                     ("LICENSE", "Pilot licence", 3),
                     ("PHOTO", "Passport photo", 1),
                     ("CHEQUE", "Cheque copy", 10),
                     ("CHEQUE_ANNUAL", "Annual subscription cheque", 11),
                     ("CHEQUE_JOINING", "Joining / entrance fee cheque", 12),
                 })
        {
            var exists = await _db.DocumentTypes.AnyAsync(x => x.Code == code, cancellationToken);
            if (exists) continue;
            _db.DocumentTypes.Add(new DocumentType
            {
                Code = code,
                Name = name,
                SortOrder = sort,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            });
        }
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<ManagerReadinessDto?> GetReadinessAsync(long applicationId, CancellationToken cancellationToken)
    {
        var app = await _db.Applications.AsNoTracking()
            .Include(a => a.Status)
            .Include(a => a.Applicant)
            .Include(a => a.Endorsements)
            .Include(a => a.AplicationDocuments).ThenInclude(d => d.DocumentType)
            .Include(a => a.ClubVisits)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app is null) return null;

        return await BuildReadinessAsync(app, cancellationToken);
    }

    public async Task EnsureReadyForManagerAsync(long applicationId, CancellationToken cancellationToken)
    {
        var readiness = await GetReadinessAsync(applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");
        if (!readiness.EndorsementsComplete)
            throw new InvalidOperationException(
                "Both the proposer and the seconder must complete their endorsements before submitting to the manager.");
        if (!readiness.PaymentsReady)
            throw new InvalidOperationException(
                "Applicant must initiate or complete entrance fee and annual subscription before submitting to the manager. Pending: "
                + string.Join("; ", readiness.PendingPaymentItems));
        if (!readiness.DocumentsReady)
        {
            var docPending = readiness.PendingItems
                .Where(p => p.Contains("Upload", StringComparison.OrdinalIgnoreCase))
                .ToList();
            throw new InvalidOperationException(
                "Required documents are incomplete. Pending: "
                + (docPending.Count > 0 ? string.Join("; ", docPending) : "CV / ID / licence"));
        }
    }

    public async Task EnsureClubVisitsForInterviewAsync(long applicationId, CancellationToken cancellationToken)
    {
        var readiness = await GetReadinessAsync(applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");
        if (!readiness.ClubVisitsMet)
            throw new InvalidOperationException(
                $"At least {RequiredClubVisits} club visits (with who they met) must be logged before interview (currently {readiness.ClubVisitsLogged}), or an admin override with a reason is required.");
    }

    public async Task EnsureAuthorizeToInterviewAsync(long applicationId, CancellationToken cancellationToken)
    {
        await EnsureReadyForManagerAsync(applicationId, cancellationToken);
        await EnsureClubVisitsForInterviewAsync(applicationId, cancellationToken);
        var readiness = await GetReadinessAsync(applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");
        if (!readiness.PaymentsReceived)
            throw new InvalidOperationException(
                "Entrance fee and annual subscription must both be received (or waived), or both fee cheques must be uploaded, before authorizing to interview.");
        if (!readiness.MemberDetailsComplete)
            throw new InvalidOperationException(
                "Member details on the application form must be complete before authorizing to interview.");
        if (!readiness.FeeChequesUploaded)
            throw new InvalidOperationException(
                "Annual subscription cheque and joining / entrance fee cheque must both be uploaded on the application before authorizing to interview.");
        if (!readiness.CanProceedToInterview)
        {
            if (readiness.PilotLicenseRequired && !readiness.PilotLicenseUploaded)
                throw new InvalidOperationException(
                    "Pilot licence copy is still missing. Send a document request to the applicant before authorizing to interview.");
            throw new InvalidOperationException(
                "Manager verification incomplete. Confirm sponsors, fees received, member details, documents, fee cheques and club visits before authorizing to interview.");
        }
    }

    public async Task OnEndorsementsPossiblyCompleteAsync(long applicationId, CancellationToken cancellationToken)
    {
        var readiness = await GetReadinessAsync(applicationId, cancellationToken);
        if (readiness is null || !readiness.EndorsementsComplete) return;

        // Flowchart Stage A: after both sponsors submit, check entrance + annual payment.
        if (!readiness.PaymentsReady)
        {
            await NotifyApplicantPaymentRequiredAsync(applicationId, readiness, cancellationToken);
            return;
        }

        // Payments in place — notify manager to verify docs, sponsors, payment and visits.
        await NotifyManagersAsync(applicationId, cancellationToken);

        if (!readiness.DocumentsReady)
            await NotifyApplicantPendingAsync(applicationId, readiness, cancellationToken);
    }

    public async Task OnApplicantPrerequisitesChangedAsync(long applicationId, CancellationToken cancellationToken)
    {
        var readiness = await GetReadinessAsync(applicationId, cancellationToken);
        if (readiness is null || !readiness.EndorsementsComplete) return;

        var status = readiness.StatusCode ?? "";
        if (!string.Equals(status, "Endorsement", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(status, "EndorsementReview", StringComparison.OrdinalIgnoreCase))
            return;

        if (!readiness.PaymentsReady)
        {
            await NotifyApplicantPaymentRequiredAsync(applicationId, readiness, cancellationToken);
            return;
        }

        await NotifyManagersAsync(applicationId, cancellationToken);
        if (!readiness.DocumentsReady)
            await NotifyApplicantPendingAsync(applicationId, readiness, cancellationToken);
    }

    public async Task<IReadOnlyList<ApplicationClubVisitDto>> ListClubVisitsAsync(long applicationId, CancellationToken cancellationToken)
    {
        var app = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.ClubVisits)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app is null) return [];
        return await MergeClubVisitsAsync(app, cancellationToken);
    }

    public async Task<ApplicationClubVisitDto?> AddClubVisitAsync(
        long applicationId,
        CreateApplicationClubVisitRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        if (!await _db.Applications.AnyAsync(a => a.ApplicationId == applicationId, cancellationToken))
            return null;

        var metWith = (request.MetWith ?? "").Trim();
        if (string.IsNullOrWhiteSpace(metWith))
            throw new InvalidOperationException("Who they met is required.");

        var visit = new ApplicationClubVisit
        {
            ApplicationId = applicationId,
            VisitDate = request.VisitDate == default ? DateOnly.FromDateTime(DateTime.UtcNow) : request.VisitDate,
            MetWith = metWith,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.ApplicationClubVisits.Add(visit);

        var app = await _db.Applications.FirstAsync(a => a.ApplicationId == applicationId, cancellationToken);
        var logged = await _db.ApplicationClubVisits.CountAsync(v => v.ApplicationId == applicationId, cancellationToken) + 1;
        app.ClubVisitsCount = logged;
        app.UpdatedByUserId = actorUserId;
        app.UpdatedAt = DateTime.UtcNow;

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "Application_club_visit",
            RecordId = 0,
            Action = "INSERT",
            NewValues = $"applicationId={applicationId}; date={visit.VisitDate}; met={visit.MetWith}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(cancellationToken);

        // Fix audit record id after insert
        var audit = await _db.AuditLogs
            .OrderByDescending(a => a.AuditLogId)
            .FirstOrDefaultAsync(a => a.TableName == "Application_club_visit" && a.RecordId == 0, cancellationToken);
        if (audit is not null)
        {
            audit.RecordId = visit.ApplicationClubVisitId;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return new ApplicationClubVisitDto
        {
            ApplicationClubVisitId = visit.ApplicationClubVisitId,
            ApplicationId = visit.ApplicationId,
            VisitDate = visit.VisitDate,
            MetWith = visit.MetWith,
            Notes = visit.Notes,
            CreatedAt = visit.CreatedAt,
            CreatedByUserId = visit.CreatedByUserId
        };
    }

    public async Task<ManagerReadinessDto?> OverrideClubVisitsAsync(
        long applicationId,
        ClubVisitsOverrideRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var reason = (request.Reason ?? "").Trim();
        if (reason.Length < 5)
            throw new InvalidOperationException("Override reason is required (at least 5 characters).");

        var app = await _db.Applications.FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app is null) return null;

        app.ClubVisitsOverride = true;
        app.ClubVisitsOverrideReason = reason;
        app.ClubVisitsOverrideAt = DateTime.UtcNow;
        app.ClubVisitsOverrideByUserId = actorUserId;
        app.UpdatedByUserId = actorUserId;
        app.UpdatedAt = DateTime.UtcNow;

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MApplication",
            RecordId = applicationId,
            Action = "CLUB_VISITS_OVERRIDE",
            NewValues = reason,
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return await GetReadinessAsync(applicationId, cancellationToken);
    }

    public async Task<PagedResult<ApplicationListItemDto>> ListManagerQueueAsync(PagedRequest paging, CancellationToken cancellationToken)
    {
        var apps = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .Include(a => a.ElectionType)
            .Include(a => a.Endorsements)
            .Include(a => a.AplicationDocuments).ThenInclude(d => d.DocumentType)
            .Include(a => a.ClubVisits)
            .OrderByDescending(a => a.UpdatedAt ?? a.CreatedAt)
            .ToListAsync(cancellationToken);

        var queue = new List<ApplicationListItemDto>();
        foreach (var app in apps)
        {
            var code = NormalizeStatusCode(app.Status?.Code);
            // After screening, Stage A lives at Endorsement / EndorsementReview once sponsors are done.
            var atStageA = string.Equals(code, "Endorsement", StringComparison.OrdinalIgnoreCase)
                || string.Equals(code, "EndorsementReview", StringComparison.OrdinalIgnoreCase);
            if (!atStageA || !AreEndorsementsComplete(app.Endorsements)) continue;

            var readiness = await BuildReadinessAsync(app, cancellationToken);
            queue.Add(ToQueueItem(app, readiness, code));
        }
        return Paging.FromList(queue, paging);
    }

    public async Task<PagedResult<ApplicationListItemDto>> ListStageAHistoryAsync(PagedRequest paging, CancellationToken cancellationToken)
    {
        // Only applications the manager explicitly authorized out of Stage A.
        var apps = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .Include(a => a.ElectionType)
            .Include(a => a.Endorsements)
            .Include(a => a.Interviews).ThenInclude(i => i.CommitteeMeeting)
            .Where(a => a.StageAAuthorizedAt != null)
            .OrderByDescending(a => a.StageAAuthorizedAt)
            .ToListAsync(cancellationToken);

        var rows = new List<ApplicationListItemDto>();
        foreach (var app in apps)
        {
            var code = NormalizeStatusCode(app.Status?.Code) ?? app.Status?.Code;
            var name = string.Join(" ", new[] { app.Applicant.FirstName, app.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));
            var sponsor = AreEndorsementsComplete(app.Endorsements);
            var assigned = app.Interviews
                .Where(i => i.CommitteeMeetingId != null)
                .OrderByDescending(i => i.InterviewId)
                .FirstOrDefault();
            var (joining, annual) = await LoadFeeLinesAsync(app.ApplicantProfileId, cancellationToken);
            var lines = new List<ApplicationPaymentLineDto> { ToPaymentLineDto(joining), ToPaymentLineDto(annual) };
            var snapshot = PaymentSnapshot(lines);
            var received = joining.Received && annual.Received;
            var initiated = joining.Initiated && annual.Initiated;
            rows.Add(new ApplicationListItemDto
            {
                ApplicationId = app.ApplicationId,
                ApplicationNo = app.ApplicationNo,
                ReferenceNumber = app.ApplicationNo,
                ApplicantProfileId = app.ApplicantProfileId,
                ApplicantName = name,
                ApplicationStatusId = app.ApplicationStatusId,
                StatusCode = code,
                StatusName = app.Status?.Name ?? code,
                ElectionTypeId = app.ElectionTypeId,
                MembershipTypeName = ResolveMembershipTypeName(app.FormDataJson, app.ElectionType?.Name),
                AppliedAt = app.SubmittedAt ?? app.CreatedAt,
                UpdatedAt = app.StageAAuthorizedAt ?? app.UpdatedAt,
                SectionsCompleted = CountCompletedSteps(app.CompletedStepsJson),
                TotalSections = 7,
                PaymentStatus = received ? "Fees received" : initiated ? "Payment initiated" : "Awaiting payment",
                PaymentStatusCode = received ? "PAID" : initiated ? "PENDING" : "UNPAID",
                PaymentReceiptNumber = snapshot.Receipt,
                PaymentAmount = snapshot.Amount,
                PaymentDate = snapshot.Date,
                PaymentLines = lines,
                SponsorStatus = sponsor ? "Complete" : "Pending",
                SponsorStatusCode = sponsor ? "COMPLETE" : "PENDING",
                EndorsementsCompleted = sponsor ? 2 : app.Endorsements.Count(e =>
                    !string.IsNullOrWhiteSpace(e.PersonalKnowledge)),
                EndorsementsRequired = 2,
                EntranceFeeAmount = app.EntranceFeeAmount,
                AnnualSubscriptionAmount = app.AnnualSubscriptionAmount,
                InterviewRequiredFlag = app.InterviewRequiredFlag,
                StageAReadyForManager = true,
                StageAPaymentsReady = received,
                CanAuthorizeToInterview = false,
                MemberDetailsComplete = MemberDetailsComplete(app.CompletedStepsJson),
                CommitteeMeetingId = assigned?.CommitteeMeetingId,
                CommitteeMeetingDate = assigned?.CommitteeMeeting?.MeetingDate.ToString("yyyy-MM-dd"),
                CommitteeMeetingName = assigned?.CommitteeMeeting?.MeetingName,
                CommitteeMeetingTime = assigned?.CommitteeMeeting?.MeetingTime,
                AssignedToMeeting = assigned?.CommitteeMeetingId != null,
            });
        }
        return Paging.FromList(rows, paging);
    }

    public async Task MarkStageAAuthorizedAsync(long applicationId, long? actorUserId, CancellationToken cancellationToken)
    {
        var app = await _db.Applications.FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app is null) return;
        if (app.StageAAuthorizedAt is not null) return;
        app.StageAAuthorizedAt = DateTime.UtcNow;
        app.StageAAuthorizedByUserId = actorUserId;
        app.UpdatedAt = DateTime.UtcNow;
        app.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<InterviewDto?> AssignToCommitteeMeetingAsync(
        long applicationId,
        AssignMeetingRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);

        if (request.CommitteeId <= 0)
            throw new InvalidOperationException("Select an existing committee.");

        var committee = await _db.Committees.FirstOrDefaultAsync(
            c => c.CommitteeId == request.CommitteeId && c.IsActive,
            cancellationToken)
            ?? throw new InvalidOperationException(
                "Selected committee was not found or is inactive. Create/activate it under Manage Committee first.");

        var app = await _db.Applications
            .Include(a => a.Status)
            .Include(a => a.Applicant)
            .Include(a => a.Interviews)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app is null) return null;

        var status = NormalizeStatusCode(app.Status?.Code);
        var eligible =
            string.Equals(status, "Interview", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "InterviewReview", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "Waitlist", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "ElectionReview", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "Committee", StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, "CommitteeReview", StringComparison.OrdinalIgnoreCase)
            || app.StageAAuthorizedAt is not null;
        if (!eligible)
            throw new InvalidOperationException(
                "Assign to meeting is available after the application has been authorized to interview.");

        var meetingTypeId = await EnsureInterviewMeetingTypeAsync(cancellationToken);
        var interview = app.Interviews.OrderByDescending(i => i.InterviewId).FirstOrDefault();
        CommitteeMeeting meeting;
        var meetingCreated = false;
        DateOnly meetingDate;
        string meetingTimeText;
        string displayName;

        if (request.CommitteeMeetingId is long existingMeetingId && existingMeetingId > 0)
        {
            meeting = await _db.CommitteeMeetings
                .FirstOrDefaultAsync(
                    m => m.CommitteeMeetingId == existingMeetingId
                         && m.CommitteeId == committee.CommitteeId,
                    cancellationToken)
                ?? throw new InvalidOperationException(
                    "Selected meeting was not found on that committee.");

            if (!string.Equals(meeting.Status, "SCHEDULED", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Only SCHEDULED meetings can receive interview assignments.");

            meetingDate = meeting.MeetingDate;
            meetingTimeText = string.IsNullOrWhiteSpace(meeting.MeetingTime) ? "10:00" : meeting.MeetingTime!;
            displayName = string.IsNullOrWhiteSpace(meeting.MeetingName)
                ? committee.CommitteeName
                : meeting.MeetingName!;
            meeting.UpdatedByUserId = actorUserId;
        }
        else
        {
            if (!DateOnly.TryParse(request.MeetingDate, out meetingDate))
                throw new InvalidOperationException("Enter a valid meeting date for the new sitting.");
            var timeText = (request.MeetingTime ?? "").Trim();
            if (!TimeOnly.TryParse(timeText, out var meetingTime))
                throw new InvalidOperationException("Enter a valid meeting time (HH:mm).");
            meetingTimeText = meetingTime.ToString("HH:mm");
            displayName = committee.CommitteeName;

            // Reuse the application's existing interview meeting row only if it already belongs to this committee.
            if (interview?.CommitteeMeetingId is long linkedId)
            {
                var linked = await _db.CommitteeMeetings
                    .FirstOrDefaultAsync(m => m.CommitteeMeetingId == linkedId, cancellationToken);
                if (linked is not null && linked.CommitteeId == committee.CommitteeId)
                {
                    meeting = linked;
                    meeting.MeetingName = displayName;
                    meeting.MeetingDate = meetingDate;
                    meeting.MeetingTime = meetingTimeText;
                    meeting.Status = "SCHEDULED";
                    meeting.MeetingTypeId = meetingTypeId;
                    meeting.UpdatedByUserId = actorUserId;
                }
                else
                {
                    meeting = new CommitteeMeeting
                    {
                        CommitteeId = committee.CommitteeId,
                        MeetingTypeId = meetingTypeId,
                        MeetingName = displayName,
                        MeetingDate = meetingDate,
                        MeetingTime = meetingTimeText,
                        Status = "SCHEDULED",
                        CreatedAt = DateTime.UtcNow,
                        CreatedByUserId = actorUserId
                    };
                    _db.CommitteeMeetings.Add(meeting);
                    meetingCreated = true;
                    await _db.SaveChangesAsync(cancellationToken);
                }
            }
            else
            {
                meeting = new CommitteeMeeting
                {
                    CommitteeId = committee.CommitteeId,
                    MeetingTypeId = meetingTypeId,
                    MeetingName = displayName,
                    MeetingDate = meetingDate,
                    MeetingTime = meetingTimeText,
                    Status = "SCHEDULED",
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = actorUserId
                };
                _db.CommitteeMeetings.Add(meeting);
                meetingCreated = true;
                await _db.SaveChangesAsync(cancellationToken);
            }
        }

        if (!TimeOnly.TryParse(meetingTimeText, out var parsedTime))
            parsedTime = new TimeOnly(10, 0);
        var scheduledAt = meetingDate.ToDateTime(parsedTime);

        if (interview is null)
        {
            interview = new Interview
            {
                ApplicationId = applicationId,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.Interviews.Add(interview);
        }

        interview.CommitteeMeetingId = meeting.CommitteeMeetingId;
        interview.ScheduledAt = scheduledAt;
        interview.Notes =
            $"Assigned to committee “{committee.CommitteeName}” — {displayName} on {meetingDate:yyyy-MM-dd} at {meetingTimeText}.";
        interview.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);

        await NotifyApplicantMeetingScheduledAsync(
            app,
            displayName,
            meetingDate,
            meetingTimeText,
            cancellationToken);

        return new InterviewDto
        {
            InterviewId = interview.InterviewId,
            ApplicationId = applicationId,
            CommitteeMeetingId = meeting.CommitteeMeetingId,
            CommitteeMeetingName = displayName,
            CommitteeMeetingDate = meetingDate.ToString("yyyy-MM-dd"),
            CommitteeMeetingTime = meetingTimeText,
            CommitteeMeetingStatus = meeting.Status,
            MeetingCreated = meetingCreated,
            ScheduledAt = interview.ScheduledAt,
            Notes = interview.Notes,
            CreatedAt = interview.CreatedAt,
            CreatedByUserId = interview.CreatedByUserId,
            UpdatedByUserId = interview.UpdatedByUserId
        };
    }

    private async Task<long> EnsureInterviewMeetingTypeAsync(CancellationToken cancellationToken)
    {
        var meetingType = await _db.MeetingTypes.FirstOrDefaultAsync(
            t => t.Code == "INTERVIEW" || t.Code == "COMMITTEE" || t.Code == "REGULAR",
            cancellationToken);
        if (meetingType is not null) return meetingType.MeetingTypeId;

        meetingType = new MeetingType
        {
            Code = "INTERVIEW",
            Name = "Interview",
            Description = "Membership interview sitting.",
            SortOrder = 4,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.MeetingTypes.Add(meetingType);
        await _db.SaveChangesAsync(cancellationToken);
        return meetingType.MeetingTypeId;
    }

    private async Task NotifyApplicantMeetingScheduledAsync(
        MApplication app,
        string meetingName,
        DateOnly meetingDate,
        string meetingTime,
        CancellationToken cancellationToken)
    {
        if (app.Applicant is null) return;
        var subject =
            $"Interview meeting scheduled: {meetingName} — {meetingDate:dd MMM yyyy} at {meetingTime}";
        var body =
            $"Your membership application {app.ApplicationNo} has been assigned to a committee meeting.\n\n" +
            $"Meeting: {meetingName}\n" +
            $"Date: {meetingDate:dddd, dd MMMM yyyy}\n" +
            $"Time: {meetingTime}\n\n" +
            $"Open your dashboard for details: {_app.PublicBaseUrl.TrimEnd('/')}/";

        // Always create a fresh notice when a meeting is (re)scheduled.
        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == "INTERVIEW_MEETING", cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = "INTERVIEW_MEETING",
                Name = "Interview meeting schedule",
                SortOrder = 25,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var email = app.Applicant.Email;
        var recipient = email ?? app.Applicant.ProfileId.ToString();
        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == app.Applicant.ProfileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);

        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = recipient,
            Channel = "IN_APP",
            SentDate = DateTime.UtcNow,
            Content = $"{subject}\n\n{body}",
            RelatedEntityType = "APPLICATION",
            RelatedEntityId = app.ApplicationId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(email))
            await _email.SendAsync(email, subject, body, cancellationToken);
    }

    private async Task<(long CommitteeId, long MeetingTypeId)> EnsureCommitteeMeetingLookupsAsync(
        CancellationToken cancellationToken)
    {
        var committee = await _db.Committees.FirstOrDefaultAsync(c => c.IsActive, cancellationToken);
        if (committee is null)
        {
            committee = new Entities.Committee.Committee
            {
                CommitteeName = "Membership Committee",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.Committees.Add(committee);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var meetingType = await _db.MeetingTypes.FirstOrDefaultAsync(
            t => t.Code == "COMMITTEE" || t.Code == "REGULAR",
            cancellationToken);
        if (meetingType is null)
        {
            meetingType = new MeetingType
            {
                Code = "COMMITTEE",
                Name = "Committee meeting",
                Description = "Regular committee meeting for membership interviews and business.",
                SortOrder = 1,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.MeetingTypes.Add(meetingType);
            await _db.SaveChangesAsync(cancellationToken);
        }

        return (committee.CommitteeId, meetingType.MeetingTypeId);
    }

    private ApplicationListItemDto ToQueueItem(MApplication app, ManagerReadinessDto readiness, string? code)
    {
        var name = string.Join(" ", new[] { app.Applicant.FirstName, app.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));
        var (paymentLabel, paymentCode) = PaymentBadge(readiness);
        var snapshot = PaymentSnapshot(readiness.PaymentLines);

        return new ApplicationListItemDto
        {
            ApplicationId = app.ApplicationId,
            ApplicationNo = app.ApplicationNo,
            ReferenceNumber = app.ApplicationNo,
            ApplicantProfileId = app.ApplicantProfileId,
            ApplicantName = name,
            ApplicationStatusId = app.ApplicationStatusId,
            StatusCode = code,
            StatusName = readiness.PaymentsReceived
                ? (app.Status?.Name ?? code)
                : readiness.PaymentsReady
                    ? "Payment initiated"
                    : "Awaiting entrance & annual fees",
            ElectionTypeId = app.ElectionTypeId,
            MembershipTypeName = ResolveMembershipTypeName(app.FormDataJson, app.ElectionType?.Name),
            AppliedAt = app.SubmittedAt ?? app.CreatedAt,
            UpdatedAt = app.UpdatedAt,
            SectionsCompleted = CountCompletedSteps(app.CompletedStepsJson),
            TotalSections = 7,
            PaymentStatus = paymentLabel,
            PaymentStatusCode = paymentCode,
            PaymentReceiptNumber = snapshot.Receipt,
            PaymentAmount = snapshot.Amount,
            PaymentDate = snapshot.Date,
            PaymentLines = readiness.PaymentLines,
            SponsorStatus = "Complete",
            SponsorStatusCode = "COMPLETE",
            EndorsementsCompleted = 2,
            EndorsementsRequired = 2,
            EntranceFeeAmount = app.EntranceFeeAmount,
            AnnualSubscriptionAmount = app.AnnualSubscriptionAmount,
            InterviewRequiredFlag = app.InterviewRequiredFlag,
            StageAReadyForManager = readiness.ReadyForManager,
            StageAPaymentsReady = readiness.PaymentsReceived,
            StageADocumentsReady = readiness.DocumentsReady,
            ClubVisitsLogged = readiness.ClubVisitsLogged,
            ClubVisitsMet = readiness.ClubVisitsMet,
            CanAuthorizeToInterview = readiness.CanProceedToInterview,
            MemberDetailsComplete = readiness.MemberDetailsComplete,
        };
    }

    private static string? NormalizeStatusCode(string? statusCode)
    {
        if (string.IsNullOrWhiteSpace(statusCode)) return statusCode;
        var raw = statusCode.Trim().ToUpperInvariant().Replace("-", "").Replace("_", "").Replace(" ", "");
        return raw switch
        {
            "DRAFT" => "Draft",
            "SUBMITTED" => "Submitted",
            "UNDERREVIEW" => "UnderReview",
            "ENDORSEMENT" => "Endorsement",
            "ENDORSEMENTREVIEW" => "EndorsementReview",
            "INTERVIEW" => "Interview",
            "INTERVIEWREVIEW" => "InterviewReview",
            "WAITLIST" or "WAITLISTED" => "Waitlist",
            "ELECTIONREVIEW" => "ElectionReview",
            "COMMITTEE" => "Committee",
            "COMMITTEEREVIEW" => "CommitteeReview",
            "APPROVED" => "Approved",
            "REJECTED" => "Rejected",
            "WITHDRAWN" or "EXCLUDED" => "Withdrawn",
            _ => statusCode,
        };
    }

    private async Task<ManagerReadinessDto> BuildReadinessAsync(MApplication app, CancellationToken cancellationToken)
    {
        var endorsementsComplete = AreEndorsementsComplete(app.Endorsements);
        var docs = app.AplicationDocuments.ToList();
        var hasCv = docs.Any(d => DocumentCodeIs(d, CvCodes) || DocumentNameContains(d, "cv", "curriculum"));
        var hasAnnualCheque = docs.Any(d => DocumentCodeIs(d, AnnualChequeCodes) || DocumentNameContains(d, "annual subscription cheque"))
            || FormHasPersonalFile(app.FormDataJson, "annualCheque");
        var hasJoiningCheque = docs.Any(d => DocumentCodeIs(d, JoiningChequeCodes) || DocumentNameContains(d, "joining / entrance fee cheque", "joining fee cheque", "entrance fee cheque"))
            || FormHasPersonalFile(app.FormDataJson, "joiningCheque");
        var feeChequesUploaded = hasAnnualCheque && hasJoiningCheque;
        var hasId = docs.Any(d => DocumentCodeIs(d, IdPassportCodes) || DocumentNameContains(d, "passport", "national id", "id copy"));
        var licenseRequired = PilotLicenseRequired(app.FormDataJson);
        var licenseLinked = await _db.MemberLicenses.AsNoTracking()
            .AnyAsync(
                l => l.ProfileId == app.ApplicantProfileId && l.IsActive && l.LicenseDocumentId != null,
                cancellationToken);
        var hasLicense = docs.Any(IsLicenseDocument)
            || licenseLinked
            || FormHasLicenseCopy(app.FormDataJson);

        var (joining, annual) = await LoadFeeLinesAsync(app.ApplicantProfileId, cancellationToken);
        // Uploaded annual + joining/entrance cheques represent payment for manager review.
        var joiningSatisfied = joining.Received || joining.Initiated || hasJoiningCheque;
        var annualSatisfied = annual.Received || annual.Initiated || hasAnnualCheque;
        var joiningReceivedOrCheque = joining.Received || hasJoiningCheque;
        var annualReceivedOrCheque = annual.Received || hasAnnualCheque;
        var paymentsReady = joiningSatisfied && annualSatisfied;
        var paymentsReceived = joiningReceivedOrCheque && annualReceivedOrCheque;
        var documentsReady = hasCv && hasId && (!licenseRequired || hasLicense);
        var memberDetailsComplete = MemberDetailsComplete(app.CompletedStepsJson);

        var pendingPayments = new List<string>();
        if (!joiningSatisfied) pendingPayments.Add("Entrance / joining fee");
        else if (!joiningReceivedOrCheque) pendingPayments.Add("Entrance / joining fee (not yet received)");
        if (!annualSatisfied) pendingPayments.Add("Annual subscription fee");
        else if (!annualReceivedOrCheque) pendingPayments.Add("Annual subscription fee (not yet received)");

        var pending = new List<string>();
        if (!endorsementsComplete) pending.Add("Both proposer and seconder endorsements");
        pending.AddRange(pendingPayments.Select(p => $"{p} payment"));
        if (!memberDetailsComplete) pending.Add("Complete member details on the application form");
        if (!hasCv) pending.Add("Upload CV");
        if (!hasId) pending.Add("Upload ID / Passport copy");
        if (!hasAnnualCheque) pending.Add("Upload annual subscription cheque");
        if (!hasJoiningCheque) pending.Add("Upload joining / entrance fee cheque");
        if (licenseRequired && !hasLicense) pending.Add("Upload pilot licence copy");

        var mergedVisits = await MergeClubVisitsAsync(app, cancellationToken);
        var logged = mergedVisits.Count;
        if (logged == 0 && app.ClubVisitsCount > 0) logged = app.ClubVisitsCount;
        var visitsMet = logged >= RequiredClubVisits || app.ClubVisitsOverride;

        var readyForManager = endorsementsComplete && paymentsReady;
        var canInterview = endorsementsComplete && paymentsReceived && memberDetailsComplete
            && documentsReady && visitsMet && feeChequesUploaded;

        var status = NormalizeStatusCode(app.Status?.Code);
        var visible = endorsementsComplete
            && (string.Equals(status, "Endorsement", StringComparison.OrdinalIgnoreCase)
                || string.Equals(status, "EndorsementReview", StringComparison.OrdinalIgnoreCase));

        return new ManagerReadinessDto
        {
            ApplicationId = app.ApplicationId,
            StatusCode = status,
            StatusName = app.Status?.Name,
            EndorsementsComplete = endorsementsComplete,
            EntranceFeeOk = joiningSatisfied,
            AnnualSubscriptionOk = annualSatisfied,
            CvUploaded = hasCv,
            IdPassportUploaded = hasId,
            AnnualChequeUploaded = hasAnnualCheque,
            JoiningChequeUploaded = hasJoiningCheque,
            FeeChequesUploaded = feeChequesUploaded,
            PilotLicenseRequired = licenseRequired,
            PilotLicenseUploaded = hasLicense,
            ReadyForManager = readyForManager,
            PaymentsReady = paymentsReady,
            PaymentsReceived = paymentsReceived,
            MemberDetailsComplete = memberDetailsComplete,
            PaymentLines = [ToPaymentLineDto(joining), ToPaymentLineDto(annual)],
            DocumentsReady = documentsReady,
            PendingItems = pending,
            PendingPaymentItems = pendingPayments,
            ClubVisitsLogged = logged,
            ClubVisitsRequired = RequiredClubVisits,
            ClubVisitsMet = visitsMet,
            ClubVisitsOverride = app.ClubVisitsOverride,
            ClubVisitsOverrideReason = app.ClubVisitsOverrideReason,
            CanProceedToInterview = canInterview,
            VisibleToManager = visible
        };
    }

    private static string? ResolveMembershipTypeName(string? formJson, string? electionTypeName)
    {
        if (!string.IsNullOrWhiteSpace(formJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(formJson);
                if (doc.RootElement.TryGetProperty("membership", out var mem)
                    && mem.TryGetProperty("membershipType", out var mt))
                {
                    var raw = mt.GetString();
                    if (!string.IsNullOrWhiteSpace(raw))
                        return raw.Trim() + (raw.Contains("Membership", StringComparison.OrdinalIgnoreCase) ? "" : " Membership");
                }
            }
            catch { /* ignore */ }
        }
        return electionTypeName;
    }

    private sealed class FeeLine
    {
        public string FeeCode { get; set; } = "";
        public string FeeLabel { get; set; } = "";
        public bool Initiated { get; set; }
        public bool Received { get; set; }
        public decimal Amount { get; set; }
        public string? ReceiptNumber { get; set; }
        public DateOnly? PaymentDate { get; set; }
        public string? Status { get; set; }
    }

    private async Task<(FeeLine Joining, FeeLine Annual)> LoadFeeLinesAsync(
        long profileId, CancellationToken cancellationToken)
    {
        var accountIds = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => a.AccountId)
            .ToListAsync(cancellationToken);

        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.FeeType)
            .Include(t => t.PaymentStatus)
            .Include(t => t.Receipt)
            .Where(t =>
                t.ProfileId == profileId
                || (t.AccountId != null && accountIds.Contains(t.AccountId.Value)))
            .ToListAsync(cancellationToken);

        var txIds = txs.Select(t => t.TransactionId).ToList();
        var receiptRows = txIds.Count == 0
            ? []
            : await _db.Receipts.AsNoTracking()
                .Where(r => txIds.Contains(r.TransactionId))
                .Select(r => new { r.TransactionId, r.ReceiptNumber })
                .ToListAsync(cancellationToken);
        var receipts = receiptRows
            .GroupBy(r => r.TransactionId)
            .ToDictionary(g => g.Key, g => g.First().ReceiptNumber);

        var joining = PickFeeLine(txs, receipts, "JOINING", "Entrance / joining");
        var annual = PickFeeLine(txs, receipts, "ANNUAL", "Annual subscription");
        if (joining.Amount == 0 && annual.Amount == 0 && txs.Count > 0)
        {
            var ordered = txs.OrderByDescending(t => t.PaymentDate).ThenByDescending(t => t.TransactionId).ToList();
            joining = LineFromTransaction(ordered[0], receipts, "JOINING",
                ordered[0].FeeType?.Name ?? "Entrance / joining");
            if (ordered.Count > 1)
                annual = LineFromTransaction(ordered[1], receipts, "ANNUAL",
                    ordered[1].FeeType?.Name ?? "Annual subscription");
        }

        return (joining, annual);
    }

    private static FeeLine PickFeeLine(
        List<Entities.Subscriptions.MTransaction> txs,
        IReadOnlyDictionary<long, string> receipts,
        string feeCode,
        string label)
    {
        var matches = txs
            .Where(t => MatchesFee(t, feeCode))
            .OrderByDescending(t => t.PaymentDate)
            .ThenByDescending(t => t.TransactionId)
            .ToList();
        var received = matches.FirstOrDefault(t =>
            t.PaymentStatus != null && PaymentReceivedStatuses.Contains(NormalizePay(t.PaymentStatus.Code)));
        var initiated = matches.Any(t =>
            t.PaymentStatus != null && PaymentOkStatuses.Contains(NormalizePay(t.PaymentStatus.Code)));
        var shown = received ?? matches.FirstOrDefault();
        string? receiptNo = null;
        if (shown is not null)
        {
            receiptNo = shown.Receipt?.ReceiptNumber;
            if (string.IsNullOrWhiteSpace(receiptNo))
                receipts.TryGetValue(shown.TransactionId, out receiptNo);
        }
        return new FeeLine
        {
            FeeCode = feeCode,
            FeeLabel = label,
            Initiated = initiated,
            Received = received != null,
            Amount = shown?.Amount ?? 0,
            ReceiptNumber = receiptNo,
            PaymentDate = shown?.PaymentDate,
            Status = shown?.PaymentStatus?.Name
        };
    }

    private static FeeLine LineFromTransaction(
        Entities.Subscriptions.MTransaction tx,
        IReadOnlyDictionary<long, string> receipts,
        string feeCode,
        string label)
    {
        receipts.TryGetValue(tx.TransactionId, out var receiptNo);
        var code = NormalizePay(tx.PaymentStatus?.Code);
        return new FeeLine
        {
            FeeCode = feeCode,
            FeeLabel = label,
            Initiated = PaymentOkStatuses.Contains(code),
            Received = PaymentReceivedStatuses.Contains(code),
            Amount = tx.Amount,
            ReceiptNumber = tx.Receipt?.ReceiptNumber ?? receiptNo,
            PaymentDate = tx.PaymentDate,
            Status = tx.PaymentStatus?.Name
        };
    }

    private static bool MatchesFee(Entities.Subscriptions.MTransaction t, string feeCode)
    {
        var code = t.FeeType?.Code ?? "";
        var name = t.FeeType?.Name ?? "";
        var hay = $"{code} {name}";
        if (t.FeeType == null) return false;
        if (string.Equals(code, feeCode, StringComparison.OrdinalIgnoreCase)) return true;
        if (code.Contains(feeCode, StringComparison.OrdinalIgnoreCase)) return true;
        if (feeCode == "JOINING" && (hay.Contains("JOIN", StringComparison.OrdinalIgnoreCase)
            || hay.Contains("ENTRANCE", StringComparison.OrdinalIgnoreCase)))
            return true;
        if (feeCode == "ANNUAL" && (hay.Contains("ANNUAL", StringComparison.OrdinalIgnoreCase)
            || hay.Contains("SUBSCR", StringComparison.OrdinalIgnoreCase)))
            return true;
        return false;
    }

    private static ApplicationPaymentLineDto ToPaymentLineDto(FeeLine line) => new()
    {
        FeeCode = line.FeeCode,
        FeeLabel = line.FeeLabel,
        Amount = line.Amount,
        ReceiptNumber = line.ReceiptNumber,
        PaymentDate = line.PaymentDate?.ToString("yyyy-MM-dd"),
        Status = line.Status,
        Received = line.Received
    };

    private static (string? Receipt, decimal? Amount, string? Date) PaymentSnapshot(
        IReadOnlyList<ApplicationPaymentLineDto> lines)
    {
        var withReceipt = lines.FirstOrDefault(l => !string.IsNullOrWhiteSpace(l.ReceiptNumber));
        var total = lines.Sum(l => l.Amount);
        var date = lines
            .Select(l => l.PaymentDate)
            .Where(d => !string.IsNullOrWhiteSpace(d))
            .OrderByDescending(d => d)
            .FirstOrDefault();
        return (withReceipt?.ReceiptNumber, total > 0 ? total : null, date);
    }

    private static (string Label, string Code) PaymentBadge(ManagerReadinessDto readiness)
    {
        if (readiness.PaymentsReceived) return ("Fees received", "PAID");
        if (readiness.PaymentsReady) return ("Payment initiated", "PENDING");
        return ("Awaiting payment", "UNPAID");
    }

    private static int CountCompletedSteps(string? completedJson)
    {
        if (string.IsNullOrWhiteSpace(completedJson)) return 0;
        try
        {
            return JsonSerializer.Deserialize<List<string>>(completedJson)?.Count ?? 0;
        }
        catch (JsonException)
        {
            return 0;
        }
    }

    private static bool MemberDetailsComplete(string? completedJson) =>
        CountCompletedSteps(completedJson) >= 7;

    private static string NormalizePay(string? code) =>
        (code ?? "").Trim().ToUpperInvariant().Replace(' ', '_').Replace('-', '_');

    private static bool AreEndorsementsComplete(IEnumerable<Endorsement> endorsements)
    {
        static bool Complete(Endorsement e) =>
            !string.IsNullOrWhiteSpace(e.PersonalKnowledge)
            && !string.IsNullOrWhiteSpace(e.ProfessionalKnowledge)
            && !string.IsNullOrWhiteSpace(e.ValueAddition);

        var list = endorsements.ToList();
        var proposer = list.Where(e => string.Equals(e.EndorserRole, "PROPOSER", StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(e.EndorserRole, "Proposer", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(e => e.EndorsementId)
            .FirstOrDefault();
        var seconder = list.Where(e => string.Equals(e.EndorserRole, "SECONDER", StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(e.EndorserRole, "Seconder", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(e => e.EndorsementId)
            .FirstOrDefault();
        return proposer is not null && Complete(proposer) && seconder is not null && Complete(seconder);
    }

    private static bool PilotLicenseRequired(string? formJson)
    {
        if (string.IsNullOrWhiteSpace(formJson)) return false;
        try
        {
            using var doc = JsonDocument.Parse(formJson);
            if (!doc.RootElement.TryGetProperty("aviation", out var av)) return false;
            if (av.TryGetProperty("holdsLicense", out var hl) && hl.ValueKind == JsonValueKind.True) return true;
            if (av.TryGetProperty("licenses", out var licenses) && licenses.ValueKind == JsonValueKind.Array && licenses.GetArrayLength() > 0)
                return true;
        }
        catch { /* ignore */ }
        return false;
    }

    private static bool FormHasLicenseCopy(string? formJson)
    {
        if (string.IsNullOrWhiteSpace(formJson)) return false;
        try
        {
            using var doc = JsonDocument.Parse(formJson);
            if (!doc.RootElement.TryGetProperty("aviation", out var av)) return false;
            if (av.TryGetProperty("licenseFile", out var file) && file.ValueKind == JsonValueKind.Object)
            {
                if (file.TryGetProperty("fileName", out var name) && !string.IsNullOrWhiteSpace(name.GetString()))
                    return true;
                if (file.TryGetProperty("url", out var url) && !string.IsNullOrWhiteSpace(url.GetString()))
                    return true;
            }
        }
        catch { /* ignore */ }
        return false;
    }

    private static bool FormHasPersonalFile(string? formJson, string field)
    {
        if (string.IsNullOrWhiteSpace(formJson) || string.IsNullOrWhiteSpace(field)) return false;
        try
        {
            using var doc = JsonDocument.Parse(formJson);
            if (!doc.RootElement.TryGetProperty("personal", out var personal)) return false;
            if (!personal.TryGetProperty(field, out var file) || file.ValueKind != JsonValueKind.Object) return false;
            if (file.TryGetProperty("fileName", out var name) && !string.IsNullOrWhiteSpace(name.GetString()))
                return true;
            if (file.TryGetProperty("url", out var url) && !string.IsNullOrWhiteSpace(url.GetString()))
                return true;
        }
        catch { /* ignore */ }
        return false;
    }

    private static bool IsLicenseDocument(AplicationDocument d)
    {
        if (DocumentCodeIs(d, LicenseCodes)) return true;
        if (DocumentNameContains(d, "licen")) return true;
        return d.DocumentTypeId == 3;
    }

    private static bool DocumentCodeIs(AplicationDocument d, string[] codes)
    {
        var code = d.DocumentType?.Code;
        return !string.IsNullOrWhiteSpace(code) && codes.Contains(code, StringComparer.OrdinalIgnoreCase);
    }

    private static bool DocumentNameContains(AplicationDocument d, params string[] needles)
    {
        var name = d.DocumentType?.Name ?? "";
        return needles.Any(n => name.Contains(n, StringComparison.OrdinalIgnoreCase));
    }

    private async Task NotifyApplicantPaymentRequiredAsync(
        long applicationId,
        ManagerReadinessDto readiness,
        CancellationToken cancellationToken)
    {
        var app = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app?.Applicant is null) return;

        var fees = string.Join(" and ", readiness.PendingPaymentItems);
        var subject = $"Payment required for {app.ApplicationNo} — Submit to Manager";
        var body =
            $"Your proposer and seconder have completed their recommendations for application {app.ApplicationNo}.\n\n" +
            $"To submit to the General Manager, please make (or initiate) payment for: {fees}.\n\n" +
            $"Pay here: {_app.PublicBaseUrl.TrimEnd('/')}/payment\n" +
            $"Once fees are recorded, the manager will be notified to verify your application.";

        await UpsertNotificationAsync(
            "APPLICATION_PAYMENT_REQUIRED",
            "Entrance / subscription payment required",
            app.Applicant.ProfileId,
            app.Applicant.Email,
            subject,
            body,
            applicationId,
            cancellationToken);
    }

    private async Task NotifyApplicantPendingAsync(long applicationId, ManagerReadinessDto readiness, CancellationToken cancellationToken)
    {
        var app = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app?.Applicant is null) return;

        var subject = $"Complete remaining items for {app.ApplicationNo} before manager review";
        var body =
            $"Your proposer and seconder have endorsed your application ({app.ApplicationNo}).\n\n" +
            $"Before it can be submitted to the General Manager, please complete:\n- {string.Join("\n- ", readiness.PendingItems)}\n\n" +
            $"Open your portal: {_app.PublicBaseUrl.TrimEnd('/')}/applications";

        await UpsertNotificationAsync(
            "APPLICATION_PENDING_ITEMS",
            "Application pending items",
            app.Applicant.ProfileId,
            app.Applicant.Email,
            subject,
            body,
            applicationId,
            cancellationToken);
    }

    private async Task NotifyManagersAsync(long applicationId, CancellationToken cancellationToken)
    {
        var app = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app is null) return;

        var applicantName = string.Join(" ", new[] { app.Applicant.FirstName, app.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));
        var subject = $"Stage A — Submit to Manager: {applicantName} ({app.ApplicationNo})";
        var body =
            $"{applicantName}'s application {app.ApplicationNo} has both endorsements and entrance + annual fees recorded.\n\n" +
            $"Please verify: applicant documents & details, proposer/seconder recommendations, payment status, and at least 3 club visits (who accompanied them).\n" +
            $"After verification, authorize to the Interview stage.\n\n" +
            $"{_app.PublicBaseUrl.TrimEnd('/')}/members/{applicationId}";

        var managers = await _db.UserAccounts.AsNoTracking()
            .Include(u => u.Profile)
            .Include(u => u.UserRoles).ThenInclude(r => r.Role)
            .Where(u => u.IsActive && u.AccountStatus == "ACTIVE")
            .Where(u => u.UserRoles.Any(r =>
                r.Role.IsActive &&
                (r.Role.Code == "GENERAL_MANAGER" || r.Role.Code == "ADMIN" || r.Role.Code == "CHAIRMAN")))
            .ToListAsync(cancellationToken);

        foreach (var manager in managers)
        {
            await UpsertNotificationAsync(
                "MANAGER_STAGE_A",
                "Submit to Manager",
                manager.ProfileId,
                manager.Profile.Email,
                subject,
                body,
                applicationId,
                cancellationToken);
        }
    }

    public async Task SendManagerRequestAsync(
        long applicationId,
        ManagerItemRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var kind = (request.RequestType ?? "").Trim().ToLowerInvariant();
        if (kind is not ("payment" or "documents" or "endorsements" or "details"))
            throw new InvalidOperationException("Request type must be payment, documents, endorsements, or details.");

        var app = await _db.Applications
            .Include(a => a.Applicant)
            .Include(a => a.Proposer)
            .Include(a => a.Seconder)
            .Include(a => a.Endorsements)
            .Include(a => a.AplicationDocuments).ThenInclude(d => d.DocumentType)
            .Include(a => a.Status)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");
        if (app.Applicant is null)
            throw new InvalidOperationException("Applicant profile was not found.");

        var readiness = await BuildReadinessAsync(app, cancellationToken);
        var extra = string.IsNullOrWhiteSpace(request.Message) ? "" : $"\n\nManager note: {request.Message.Trim()}";
        var portal = (_app.PublicBaseUrl ?? "http://localhost:8080").TrimEnd('/');
        var name = string.Join(" ", new[] { app.Applicant.FirstName, app.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));

        if (kind == "payment")
        {
            var fees = readiness.PendingPaymentItems.Count > 0
                ? string.Join(" and ", readiness.PendingPaymentItems)
                : "entrance / joining fee and annual subscription";
            var subject = $"Payment requested for {app.ApplicationNo}";
            var body =
                $"The General Manager requested payment on application {app.ApplicationNo}.\n\n" +
                $"Please pay: {fees}.\nPay here: {portal}/payment\n" +
                $"Your existing application stays in place — you are not starting over." + extra;
            await PushNotificationAsync(
                "MANAGER_PAYMENT_REQUEST",
                "Payment requested",
                app.Applicant.ProfileId,
                app.Applicant.Email,
                subject,
                body,
                applicationId,
                cancellationToken);
            return;
        }

        if (kind == "documents")
        {
            var missing = new List<string>();
            if (!readiness.CvUploaded) missing.Add("CV");
            if (!readiness.IdPassportUploaded) missing.Add("ID / Passport copy");
            if (readiness.PilotLicenseRequired && !readiness.PilotLicenseUploaded) missing.Add("Pilot licence copy");
            var docs = missing.Count > 0 ? string.Join(", ", missing) : "required application documents";
            var subject = $"Documents requested for {app.ApplicationNo}";
            var body =
                $"The General Manager requested documents on application {app.ApplicationNo}.\n\n" +
                $"Please upload: {docs}.\nUpload here: {portal}/documents\n" +
                $"This updates the application you already submitted." + extra;
            await PushNotificationAsync(
                "MANAGER_DOCUMENT_REQUEST",
                "Documents requested",
                app.Applicant.ProfileId,
                app.Applicant.Email,
                subject,
                body,
                applicationId,
                cancellationToken);
            return;
        }

        if (kind == "details")
        {
            var pending = readiness.PendingItems.Count > 0
                ? string.Join("\n- ", readiness.PendingItems)
                : "additional details requested by the manager";
            var subject = $"More details requested for {app.ApplicationNo}";
            var body =
                $"The General Manager requested more information on application {app.ApplicationNo}.\n\n" +
                $"Please complete:\n- {pending}\n\n" +
                $"Update your existing application here (do not start a new one): {portal}/application" + extra;
            await PushNotificationAsync(
                "MANAGER_DETAILS_REQUEST",
                "Details requested",
                app.Applicant.ProfileId,
                app.Applicant.Email,
                subject,
                body,
                applicationId,
                cancellationToken);
            return;
        }

        // endorsements — applicant + named proposer/seconder
        var applicantSubject = $"Sponsor recommendations requested for {app.ApplicationNo}";
        var applicantBody =
            $"The General Manager requested proposer and seconder recommendations on application {app.ApplicationNo}.\n\n" +
            $"Ask your named proposer and seconder to complete their statements in the member portal.\n" +
            $"You can also update this same application: {portal}/application" + extra;
        await PushNotificationAsync(
            "MANAGER_ENDORSEMENT_REQUEST",
            "Sponsor recommendations requested",
            app.Applicant.ProfileId,
            app.Applicant.Email,
            applicantSubject,
            applicantBody,
            applicationId,
            cancellationToken);

        await NotifyEndorserFollowUpAsync(app.ProposerProfileId, app.Proposer?.Email, "Proposer", name, app.ApplicationNo, applicationId, extra, cancellationToken);
        await NotifyEndorserFollowUpAsync(app.SeconderProfileId, app.Seconder?.Email, "Seconder", name, app.ApplicationNo, applicationId, extra, cancellationToken);
        _ = actorUserId;
    }

    public async Task NotifyApplicantRejectedAsync(long applicationId, string reason, CancellationToken cancellationToken)
    {
        var app = await _db.Applications
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app?.Applicant is null) return;

        var name = string.Join(" ", new[] { app.Applicant.Title, app.Applicant.FirstName, app.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));
        await _decisions.NotifyAsync(new ApplicationDecisionMessage
        {
            Kind = ApplicationDecisionKind.Rejected,
            ApplicationId = app.ApplicationId,
            ApplicationNo = app.ApplicationNo,
            ApplicantName = name,
            ApplicantProfileId = app.ApplicantProfileId,
            ApplicantEmail = app.Applicant.Email,
            StageName = app.Status?.Name ?? "",
            IsFinal = true,
            Reason = reason,
            ReturnedStageName = app.Status?.Name,
            PreviousHandlerUserId = app.CurrentHandlerUserId
        }, cancellationToken);
    }

    private async Task NotifyEndorserFollowUpAsync(
        long? profileId,
        string? email,
        string role,
        string applicantName,
        string applicationNo,
        long applicationId,
        string extra,
        CancellationToken cancellationToken)
    {
        if (profileId is null or 0) return;
        var profile = await _db.Profiles.AsNoTracking().FirstOrDefaultAsync(p => p.ProfileId == profileId, cancellationToken);
        if (profile is null) return;
        var portal = (_app.PublicBaseUrl ?? "http://localhost:8080").TrimEnd('/');
        var subject = $"Follow-up: complete your {role} recommendation for {applicantName}";
        var body =
            $"The General Manager asked you to complete your {role} recommendation for {applicantName} ({applicationNo}).\n\n" +
            $"Open endorsements: {portal}/endorsements" + extra;
        await PushNotificationAsync(
            "MANAGER_ENDORSEMENT_FOLLOWUP",
            "Sponsor follow-up",
            profile.ProfileId,
            email ?? profile.Email,
            subject,
            body,
            applicationId,
            cancellationToken);
    }

    private async Task PushNotificationAsync(
        string typeCode,
        string typeName,
        long profileId,
        string? email,
        string subject,
        string body,
        long applicationId,
        CancellationToken cancellationToken)
    {
        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == typeCode, cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = typeCode,
                Name = typeName,
                SortOrder = 31,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var recipient = !string.IsNullOrWhiteSpace(email) ? email! : profileId.ToString();
        var since = DateTime.UtcNow.AddMinutes(-2);
        var already = await _db.Notifications.AnyAsync(n =>
            n.RelatedEntityType == "APPLICATION"
            && n.RelatedEntityId == applicationId
            && n.NotificationTypeId == type.NotificationTypeId
            && n.Recipient == recipient
            && n.CreatedAt >= since, cancellationToken);
        if (already) return;

        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);

        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = recipient,
            Channel = "IN_APP",
            SentDate = DateTime.UtcNow,
            Content = $"{subject}\n\n{body}",
            RelatedEntityType = "APPLICATION",
            RelatedEntityId = applicationId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(email))
        {
            try { await _email.SendAsync(email, subject, body, cancellationToken); }
            catch { /* keep manager action even if SMTP is down */ }
        }
    }

    private async Task UpsertNotificationAsync(
        string typeCode,
        string typeName,
        long profileId,
        string? email,
        string subject,
        string body,
        long applicationId,
        CancellationToken cancellationToken)
    {
        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == typeCode, cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = typeCode,
                Name = typeName,
                SortOrder = 30,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var recipient = email ?? profileId.ToString();
        var since = DateTime.UtcNow.AddDays(-1);
        var already = await _db.Notifications.AnyAsync(n =>
            n.RelatedEntityType == "APPLICATION"
            && n.RelatedEntityId == applicationId
            && n.NotificationTypeId == type.NotificationTypeId
            && n.Recipient == recipient
            && n.CreatedAt >= since, cancellationToken);
        if (already) return;

        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);

        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = recipient,
            Channel = "IN_APP",
            SentDate = DateTime.UtcNow,
            Content = subject,
            RelatedEntityType = "APPLICATION",
            RelatedEntityId = applicationId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(email))
            await _email.SendAsync(email, subject, body, cancellationToken);
    }

    private async Task<List<ApplicationClubVisitDto>> MergeClubVisitsAsync(
        MApplication app,
        CancellationToken cancellationToken)
    {
        var applicant = app.Applicant
            ?? await _db.Profiles.AsNoTracking()
                .FirstOrDefaultAsync(p => p.ProfileId == app.ApplicantProfileId, cancellationToken);

        var reception = await LoadReceptionClubVisitsAsync(app.ApplicationId, app.ApplicantProfileId, applicant, cancellationToken);
        var receptionDates = reception.Select(v => v.VisitDate).ToHashSet();

        var manuals = (app.ClubVisits ?? [])
            .Where(v => reception.Count == 0 || !receptionDates.Contains(v.VisitDate))
            .Select(v => new ApplicationClubVisitDto
            {
                ApplicationClubVisitId = v.ApplicationClubVisitId,
                ApplicationId = v.ApplicationId,
                VisitDate = v.VisitDate,
                MetWith = v.MetWith,
                Notes = v.Notes,
                CreatedAt = v.CreatedAt,
                CreatedByUserId = v.CreatedByUserId
            });

        return reception
            .Concat(manuals)
            .OrderByDescending(v => v.VisitDate)
            .ThenByDescending(v => v.ApplicationClubVisitId)
            .ToList();
    }

    private async Task<List<ApplicationClubVisitDto>> LoadReceptionClubVisitsAsync(
        long applicationId,
        long applicantProfileId,
        MProfile? applicant,
        CancellationToken cancellationToken)
    {
        var guestIds = await FindGuestIdsForApplicantAsync(applicantProfileId, applicant, cancellationToken);
        if (guestIds.Count == 0) return [];

        var rows = await _db.Visits.AsNoTracking()
            .Where(v => guestIds.Contains(v.GuestId))
            .OrderByDescending(v => v.VisitDate)
            .ThenByDescending(v => v.TimeIn)
            .ThenByDescending(v => v.VisitId)
            .Select(v => new
            {
                v.VisitId,
                v.VisitDate,
                v.TimeIn,
                v.CreatedAt,
                v.CreatedByUserId,
                v.Notes,
                v.GuestBookEntryNo,
                Slip = v.Guest.VisitSlipCode,
                MemberName = ((v.Visitor.FirstName ?? "") + " " + (v.Visitor.LastName ?? "")).Trim()
            })
            .ToListAsync(cancellationToken);

        return rows.Select(v =>
        {
            var when = v.TimeIn is TimeOnly t ? t.ToString("HH\\:mm") : null;
            var extra = new List<string>();
            if (!string.IsNullOrWhiteSpace(when)) extra.Add($"in {when}");
            if (!string.IsNullOrWhiteSpace(v.Slip)) extra.Add(v.Slip);
            if (!string.IsNullOrWhiteSpace(v.GuestBookEntryNo)) extra.Add($"book {v.GuestBookEntryNo}");
            var reason = string.IsNullOrWhiteSpace(v.Notes) ? null : v.Notes.Trim();
            var meta = extra.Count == 0 ? null : string.Join(" · ", extra);
            var notes = reason is null && meta is null
                ? "Logged at reception"
                : reason is null
                    ? meta
                    : meta is null
                        ? reason
                        : $"{reason} ({meta})";
            var met = string.IsNullOrWhiteSpace(v.MemberName) ? "Reception" : v.MemberName;
            return new ApplicationClubVisitDto
            {
                ApplicationClubVisitId = -v.VisitId,
                ApplicationId = applicationId,
                VisitDate = v.VisitDate,
                MetWith = met,
                Notes = notes,
                CreatedAt = v.CreatedAt,
                CreatedByUserId = v.CreatedByUserId
            };
        }).ToList();
    }

    private async Task<List<long>> FindGuestIdsForApplicantAsync(
        long applicantProfileId,
        MProfile? applicant,
        CancellationToken cancellationToken)
    {
        var linked = await _db.Guests.AsNoTracking()
            .Where(g => g.IsActive && g.GuestProfileId == applicantProfileId)
            .Select(g => g.GuestId)
            .ToListAsync(cancellationToken);
        if (linked.Count > 0) return linked;

        if (applicant is null) return [];

        var first = (applicant.FirstName ?? "").Trim();
        var last = (applicant.LastName ?? "").Trim();
        var phone = applicant.Mobile;
        var phoneDigits = PhoneDigits(phone);

        var query = _db.Guests.AsNoTracking().Where(g => g.IsActive);
        if (!string.IsNullOrWhiteSpace(first) || !string.IsNullOrWhiteSpace(last))
        {
            query = query.Where(g =>
                (!string.IsNullOrWhiteSpace(first) && g.GuestName.Contains(first))
                || (!string.IsNullOrWhiteSpace(last) && g.GuestName.Contains(last)));
        }

        var candidates = await query
            .Select(g => new { g.GuestId, g.GuestName, g.Phone, g.GuestProfileId })
            .ToListAsync(cancellationToken);

        var matched = candidates.Where(g =>
            GuestNameMatchesProfile(g.GuestName, first, last)
            && (g.GuestProfileId is null || g.GuestProfileId == applicantProfileId)
            && (string.IsNullOrWhiteSpace(phoneDigits) || PhonesMatch(g.Phone, phone)))
            .Select(g => g.GuestId)
            .Distinct()
            .ToList();

        if (matched.Count == 0 && phoneDigits.Length >= 9)
        {
            matched = candidates
                .Where(g => PhonesMatch(g.Phone, phone) && (g.GuestProfileId is null || g.GuestProfileId == applicantProfileId))
                .Select(g => g.GuestId)
                .Distinct()
                .ToList();
        }

        if (matched.Count == 1)
        {
            var guestId = matched[0];
            var guest = await _db.Guests.FirstOrDefaultAsync(g => g.GuestId == guestId && g.GuestProfileId == null, cancellationToken);
            if (guest is not null)
            {
                guest.GuestProfileId = applicantProfileId;
                await _db.SaveChangesAsync(cancellationToken);
            }
        }

        return matched;
    }

    private static bool GuestNameMatchesProfile(string guestName, string first, string last)
    {
        var g = NormalizePersonName(guestName);
        if (g.Length == 0) return false;
        var a = NormalizePersonName($"{first} {last}");
        var b = NormalizePersonName($"{last} {first}");
        return g == a || g == b || (!string.IsNullOrEmpty(a) && (g.Contains(a) || a.Contains(g)));
    }

    private static string NormalizePersonName(string value) =>
        string.Join(' ', (value ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();

    private static bool PhonesMatch(string? left, string? right)
    {
        var a = PhoneDigits(left);
        var b = PhoneDigits(right);
        if (a.Length == 0 || b.Length == 0) return false;
        if (a.Length >= 9) a = a[^9..];
        if (b.Length >= 9) b = b[^9..];
        return a == b;
    }

    private static string PhoneDigits(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "" : new string(value.Where(char.IsDigit).ToArray());
}
