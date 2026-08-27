using System.Text.Json;
using ClubManagement.Data.MembershipApplication;
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
    Task<IReadOnlyList<ApplicationListItemDto>> ListManagerQueueAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<ApplicationListItemDto>> ListStageAHistoryAsync(CancellationToken cancellationToken);
    Task MarkStageAAuthorizedAsync(long applicationId, long? actorUserId, CancellationToken cancellationToken);
    Task<InterviewDto?> AssignToCommitteeMeetingAsync(
        long applicationId,
        AssignMeetingRequest request,
        long? actorUserId,
        CancellationToken cancellationToken);
}

public class ManagerStageService : IManagerStageService
{
    public const int RequiredClubVisits = 3;

    private static readonly string[] IdPassportCodes = ["ID_PASSPORT", "ID", "PASSPORT", "NATIONAL_ID", "ID_COPY"];
    private static readonly string[] CvCodes = ["CV", "CURRICULUM_VITAE"];
    private static readonly string[] LicenseCodes = ["LICENSE", "LICENCE", "PILOT_LICENSE", "PILOT_LICENCE"];
    private static readonly HashSet<string> PaymentOkStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "PENDING", "PAID", "PARTIALLY_PAID", "WAIVED", "PARTIAL", "INITIATED"
    };

    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailSender _email;
    private readonly AppPublicOptions _app;

    public ManagerStageService(
        ApplicationModuleDbContext db,
        IEmailSender email,
        IOptions<AppPublicOptions> app)
    {
        _db = db;
        _email = email;
        _app = app.Value;
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
        if (!readiness.CanProceedToInterview)
            throw new InvalidOperationException(
                "Manager verification incomplete. Confirm documents, payments, sponsor recommendations and club visits before authorizing to interview.");
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
        return await _db.ApplicationClubVisits.AsNoTracking()
            .Where(v => v.ApplicationId == applicationId)
            .OrderByDescending(v => v.VisitDate)
            .ThenByDescending(v => v.ApplicationClubVisitId)
            .Select(v => new ApplicationClubVisitDto
            {
                ApplicationClubVisitId = v.ApplicationClubVisitId,
                ApplicationId = v.ApplicationId,
                VisitDate = v.VisitDate,
                MetWith = v.MetWith,
                Notes = v.Notes,
                CreatedAt = v.CreatedAt,
                CreatedByUserId = v.CreatedByUserId
            })
            .ToListAsync(cancellationToken);
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

    public async Task<IReadOnlyList<ApplicationListItemDto>> ListManagerQueueAsync(CancellationToken cancellationToken)
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
        return queue;
    }

    public async Task<IReadOnlyList<ApplicationListItemDto>> ListStageAHistoryAsync(CancellationToken cancellationToken)
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

        return apps.Select(app =>
        {
            var code = NormalizeStatusCode(app.Status?.Code) ?? app.Status?.Code;
            var name = string.Join(" ", new[] { app.Applicant.FirstName, app.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));
            var sponsor = AreEndorsementsComplete(app.Endorsements);
            var assigned = app.Interviews
                .Where(i => i.CommitteeMeetingId != null)
                .OrderByDescending(i => i.InterviewId)
                .FirstOrDefault();
            return new ApplicationListItemDto
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
                SponsorStatus = sponsor ? "Complete" : "Pending",
                SponsorStatusCode = sponsor ? "COMPLETE" : "PENDING",
                EndorsementsCompleted = sponsor ? 2 : app.Endorsements.Count(e =>
                    !string.IsNullOrWhiteSpace(e.PersonalKnowledge)),
                EndorsementsRequired = 2,
                EntranceFeeAmount = app.EntranceFeeAmount,
                AnnualSubscriptionAmount = app.AnnualSubscriptionAmount,
                InterviewRequiredFlag = app.InterviewRequiredFlag,
                StageAReadyForManager = true,
                CanAuthorizeToInterview = false,
                CommitteeMeetingId = assigned?.CommitteeMeetingId,
                CommitteeMeetingDate = assigned?.CommitteeMeeting?.MeetingDate.ToString("yyyy-MM-dd"),
                CommitteeMeetingName = assigned?.CommitteeMeeting?.MeetingName,
                CommitteeMeetingTime = assigned?.CommitteeMeeting?.MeetingTime,
                AssignedToMeeting = assigned?.CommitteeMeetingId != null,
            };
        }).ToList();
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
        var paymentLabel = readiness.PaymentsReady
            ? (readiness.EntranceFeeOk && readiness.AnnualSubscriptionOk ? "Fees received" : "Partial")
            : "Awaiting payment";
        var paymentCode = readiness.PaymentsReady ? "PAID" : "PENDING";

        return new ApplicationListItemDto
        {
            ApplicationId = app.ApplicationId,
            ApplicationNo = app.ApplicationNo,
            ReferenceNumber = app.ApplicationNo,
            ApplicantProfileId = app.ApplicantProfileId,
            ApplicantName = name,
            ApplicationStatusId = app.ApplicationStatusId,
            StatusCode = code,
            StatusName = readiness.PaymentsReady
                ? (app.Status?.Name ?? code)
                : "Awaiting entrance & annual fees",
            ElectionTypeId = app.ElectionTypeId,
            MembershipTypeName = ResolveMembershipTypeName(app.FormDataJson, app.ElectionType?.Name),
            AppliedAt = app.SubmittedAt ?? app.CreatedAt,
            UpdatedAt = app.UpdatedAt,
            PaymentStatus = paymentLabel,
            PaymentStatusCode = paymentCode,
            SponsorStatus = "Complete",
            SponsorStatusCode = "COMPLETE",
            EndorsementsCompleted = 2,
            EndorsementsRequired = 2,
            EntranceFeeAmount = app.EntranceFeeAmount,
            AnnualSubscriptionAmount = app.AnnualSubscriptionAmount,
            InterviewRequiredFlag = app.InterviewRequiredFlag,
            StageAReadyForManager = readiness.ReadyForManager,
            StageAPaymentsReady = readiness.PaymentsReady,
            StageADocumentsReady = readiness.DocumentsReady,
            ClubVisitsLogged = readiness.ClubVisitsLogged,
            ClubVisitsMet = readiness.ClubVisitsMet,
            CanAuthorizeToInterview = readiness.CanProceedToInterview,
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
        var docs = app.AplicationDocuments.Where(d => d.DocumentType != null).ToList();
        var hasCv = docs.Any(d => CvCodes.Contains(d.DocumentType!.Code, StringComparer.OrdinalIgnoreCase));
        var hasId = docs.Any(d => IdPassportCodes.Contains(d.DocumentType!.Code, StringComparer.OrdinalIgnoreCase));
        var hasLicense = docs.Any(d => LicenseCodes.Contains(d.DocumentType!.Code, StringComparer.OrdinalIgnoreCase));
        var licenseRequired = PilotLicenseRequired(app.FormDataJson);

        var (joiningOk, annualOk) = await FeePaymentsOkAsync(app.ApplicantProfileId, cancellationToken);
        var paymentsReady = joiningOk && annualOk;
        var documentsReady = hasCv && hasId && (!licenseRequired || hasLicense);

        var pendingPayments = new List<string>();
        if (!joiningOk) pendingPayments.Add("Entrance / joining fee");
        if (!annualOk) pendingPayments.Add("Annual subscription fee");

        var pending = new List<string>();
        if (!endorsementsComplete) pending.Add("Both proposer and seconder endorsements");
        pending.AddRange(pendingPayments.Select(p => $"{p} payment (initiate or complete)"));
        if (!hasCv) pending.Add("Upload CV");
        if (!hasId) pending.Add("Upload ID / Passport copy");
        if (licenseRequired && !hasLicense) pending.Add("Upload pilot licence copy");

        var logged = app.ClubVisits?.Count
            ?? await _db.ApplicationClubVisits.CountAsync(v => v.ApplicationId == app.ApplicationId, cancellationToken);
        if (logged == 0 && app.ClubVisitsCount > 0) logged = app.ClubVisitsCount;
        var visitsMet = logged >= RequiredClubVisits || app.ClubVisitsOverride;

        // Manager notification gate: sponsors done + both fees.
        var readyForManager = endorsementsComplete && paymentsReady;
        // Authorize to interview: also documents + 3 visits (who they met).
        var canInterview = readyForManager && documentsReady && visitsMet;

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
            EntranceFeeOk = joiningOk,
            AnnualSubscriptionOk = annualOk,
            CvUploaded = hasCv,
            IdPassportUploaded = hasId,
            PilotLicenseRequired = licenseRequired,
            PilotLicenseUploaded = hasLicense,
            ReadyForManager = readyForManager,
            PaymentsReady = paymentsReady,
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

    private async Task<(bool Joining, bool Annual)> FeePaymentsOkAsync(long profileId, CancellationToken cancellationToken)
    {
        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.FeeType)
            .Include(t => t.PaymentStatus)
            .Where(t => t.ProfileId == profileId)
            .ToListAsync(cancellationToken);

        bool Ok(string feeCode) => txs.Any(t =>
            t.FeeType != null
            && (string.Equals(t.FeeType.Code, feeCode, StringComparison.OrdinalIgnoreCase)
                || t.FeeType.Code.Contains(feeCode, StringComparison.OrdinalIgnoreCase)
                || (feeCode == "JOINING" && t.FeeType.Code.Contains("JOIN", StringComparison.OrdinalIgnoreCase))
                || (feeCode == "ANNUAL" && t.FeeType.Code.Contains("ANNUAL", StringComparison.OrdinalIgnoreCase)))
            && t.PaymentStatus != null
            && PaymentOkStatuses.Contains(NormalizePay(t.PaymentStatus.Code)));

        return (Ok("JOINING"), Ok("ANNUAL"));
    }

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
}
