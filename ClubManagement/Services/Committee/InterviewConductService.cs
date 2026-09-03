using System.Text.Json;
using System.Text.Json.Serialization;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Committee;
using ClubManagement.Entities;
using ClubManagement.Entities.Committee;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Services.Identity;
using ClubManagement.Services.MembershipApplication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.Committee;

public interface IInterviewConductService
{
    Task EnsureStatusesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<MeetingInterviewDto>> ListByMeetingAsync(long meetingId, CancellationToken cancellationToken);
    Task<MeetingInterviewDto> AttachAsync(long meetingId, long applicationId, long? actorUserId, CancellationToken cancellationToken);
    Task<int> AttachManyAsync(long meetingId, IReadOnlyList<long> applicationIds, long? actorUserId, CancellationToken cancellationToken);
    Task<MeetingInterviewDto> SaveNotesAsync(long interviewId, SaveInterviewOutcomeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<MeetingInterviewDto> SaveOutcomeAsync(long interviewId, SaveInterviewOutcomeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<InterviewCandidateDto>> SearchCandidatesAsync(long meetingId, string? search, CancellationToken cancellationToken);
    Task<IReadOnlyList<InterviewCandidateDto>> ListInterviewQueueAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<MeetingInterviewDto>> ListInterviewHistoryAsync(CancellationToken cancellationToken);
    Task<MeetingInterviewDto> RetrieveDeferredAsync(long interviewId, long? actorUserId, CancellationToken cancellationToken);
    Task DeleteInterviewAsync(long interviewId, long? actorUserId, CancellationToken cancellationToken);
    Task<int> CountPendingOutcomesAsync(long meetingId, CancellationToken cancellationToken);
    Task<SittingAttendanceDto> GetSittingAttendanceAsync(long meetingId, CancellationToken cancellationToken);
    Task<SittingAttendanceDto> SetSittingAttendanceAsync(long meetingId, SetSittingAttendanceRequest request, long? actorUserId, CancellationToken cancellationToken);
}

public class InterviewConductService : IInterviewConductService
{
    public const int TemporaryWindowDays = 90;

    private static readonly HashSet<string> PositiveOutcomes = new(StringComparer.OrdinalIgnoreCase)
        { "Positive", "POSITIVE", "PASS", "Approved", "APPROVED" };
    private static readonly HashSet<string> NegativeOutcomes = new(StringComparer.OrdinalIgnoreCase)
        { "Negative", "NEGATIVE", "FAIL", "NotElected", "NOT_ELECTED", "Rejected", "REJECTED" };
    private static readonly HashSet<string> DeferredOutcomes = new(StringComparer.OrdinalIgnoreCase)
        { "Deferred", "DEFERRED", "Waitlist", "WAITLIST", "WAITLISTED" };
    private static readonly HashSet<string> PaymentReceivedStatuses = new(StringComparer.OrdinalIgnoreCase)
        { "PAID", "WAIVED", "COMPLETE", "COMPLETED", "RECEIVED", "SUCCESS", "CLEARED" };

    private static readonly JsonSerializerOptions FormJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly ApplicationModuleDbContext _db;
    private readonly IApplicationService _applications;
    private readonly IApplicationDecisionNotifier _decisions;
    private readonly IEmailDispatchQueue _emails;
    private readonly AppPublicOptions _app;

    public InterviewConductService(
        ApplicationModuleDbContext db,
        IApplicationService applications,
        IApplicationDecisionNotifier decisions,
        IEmailDispatchQueue emails,
        IOptions<AppPublicOptions> app)
    {
        _db = db;
        _applications = applications;
        _decisions = decisions;
        _emails = emails;
        _app = app.Value;
    }

    public async Task EnsureStatusesAsync(CancellationToken cancellationToken)
    {
        await EnsureStatusRowAsync(
            "TEMPORARY_MEMBER",
            "Temporary Member",
            "Passed interview — temporary membership (guarantor-backed window).",
            12,
            cancellationToken);
        await EnsureStatusRowAsync(
            "NOTELECTED",
            "Not Elected",
            "Not elected following interview (or ballot).",
            13,
            cancellationToken,
            isTerminal: true);
    }

    public async Task<IReadOnlyList<MeetingInterviewDto>> ListByMeetingAsync(
        long meetingId,
        CancellationToken cancellationToken)
    {
        await EnsureStatusesAsync(cancellationToken);
        var rows = await _db.Interviews.AsNoTracking()
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .Include(i => i.Application).ThenInclude(a => a.Proposer)
            .Include(i => i.Application).ThenInclude(a => a.Seconder)
            .Include(i => i.Application).ThenInclude(a => a.AplicationDocuments).ThenInclude(d => d.DocumentType)
            .Include(i => i.Application).ThenInclude(a => a.ClubVisits)
            .Include(i => i.CommitteeMeeting)
            .Where(i => i.CommitteeMeetingId == meetingId)
            .OrderBy(i => i.Outcome == null || i.Outcome == "")
            .ThenBy(i => i.ScheduledAt)
            .ThenBy(i => i.Application.ApplicationNo)
            .ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
    }

    public async Task<int> AttachManyAsync(
        long meetingId,
        IReadOnlyList<long> applicationIds,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var count = 0;
        foreach (var id in applicationIds.Distinct())
        {
            await AttachAsync(meetingId, id, actorUserId, cancellationToken);
            count++;
        }
        return count;
    }

    public async Task<MeetingInterviewDto> AttachAsync(
        long meetingId,
        long applicationId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureStatusesAsync(cancellationToken);
        var meeting = await _db.CommitteeMeetings.FirstOrDefaultAsync(
            m => m.CommitteeMeetingId == meetingId,
            cancellationToken)
            ?? throw new InvalidOperationException("Meeting not found.");

        if (!string.Equals(meeting.Status, "SCHEDULED", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(meeting.Status, "HELD", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Interviews can only be linked to SCHEDULED or HELD meetings.");

        var app = await _db.Applications
            .Include(a => a.Status)
            .Include(a => a.Applicant)
            .Include(a => a.Interviews)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application not found.");

        var status = NormalizeStatus(app.Status?.Code);
        var eligible =
            status is "Interview" or "InterviewReview" or "TemporaryMember"
            || app.StageAAuthorizedAt is not null;
        if (!eligible)
            throw new InvalidOperationException(
                "Only applications authorized to interview (or already at interview) can be linked.");

        var existingOpenOnMeeting = app.Interviews.FirstOrDefault(i =>
            i.CommitteeMeetingId == meetingId && string.IsNullOrWhiteSpace(i.Outcome));
        if (existingOpenOnMeeting is not null)
            return Map(await ReloadInterviewAsync(existingOpenOnMeeting.InterviewId, cancellationToken));

        var recordedOnMeeting = app.Interviews.FirstOrDefault(i =>
            i.CommitteeMeetingId == meetingId && !string.IsNullOrWhiteSpace(i.Outcome));
        if (recordedOnMeeting is not null && !DeferredOutcomes.Contains(recordedOnMeeting.Outcome!))
            return Map(await ReloadInterviewAsync(recordedOnMeeting.InterviewId, cancellationToken));
        if (recordedOnMeeting is not null && DeferredOutcomes.Contains(recordedOnMeeting.Outcome!))
            throw new InvalidOperationException(
                "This sitting already has a deferred outcome. Schedule a different sitting for further review.");

        var interview = app.Interviews
            .Where(i => string.IsNullOrWhiteSpace(i.Outcome))
            .OrderByDescending(i => i.InterviewId)
            .FirstOrDefault();
        DateTime? scheduledAt = meeting.MeetingDate.ToDateTime(
            TimeOnly.TryParse(meeting.MeetingTime, out var t) ? t : new TimeOnly(10, 0));

        if (interview is null)
        {
            interview = new Interview
            {
                ApplicationId = applicationId,
                CommitteeMeetingId = meetingId,
                ScheduledAt = scheduledAt,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId,
                Notes = $"Linked to meeting {meeting.MeetingName ?? meeting.CommitteeMeetingId.ToString()}."
            };
            _db.Interviews.Add(interview);
        }
        else
        {
            interview.CommitteeMeetingId = meetingId;
            interview.ScheduledAt = scheduledAt;
            interview.UpdatedByUserId = actorUserId;
            if (string.IsNullOrWhiteSpace(interview.Notes))
                interview.Notes = $"Linked to meeting {meeting.MeetingName ?? meeting.CommitteeMeetingId.ToString()}.";
        }

        // Move into Interview status if still earlier.
        if (status is not ("Interview" or "InterviewReview" or "TemporaryMember" or "Rejected" or "NotElected"))
        {
            var interviewStatus = await FindStatusAsync("Interview", cancellationToken)
                ?? await FindStatusAsync("INTERVIEW", cancellationToken);
            if (interviewStatus is not null && app.ApplicationStatusId != interviewStatus.ApplicationStatusId)
            {
                var fromId = app.ApplicationStatusId;
                app.ApplicationStatusId = interviewStatus.ApplicationStatusId;
                app.UpdatedAt = DateTime.UtcNow;
                app.UpdatedByUserId = actorUserId;
                _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
                {
                    ApplicationId = applicationId,
                    FromStatusId = fromId,
                    ToStatusId = interviewStatus.ApplicationStatusId,
                    ChangedAt = DateTime.UtcNow,
                    ChangedByUserId = actorUserId,
                    Reason = "Linked to interview meeting."
                });
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        await NotifyInterviewInviteAsync(meetingId, applicationId, cancellationToken);
        return Map(await ReloadInterviewAsync(interview.InterviewId, cancellationToken));
    }

    public async Task<MeetingInterviewDto> SaveOutcomeAsync(
        long interviewId,
        SaveInterviewOutcomeRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureStatusesAsync(cancellationToken);
        var outcome = NormalizeOutcome(request.Outcome);
        if (outcome is null)
            throw new InvalidOperationException("Outcome must be Positive, Negative, or Deferred.");

        var interview = await _db.Interviews
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .Include(i => i.Application).ThenInclude(a => a.Interviews)
            .FirstOrDefaultAsync(i => i.InterviewId == interviewId, cancellationToken)
            ?? throw new InvalidOperationException("Interview not found.");

        var previous = NormalizeOutcome(interview.Outcome);
        if (previous == "Positive")
            throw new InvalidOperationException(
                "This interview is already cleared for temporary status. Actions are locked.");

        interview.Outcome = outcome;
        interview.Notes = string.IsNullOrWhiteSpace(request.Notes) ? interview.Notes : request.Notes.Trim();
        interview.AttendedFlag = request.Attended;
        interview.ConductedAt = DateTime.UtcNow;
        interview.InterviewerProfileId = request.InterviewerProfileId ?? interview.InterviewerProfileId;
        interview.UpdatedByUserId = actorUserId;
        ApplyAssessment(interview, request, withOutcome: true);

        if (PositiveOutcomes.Contains(outcome))
            await ApplyPositiveAsync(interview, actorUserId, cancellationToken);
        else if (NegativeOutcomes.Contains(outcome))
        {
            var returnReason = BlankToNull(request.ReturnReason);
            if (returnReason is null || returnReason.Length < 5)
                throw new InvalidOperationException(
                    "State the reason for a negative outcome. The application returns to the previous stage with this change required.");
            await ApplyNegativeAsync(interview, actorUserId, returnReason, cancellationToken);
        }
        else if (DeferredOutcomes.Contains(outcome))
            await ApplyDeferredAsync(interview, actorUserId, request.Notes, cancellationToken);

        if (interview.CommitteeMeetingId is long meetingId)
        {
            var meeting = await _db.CommitteeMeetings.FirstOrDefaultAsync(
                m => m.CommitteeMeetingId == meetingId,
                cancellationToken);
            if (meeting is not null
                && string.Equals(meeting.Status, "SCHEDULED", StringComparison.OrdinalIgnoreCase))
            {
                meeting.Status = "HELD";
                meeting.UpdatedByUserId = actorUserId;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Map(await ReloadInterviewAsync(interviewId, cancellationToken));
    }

    public async Task<MeetingInterviewDto> SaveNotesAsync(
        long interviewId,
        SaveInterviewOutcomeRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var interview = await _db.Interviews.FirstOrDefaultAsync(i => i.InterviewId == interviewId, cancellationToken)
            ?? throw new InvalidOperationException("Interview not found.");
        interview.Notes = (request.Notes ?? "").Trim();
        interview.UpdatedByUserId = actorUserId;
        ApplyAssessment(interview, request, withOutcome: false);
        await _db.SaveChangesAsync(cancellationToken);
        return Map(await ReloadInterviewAsync(interviewId, cancellationToken));
    }

    public async Task<IReadOnlyList<InterviewCandidateDto>> SearchCandidatesAsync(
        long meetingId,
        string? search,
        CancellationToken cancellationToken)
    {
        var term = (search ?? "").Trim();

        var linked = await _db.Interviews.AsNoTracking()
            .Where(i => i.CommitteeMeetingId == meetingId)
            .Select(i => i.ApplicationId)
            .ToListAsync(cancellationToken);

        var apps = await LoadInterviewEligibleApplicationsAsync(cancellationToken);

        IEnumerable<InterviewCandidateDto> mapped = apps.Select(a => MapCandidate(a, linked.Contains(a.ApplicationId)));
        if (term.Length >= 1)
        {
            mapped = mapped.Where(c =>
            {
                var hay = $"{c.ApplicantName} {c.ApplicationNo} APP-{c.ApplicationId:D4}".ToLowerInvariant();
                return hay.Contains(term.ToLowerInvariant());
            });
        }

        return mapped
            .OrderBy(c => c.AlreadyLinked)
            .ThenBy(c => c.LinkedMeetingId.HasValue)
            .ThenBy(c => c.ApplicantName)
            .Take(term.Length >= 1 ? 20 : 40)
            .ToList();
    }

    public async Task<IReadOnlyList<InterviewCandidateDto>> ListInterviewQueueAsync(CancellationToken cancellationToken)
    {
        var apps = await LoadInterviewEligibleApplicationsAsync(cancellationToken);
        return apps
            .Where(IsPendingCommitteeInterview)
            .Select(a => MapCandidate(a, alreadyOnThisMeeting: false))
            .OrderBy(c => c.LinkedMeetingId.HasValue)
            .ThenBy(c => c.ApplicantName)
            .ToList();
    }

    public async Task<IReadOnlyList<MeetingInterviewDto>> ListInterviewHistoryAsync(CancellationToken cancellationToken)
    {
        await EnsureStatusesAsync(cancellationToken);
        var rows = await _db.Interviews
            .AsNoTracking()
            .Where(i => i.Outcome != null && i.Outcome != "")
            .OrderByDescending(i => i.ConductedAt)
            .ThenByDescending(i => i.InterviewId)
            .Take(80)
            .Select(i => new
            {
                i.InterviewId,
                i.ApplicationId,
                i.Application.ApplicationNo,
                Title = i.Application.Applicant.Title,
                FirstName = i.Application.Applicant.FirstName,
                LastName = i.Application.Applicant.LastName,
                StatusCode = i.Application.Status.Code,
                StatusName = i.Application.Status.Name,
                i.CommitteeMeetingId,
                MeetingName = i.CommitteeMeeting != null ? i.CommitteeMeeting.MeetingName : null,
                MeetingDate = i.CommitteeMeeting != null ? (DateOnly?)i.CommitteeMeeting.MeetingDate : null,
                MeetingTime = i.CommitteeMeeting != null ? i.CommitteeMeeting.MeetingTime : null,
                i.ScheduledAt,
                i.ConductedAt,
                i.InterviewerProfileId,
                i.AttendedFlag,
                i.Outcome,
                i.Notes,
                i.FormJson,
                i.CreatedAt
            })
            .ToListAsync(cancellationToken);

        return rows
            .OrderByDescending(r => r.ConductedAt ?? r.CreatedAt)
            .ThenByDescending(r => r.InterviewId)
            .Select(r =>
            {
                var form = ReadForm(r.FormJson);
                var code = NormalizeStatus(r.StatusCode);
                return new MeetingInterviewDto
                {
                    InterviewId = r.InterviewId,
                    ApplicationId = r.ApplicationId,
                    ApplicationNo = r.ApplicationNo,
                    ApplicantName = string.Join(" ", new[] { r.Title, r.FirstName, r.LastName }
                        .Where(v => !string.IsNullOrWhiteSpace(v))),
                    StatusCode = code,
                    StatusName = r.StatusName ?? code,
                    CommitteeMeetingId = r.CommitteeMeetingId,
                    ScheduledAt = r.ScheduledAt,
                    ConductedAt = r.ConductedAt,
                    InterviewerProfileId = r.InterviewerProfileId,
                    AttendedFlag = r.AttendedFlag,
                    Outcome = r.Outcome,
                    FormOutcome = form.FormOutcome,
                    Notes = r.Notes,
                    OutcomeRecorded = !string.IsNullOrWhiteSpace(r.Outcome),
                    CanRetrieve = DeferredOutcomes.Contains(r.Outcome ?? "")
                                  && code is "Interview" or "InterviewReview",
                    CanAmendHistory = !string.IsNullOrWhiteSpace(r.Outcome)
                                      && !PositiveOutcomes.Contains(r.Outcome),
                    SittingLabel = r.MeetingDate is null
                        ? null
                        : $"{r.MeetingName ?? "Sitting"} · {r.MeetingDate:yyyy-MM-dd}"
                          + (string.IsNullOrWhiteSpace(r.MeetingTime) ? "" : $" {r.MeetingTime}"),
                    Form = form
                };
            })
            .ToList();
    }

    public async Task<MeetingInterviewDto> RetrieveDeferredAsync(
        long interviewId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureStatusesAsync(cancellationToken);
        var interview = await _db.Interviews
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .FirstOrDefaultAsync(i => i.InterviewId == interviewId, cancellationToken)
            ?? throw new InvalidOperationException("Interview not found.");

        if (!DeferredOutcomes.Contains(interview.Outcome ?? ""))
            throw new InvalidOperationException("Only a deferred interview can be retrieved for further review.");

        var app = interview.Application;
        var status = NormalizeStatus(app.Status?.Code);
        if (status is "Rejected" or "NotElected" or "Withdrawn")
            throw new InvalidOperationException("This application is closed and cannot return to interview.");
        if (status is "TemporaryMember" or "Approved" or "Waitlist" or "ElectionReview")
            throw new InvalidOperationException(
                "This applicant already moved past interview. The deferred record stays in history.");

        var open = await _db.Interviews.FirstOrDefaultAsync(
            i => i.ApplicationId == app.ApplicationId && (i.Outcome == null || i.Outcome == ""),
            cancellationToken);
        if (open is null)
        {
            open = new Interview
            {
                ApplicationId = app.ApplicationId,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId,
                Notes = "Retrieved from deferred history for further review."
            };
            _db.Interviews.Add(open);
        }

        await ApplyDeferredAsync(interview, actorUserId, "Retrieved for further review.", cancellationToken);
        interview.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return Map(await ReloadInterviewAsync(interview.InterviewId, cancellationToken));
    }

    public async Task DeleteInterviewAsync(
        long interviewId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var interview = await _db.Interviews
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .FirstOrDefaultAsync(i => i.InterviewId == interviewId, cancellationToken)
            ?? throw new InvalidOperationException("Interview not found.");

        if (PositiveOutcomes.Contains(interview.Outcome ?? ""))
            throw new InvalidOperationException(
                "A clearance to temporary status cannot be deleted.");

        _db.Interviews.Remove(interview);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<List<MApplication>> LoadInterviewEligibleApplicationsAsync(CancellationToken cancellationToken)
    {
        return await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .Include(a => a.Interviews).ThenInclude(i => i.CommitteeMeeting)
            .Where(a => a.StageAAuthorizedAt != null
                        || a.Status.Code == "Interview"
                        || a.Status.Code == "INTERVIEW"
                        || a.Status.Code == "InterviewReview"
                        || a.Status.Code == "INTERVIEW_REVIEW"
                        || (a.Status.Name != null && EF.Functions.Like(a.Status.Name, "%Interview%")))
            .OrderByDescending(a => a.StageAAuthorizedAt ?? a.UpdatedAt)
            .ToListAsync(cancellationToken);
    }

    private static bool IsPendingCommitteeInterview(MApplication a)
    {
        var code = NormalizeStatus(a.Status?.Code);
        // Finished or later pipeline — not waiting on committee to schedule/conduct interview.
        if (code is "Approved" or "TemporaryMember" or "Waitlist" or "ElectionReview"
            or "Rejected" or "NotElected" or "Withdrawn")
            return false;
        var name = a.Status?.Name ?? "";
        if (name.Contains("signature", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Fully approved", StringComparison.OrdinalIgnoreCase))
            return false;
        if (a.StageAAuthorizedAt != null) return true;
        return code is "Interview" or "InterviewReview"
               || name.Contains("Interview", StringComparison.OrdinalIgnoreCase);
    }

    private static InterviewCandidateDto MapCandidate(MApplication a, bool alreadyOnThisMeeting)
    {
        var name = string.Join(" ", new[] { a.Applicant.Title, a.Applicant.FirstName, a.Applicant.LastName }
            .Where(v => !string.IsNullOrWhiteSpace(v)));
        var code = NormalizeStatus(a.Status?.Code);
        var link = a.Interviews
            .Where(i => i.CommitteeMeetingId != null
                        && i.CommitteeMeeting != null
                        && string.IsNullOrWhiteSpace(i.Outcome))
            .OrderByDescending(i => i.InterviewId)
            .FirstOrDefault();
        var label = link?.CommitteeMeeting is null
            ? null
            : $"{link.CommitteeMeeting.MeetingName ?? "Sitting"} · {link.CommitteeMeeting.MeetingDate:yyyy-MM-dd}"
              + (string.IsNullOrWhiteSpace(link.CommitteeMeeting.MeetingTime) ? "" : $" {link.CommitteeMeeting.MeetingTime}");
        return new InterviewCandidateDto
        {
            ApplicationId = a.ApplicationId,
            ApplicationNo = a.ApplicationNo,
            ApplicantName = name,
            PhotoUrl = a.Applicant?.PhotoUrl,
            StatusCode = code,
            StatusName = a.Status?.Name ?? code,
            AlreadyLinked = alreadyOnThisMeeting,
            LinkedMeetingId = link?.CommitteeMeetingId,
            LinkedMeetingLabel = label,
            InterviewId = link?.InterviewId,
            Outcome = link?.Outcome,
            Notes = link?.Notes,
            Form = ReadForm(link?.FormJson)
        };
    }

    public async Task<int> CountPendingOutcomesAsync(long meetingId, CancellationToken cancellationToken)
    {
        return await _db.Interviews.CountAsync(
            i => i.CommitteeMeetingId == meetingId && (i.Outcome == null || i.Outcome == ""),
            cancellationToken);
    }

    public async Task<SittingAttendanceDto> GetSittingAttendanceAsync(
        long meetingId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.CommitteeMeetings.AsNoTracking()
            .FirstOrDefaultAsync(m => m.CommitteeMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");

        var members = await _db.CommitteeMembers.AsNoTracking()
            .Include(m => m.Member)
            .Include(m => m.CommitteeRole)
            .Where(m => m.CommitteeId == meeting.CommitteeId && m.IsActive)
            .OrderBy(m => m.CommitteeRole.SortOrder)
            .ThenBy(m => m.Member.LastName)
            .ToListAsync(cancellationToken);

        var attendance = await _db.MeetingAttendances.AsNoTracking()
            .Where(a => a.CommitteeMeetingId == meetingId)
            .ToDictionaryAsync(a => a.CommitteeMemberId, a => a.AttendedFlag, cancellationToken);

        var rows = members.Select(m =>
        {
            var roleCode = m.CommitteeRole?.Code ?? "";
            var roleName = m.CommitteeRole?.Name ?? "";
            var gm = IsGeneralManagerRole(roleCode, roleName);
            return new SittingAttendanceRowDto
            {
                CommitteeMemberId = m.CommitteeMemberId,
                ProfileId = m.ProfileId,
                Name = string.Join(" ", new[] { m.Member?.Title, m.Member?.FirstName, m.Member?.LastName }
                    .Where(v => !string.IsNullOrWhiteSpace(v))),
                RoleCode = roleCode,
                RoleName = roleName,
                Present = attendance.GetValueOrDefault(m.CommitteeMemberId),
                IsGeneralManager = gm,
                CountsAsCommitteeSignature = !gm && CountsAsCommitteeSignature(roleCode)
            };
        }).ToList();

        var committeePresent = rows.Count(r => r.CountsAsCommitteeSignature && r.Present);
        var gmPresent = rows.Any(r => r.IsGeneralManager && r.Present);
        var needGm = rows.Any(r => r.IsGeneralManager);
        return new SittingAttendanceDto
        {
            MeetingId = meetingId,
            Members = rows,
            CommitteePresentCount = committeePresent,
            GmPresent = gmPresent,
            GateMet = committeePresent >= 4 && (!needGm || gmPresent)
        };
    }

    public async Task<SittingAttendanceDto> SetSittingAttendanceAsync(
        long meetingId,
        SetSittingAttendanceRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.CommitteeMeetings.FirstOrDefaultAsync(
            m => m.CommitteeMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");

        var sits = await _db.CommitteeMembers.AnyAsync(
            m => m.CommitteeMemberId == request.CommitteeMemberId
                 && m.CommitteeId == meeting.CommitteeId
                 && m.IsActive,
            cancellationToken);
        if (!sits)
            throw new InvalidOperationException("That person is not an active member of this committee.");

        var row = await _db.MeetingAttendances.FirstOrDefaultAsync(
            a => a.CommitteeMeetingId == meetingId && a.CommitteeMemberId == request.CommitteeMemberId,
            cancellationToken);
        if (row is null)
        {
            _db.MeetingAttendances.Add(new MeetingAttendance
            {
                CommitteeMeetingId = meetingId,
                CommitteeMemberId = request.CommitteeMemberId,
                AttendedFlag = request.Present,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            });
        }
        else
        {
            row.AttendedFlag = request.Present;
            row.UpdatedByUserId = actorUserId;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return await GetSittingAttendanceAsync(meetingId, cancellationToken);
    }

    private static bool IsGeneralManagerRole(string code, string name)
    {
        var compact = code.Replace("_", "", StringComparison.Ordinal).ToUpperInvariant();
        var n = name.ToLowerInvariant();
        return compact is "GENERALMANAGER" or "MANAGER" or "GM"
               || n.Contains("general manager", StringComparison.Ordinal)
               || n == "manager";
    }

    private static bool CountsAsCommitteeSignature(string code)
    {
        var compact = code.Replace("_", "", StringComparison.Ordinal).ToUpperInvariant();
        return compact is "COMMITTEEMEMBER" or "CHAIRMAN" or "VICECHAIRMAN" or "TREASURER" or "SECRETARY";
    }

    private async Task ApplyPositiveAsync(Interview interview, long? actorUserId, CancellationToken cancellationToken)
    {
        var app = interview.Application;
        var tempStatus = await FindStatusAsync("TemporaryMember", cancellationToken)
            ?? await FindStatusAsync("TEMPORARY_MEMBER", cancellationToken)
            ?? throw new InvalidOperationException("TEMPORARY_MEMBER application status is missing.");

        if (!string.Equals(NormalizeStatus(app.Status?.Code), "TemporaryMember", StringComparison.OrdinalIgnoreCase))
        {
            var fromId = app.ApplicationStatusId;
            app.ApplicationStatusId = tempStatus.ApplicationStatusId;
            app.UpdatedAt = DateTime.UtcNow;
            app.UpdatedByUserId = actorUserId;
            _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
            {
                ApplicationId = app.ApplicationId,
                FromStatusId = fromId,
                ToStatusId = tempStatus.ApplicationStatusId,
                ChangedAt = DateTime.UtcNow,
                ChangedByUserId = actorUserId,
                Action = ApplicationWorkflowRouter.ApproveAction,
                Reason = "Interview outcome: Positive — Temporary Member."
            });
            var current = app.CurrentHandlerUserId;
            var previous = app.PreviousHandlerUserId;
            ApplicationWorkflowRouter.AssignAdvanceHandlers(ref current, ref previous, actorUserId);
            app.CurrentHandlerUserId = current;
            app.PreviousHandlerUserId = previous;

            var applicant = app.Applicant;
            if (applicant is not null)
            {
                await _decisions.NotifyAsync(new ApplicationDecisionMessage
                {
                    Kind = ApplicationDecisionKind.Approved,
                    ApplicationId = app.ApplicationId,
                    ApplicationNo = app.ApplicationNo,
                    ApplicantName = string.Join(" ", new[] { applicant.Title, applicant.FirstName, applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
                    ApplicantProfileId = app.ApplicantProfileId,
                    ApplicantEmail = applicant.Email,
                    StageName = tempStatus.Name,
                    IsFinal = false
                }, cancellationToken);
            }
        }

        await EnsureTemporaryAccountAsync(app, actorUserId, cancellationToken);
    }

    private async Task ApplyNegativeAsync(
        Interview interview,
        long? actorUserId,
        string? notes,
        CancellationToken cancellationToken)
    {
        var current = NormalizeStatus(interview.Application.Status?.Code);
        if (current is "Rejected" or "NotElected") return;

        var comment =
            "Interview outcome: Negative — stage change required. " + (notes ?? "").Trim();

        await _applications.RejectAndHandBackAsync(interview.ApplicationId, actorUserId, comment, cancellationToken);
    }

    private async Task ApplyDeferredAsync(
        Interview interview,
        long? actorUserId,
        string? notes,
        CancellationToken cancellationToken)
    {
        var app = interview.Application;
        var current = NormalizeStatus(app.Status?.Code);
        if (current is "InterviewReview") return;

        var review = await FindStatusAsync("InterviewReview", cancellationToken)
            ?? await FindStatusAsync("INTERVIEW_REVIEW", cancellationToken);
        if (review is null) return;

        var fromId = app.ApplicationStatusId;
        app.ApplicationStatusId = review.ApplicationStatusId;
        app.UpdatedAt = DateTime.UtcNow;
        app.UpdatedByUserId = actorUserId;
        _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
        {
            ApplicationId = app.ApplicationId,
            FromStatusId = fromId,
            ToStatusId = review.ApplicationStatusId,
            ChangedAt = DateTime.UtcNow,
            ChangedByUserId = actorUserId,
            Action = ApplicationWorkflowRouter.ReviewAction,
            Reason = string.IsNullOrWhiteSpace(notes)
                ? "Interview outcome: Deferred — remains under review."
                : notes.Trim()
        });
    }

    private async Task NotifyInterviewInviteAsync(
        long meetingId,
        long applicationId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.CommitteeMeetings
            .Include(m => m.Committee)
            .Include(m => m.MeetingType)
            .FirstOrDefaultAsync(m => m.CommitteeMeetingId == meetingId, cancellationToken);
        var app = await _db.Applications
            .Include(a => a.Applicant)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (meeting is null || app?.Applicant is null) return;

        var label = string.IsNullOrWhiteSpace(meeting.MeetingName)
            ? (meeting.MeetingType?.Name ?? "Interview sitting")
            : meeting.MeetingName!;
        var when = $"{meeting.MeetingDate:dddd, dd MMMM yyyy}"
            + (string.IsNullOrWhiteSpace(meeting.MeetingTime) ? "" : $" at {meeting.MeetingTime}");
        var portal = (_app.PublicBaseUrl ?? "http://localhost:8080").TrimEnd('/');
        var link = string.IsNullOrWhiteSpace(meeting.MinutesUrl) ? null : meeting.MinutesUrl.Trim();
        var linkLine = link is null ? "" : $"\nJoin / meeting link: {link}\n";

        var applicantName = string.Join(" ", new[] { app.Applicant.FirstName, app.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));
        var applicantSubject = $"Interview scheduled: {label} — {meeting.MeetingDate:dd MMM yyyy}";
        var applicantBody =
            $"Dear {applicantName},\n\nYou are invited to attend your membership interview.\n\n" +
            $"Application: {app.ApplicationNo}\nMeeting: {label}\nWhen: {when}{linkLine}\n" +
            $"Open your portal: {portal}/applications";

        await PushInviteAsync(
            "INTERVIEW_MEETING",
            "Interview meeting schedule",
            app.ApplicantProfileId,
            app.Applicant.Email,
            applicantSubject,
            applicantBody,
            "APPLICATION",
            app.ApplicationId,
            cancellationToken);

        var committeeSubject = $"Interview sitting: {applicantName} — {meeting.MeetingDate:dd MMM yyyy}";
        var committeeBody =
            $"{applicantName} ({app.ApplicationNo}) is scheduled for interview.\n\n" +
            $"Meeting: {label}\nWhen: {when}{linkLine}\nOpen committee desk: {portal}/manage-committee/meetings";

        var members = await _db.CommitteeMembers.AsNoTracking()
            .Include(m => m.Member)
            .Where(m => m.CommitteeId == meeting.CommitteeId && m.IsActive)
            .Select(m => new { m.ProfileId, m.Member.Email })
            .ToListAsync(cancellationToken);
        foreach (var member in members)
        {
            await PushInviteAsync(
                "INTERVIEW_MEETING",
                "Interview meeting schedule",
                member.ProfileId,
                member.Email,
                committeeSubject,
                committeeBody,
                "COMMITTEE_MEETING",
                meeting.CommitteeMeetingId,
                cancellationToken);
        }
    }

    private async Task PushInviteAsync(
        string typeCode,
        string typeName,
        long profileId,
        string? email,
        string subject,
        string body,
        string relatedType,
        long relatedId,
        CancellationToken cancellationToken)
    {
        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == typeCode, cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = typeCode,
                Name = typeName,
                SortOrder = 25,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);

        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = string.IsNullOrWhiteSpace(email) ? profileId.ToString() : email.Trim(),
            Channel = "IN_APP",
            Content = $"{subject}\n\n{body}",
            RelatedEntityType = relatedType,
            RelatedEntityId = relatedId,
            SentDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(email))
            await _emails.EnqueueAsync(new EmailWorkItem(email.Trim(), subject, body), cancellationToken);
    }

    private async Task EnsureTemporaryAccountAsync(
        MApplication app,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var existing = await _db.Accounts
            .FirstOrDefaultAsync(a => a.ApplicationId == app.ApplicationId && !a.IsDeleted, cancellationToken);
        if (existing is not null)
        {
            var tempType = await _db.MembershipTypes.FirstOrDefaultAsync(t => t.Code == "TEMPORARY", cancellationToken);
            var tempMemberStatus = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "TEMPORARY", cancellationToken);
            if (tempType is not null && existing.MembershipTypeId != tempType.MembershipTypeId
                && string.IsNullOrWhiteSpace(existing.MembershipNo))
            {
                existing.MembershipTypeId = tempType.MembershipTypeId;
                existing.EndDate ??= DateOnly.FromDateTime(DateTime.UtcNow).AddDays(TemporaryWindowDays);
                existing.UpdatedByUserId = actorUserId;
            }
            if (tempMemberStatus is not null && existing.CurrentMemberStatusId != tempMemberStatus.MemberStatusId
                && string.IsNullOrWhiteSpace(existing.MembershipNo))
            {
                existing.CurrentMemberStatusId = tempMemberStatus.MemberStatusId;
                existing.UpdatedByUserId = actorUserId;
            }
            if (!string.IsNullOrWhiteSpace(existing.MembershipNo)
                && System.Text.RegularExpressions.Regex.IsMatch(existing.MembershipNo, @"^TM-\d{4}$"))
            {
                existing.MembershipNo = null;
                if (app.Applicant is not null) app.Applicant.MembershipNo = null;
                existing.UpdatedByUserId = actorUserId;
            }
            return;
        }

        var membershipType = await _db.MembershipTypes.FirstOrDefaultAsync(t => t.Code == "TEMPORARY", cancellationToken)
            ?? throw new InvalidOperationException("TEMPORARY membership type is missing.");
        var memberTempStatus = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "TEMPORARY", cancellationToken)
            ?? await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "ACTIVE", cancellationToken)
            ?? throw new InvalidOperationException("TEMPORARY / ACTIVE member status is missing.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var now = DateTime.UtcNow;

        var account = new MAccount
        {
            ProfileId = app.ApplicantProfileId,
            ApplicationId = app.ApplicationId,
            MembershipTypeId = membershipType.MembershipTypeId,
            ElectionTypeId = app.ElectionTypeId,
            MembershipNo = null,
            CurrentMemberStatusId = memberTempStatus.MemberStatusId,
            JoinedDate = today,
            StartDate = today,
            EndDate = today.AddDays(TemporaryWindowDays),
            EntranceFeeAmount = app.EntranceFeeAmount,
            IsActive = true,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.Accounts.Add(account);

        if (app.Applicant is not null)
            app.Applicant.MembershipNo = null;

        var memberRole = await _db.SystemRoles.FirstOrDefaultAsync(r => r.Code == "MEMBER", cancellationToken);
        var applicantRole = await _db.SystemRoles.FirstOrDefaultAsync(r => r.Code == "APPLICANT", cancellationToken);
        var users = await _db.UserAccounts.Include(u => u.UserRoles)
            .Where(u => u.ProfileId == app.ApplicantProfileId)
            .ToListAsync(cancellationToken);
        foreach (var user in users)
        {
            if (applicantRole is not null)
                _db.UserRoles.RemoveRange(user.UserRoles.Where(r => r.RoleId == applicantRole.SystemRoleId));
            if (memberRole is not null && user.UserRoles.All(r => r.RoleId != memberRole.SystemRoleId))
            {
                _db.UserRoles.Add(new UserRole
                {
                    UserAccountId = user.UserAccountId,
                    RoleId = memberRole.SystemRoleId,
                    AssignedDate = today,
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
            }
        }
    }

    private async Task EnsureStatusRowAsync(
        string code,
        string name,
        string description,
        int sortOrder,
        CancellationToken cancellationToken,
        bool isTerminal = false)
    {
        var existingRows = await _db.ApplicationStatuses.ToListAsync(cancellationToken);
        var compact = code.Replace("_", "");
        var existing = existingRows.FirstOrDefault(s =>
            string.Equals(s.Code, code, StringComparison.OrdinalIgnoreCase)
            || string.Equals(s.Code.Replace("_", ""), compact, StringComparison.OrdinalIgnoreCase));
        if (existing is not null)
        {
            existing.Name = name;
            existing.Description = description;
            existing.SortOrder = sortOrder;
            existing.IsActive = true;
            existing.IsTerminal = isTerminal;
            await _db.SaveChangesAsync(cancellationToken);
            return;
        }

        _db.ApplicationStatuses.Add(new ApplicationStatus
        {
            Code = code,
            Name = name,
            Description = description,
            SortOrder = sortOrder,
            IsActive = true,
            IsTerminal = isTerminal,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<ApplicationStatus?> FindStatusAsync(string code, CancellationToken cancellationToken)
    {
        var rows = await _db.ApplicationStatuses.ToListAsync(cancellationToken);
        return rows.FirstOrDefault(s =>
            string.Equals(NormalizeStatus(s.Code), NormalizeStatus(code), StringComparison.OrdinalIgnoreCase));
    }

    private async Task<Interview> ReloadInterviewAsync(long interviewId, CancellationToken cancellationToken) =>
        await _db.Interviews
            .AsTracking()
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .Include(i => i.CommitteeMeeting)
            .FirstAsync(i => i.InterviewId == interviewId, cancellationToken);

    private static MeetingInterviewDto Map(Interview i)
    {
        var name = string.Join(" ", new[] { i.Application.Applicant?.Title, i.Application.Applicant?.FirstName, i.Application.Applicant?.LastName }
            .Where(v => !string.IsNullOrWhiteSpace(v)));
        var code = NormalizeStatus(i.Application.Status?.Code);
        return new MeetingInterviewDto
        {
            InterviewId = i.InterviewId,
            ApplicationId = i.ApplicationId,
            ApplicationNo = i.Application.ApplicationNo,
            ApplicantName = name,
            StatusCode = code,
            StatusName = i.Application.Status?.Name ?? code,
            CommitteeMeetingId = i.CommitteeMeetingId,
            ScheduledAt = i.ScheduledAt,
            ConductedAt = i.ConductedAt,
            InterviewerProfileId = i.InterviewerProfileId,
            AttendedFlag = i.AttendedFlag,
            Outcome = i.Outcome,
            FormOutcome = ReadForm(i.FormJson).FormOutcome,
            Notes = i.Notes,
            OutcomeRecorded = !string.IsNullOrWhiteSpace(i.Outcome),
            CanRetrieve = CanRetrieveDeferred(i),
            CanAmendHistory = CanAmendHistory(i),
            SittingLabel = i.CommitteeMeeting is null
                ? null
                : $"{i.CommitteeMeeting.MeetingName ?? "Sitting"} · {i.CommitteeMeeting.MeetingDate:yyyy-MM-dd}"
                  + (string.IsNullOrWhiteSpace(i.CommitteeMeeting.MeetingTime) ? "" : $" {i.CommitteeMeeting.MeetingTime}"),
            Form = ReadForm(i.FormJson)
        };
    }

    private static bool CanRetrieveDeferred(Interview i)
    {
        if (!DeferredOutcomes.Contains(i.Outcome ?? "")) return false;
        var code = NormalizeStatus(i.Application.Status?.Code);
        if (code is not ("Interview" or "InterviewReview")) return false;
        return true;
    }

    private static bool CanAmendHistory(Interview i)
    {
        if (string.IsNullOrWhiteSpace(i.Outcome)) return false;
        return !PositiveOutcomes.Contains(i.Outcome);
    }

    public static bool IsClearedPastInterview(MApplication? app)
    {
        if (app is null) return false;
        var code = NormalizeStatus(app.Status?.Code);
        if (code is "TemporaryMember" or "Approved" or "Waitlist" or "ElectionReview")
            return true;
        var name = app.Status?.Name ?? "";
        return name.Contains("temporary", StringComparison.OrdinalIgnoreCase)
               || name.Contains("Fully approved", StringComparison.OrdinalIgnoreCase);
    }

    private static InterviewFormPayload ReadForm(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new InterviewFormPayload();
        try
        {
            return JsonSerializer.Deserialize<InterviewFormPayload>(json, FormJsonOptions)
                   ?? new InterviewFormPayload();
        }
        catch (JsonException)
        {
            return new InterviewFormPayload();
        }
    }

    private static void ApplyAssessment(Interview interview, SaveInterviewOutcomeRequest request, bool withOutcome)
    {
        var form = ReadForm(interview.FormJson);
        if (request.Suitability is not null)
            form.Suitability = BlankToNull(request.Suitability);
        if (request.VerbalAlignment is not null)
            form.VerbalAlignment = BlankToNull(request.VerbalAlignment);
        if (request.Recommendation is not null)
            form.Recommendation = BlankToNull(request.Recommendation);
        if (request.ReturnReason is not null)
            form.ReturnReason = BlankToNull(request.ReturnReason);
        if (request.AviationScore is not null) form.AviationScore = request.AviationScore;
        if (request.ClubFamiliarityScore is not null) form.ClubFamiliarityScore = request.ClubFamiliarityScore;
        if (request.ProposerEndorsementScore is not null) form.ProposerEndorsementScore = request.ProposerEndorsementScore;
        if (request.FinancialReadinessScore is not null) form.FinancialReadinessScore = request.FinancialReadinessScore;
        if (request.BehaviourScore is not null) form.BehaviourScore = request.BehaviourScore;
        if (withOutcome)
            form.FormOutcome = interview.Outcome;
        interview.FormJson = JsonSerializer.Serialize(form, FormJsonOptions);
    }

    private static string? BlankToNull(string? value)
    {
        var trimmed = (value ?? "").Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }

    private static string? NormalizeOutcome(string? raw)
    {
        var v = (raw ?? "").Trim();
        if (PositiveOutcomes.Contains(v)) return "Positive";
        if (NegativeOutcomes.Contains(v)) return "Negative";
        if (DeferredOutcomes.Contains(v)) return "Deferred";
        return null;
    }

    private static string? NormalizeStatus(string? statusCode)
    {
        if (string.IsNullOrWhiteSpace(statusCode)) return statusCode;
        var compact = statusCode.Replace("_", "").Replace("-", "").Replace(" ", "");
        return compact.ToUpperInvariant() switch
        {
            "TEMPORARYMEMBER" => "TemporaryMember",
            "NOTELECTED" => "NotElected",
            "REJECTED" => "Rejected",
            "INTERVIEW" => "Interview",
            "INTERVIEWREVIEW" => "InterviewReview",
            "APPROVED" => "Approved",
            "COMMITTEE" => "Committee",
            "COMMITTEEREVIEW" => "CommitteeReview",
            "WAITLIST" => "Waitlist",
            "ELECTIONREVIEW" => "ElectionReview",
            "WITHDRAWN" => "Withdrawn",
            _ => statusCode
        };
    }
}
