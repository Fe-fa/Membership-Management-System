using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Committee;
using ClubManagement.Entities;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Committee;

public interface IInterviewConductService
{
    Task EnsureStatusesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<MeetingInterviewDto>> ListByMeetingAsync(long meetingId, CancellationToken cancellationToken);
    Task<MeetingInterviewDto> AttachAsync(long meetingId, long applicationId, long? actorUserId, CancellationToken cancellationToken);
    Task<MeetingInterviewDto> SaveOutcomeAsync(long interviewId, SaveInterviewOutcomeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<InterviewCandidateDto>> SearchCandidatesAsync(long meetingId, string? search, CancellationToken cancellationToken);
    Task<int> CountPendingOutcomesAsync(long meetingId, CancellationToken cancellationToken);
}

public class InterviewConductService : IInterviewConductService
{
    public const int TemporaryWindowDays = 90;

    private static readonly HashSet<string> PositiveOutcomes = new(StringComparer.OrdinalIgnoreCase) { "Positive", "POSITIVE", "PASS" };
    private static readonly HashSet<string> NegativeOutcomes = new(StringComparer.OrdinalIgnoreCase) { "Negative", "NEGATIVE", "FAIL", "NotElected", "NOT_ELECTED" };
    private static readonly HashSet<string> DeferredOutcomes = new(StringComparer.OrdinalIgnoreCase) { "Deferred", "DEFERRED" };

    private readonly ApplicationModuleDbContext _db;

    public InterviewConductService(ApplicationModuleDbContext db) => _db = db;

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
            .Where(i => i.CommitteeMeetingId == meetingId)
            .OrderBy(i => i.Application.ApplicationNo)
            .ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
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

        var existingOnMeeting = app.Interviews.FirstOrDefault(i => i.CommitteeMeetingId == meetingId);
        if (existingOnMeeting is not null)
            return Map(await ReloadInterviewAsync(existingOnMeeting.InterviewId, cancellationToken));

        var interview = app.Interviews.OrderByDescending(i => i.InterviewId).FirstOrDefault();
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
            if (interview.CommitteeMeetingId is long otherId && otherId != meetingId
                && !string.IsNullOrWhiteSpace(interview.Outcome))
                throw new InvalidOperationException(
                    "This application already has a recorded interview outcome on another meeting.");

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
            .FirstOrDefaultAsync(i => i.InterviewId == interviewId, cancellationToken)
            ?? throw new InvalidOperationException("Interview not found.");

        interview.Outcome = outcome;
        interview.Notes = string.IsNullOrWhiteSpace(request.Notes) ? interview.Notes : request.Notes.Trim();
        interview.AttendedFlag = request.Attended;
        interview.ConductedAt = DateTime.UtcNow;
        interview.InterviewerProfileId = request.InterviewerProfileId ?? interview.InterviewerProfileId;
        interview.UpdatedByUserId = actorUserId;

        if (PositiveOutcomes.Contains(outcome))
            await ApplyPositiveAsync(interview, actorUserId, cancellationToken);
        else if (NegativeOutcomes.Contains(outcome))
            await ApplyNegativeAsync(interview, actorUserId, cancellationToken);
        // Deferred: record only — no status transition.

        await _db.SaveChangesAsync(cancellationToken);
        return Map(await ReloadInterviewAsync(interviewId, cancellationToken));
    }

    public async Task<IReadOnlyList<InterviewCandidateDto>> SearchCandidatesAsync(
        long meetingId,
        string? search,
        CancellationToken cancellationToken)
    {
        var term = (search ?? "").Trim();
        if (term.Length < 2) return [];

        var linked = await _db.Interviews.AsNoTracking()
            .Where(i => i.CommitteeMeetingId == meetingId)
            .Select(i => i.ApplicationId)
            .ToListAsync(cancellationToken);

        var apps = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .Where(a => a.StageAAuthorizedAt != null
                        || a.Status.Code == "Interview"
                        || a.Status.Code == "INTERVIEW"
                        || a.Status.Code == "InterviewReview"
                        || a.Status.Code == "INTERVIEW_REVIEW"
                        || a.Status.Code == "TEMPORARY_MEMBER"
                        || a.Status.Code == "TemporaryMember")
            .OrderByDescending(a => a.UpdatedAt)
            .Take(80)
            .ToListAsync(cancellationToken);

        return apps
            .Select(a =>
            {
                var name = string.Join(" ", new[] { a.Applicant.Title, a.Applicant.FirstName, a.Applicant.LastName }
                    .Where(v => !string.IsNullOrWhiteSpace(v)));
                var code = NormalizeStatus(a.Status?.Code);
                return new InterviewCandidateDto
                {
                    ApplicationId = a.ApplicationId,
                    ApplicationNo = a.ApplicationNo,
                    ApplicantName = name,
                    StatusCode = code,
                    StatusName = a.Status?.Name ?? code,
                    AlreadyLinked = linked.Contains(a.ApplicationId)
                };
            })
            .Where(c =>
            {
                var hay = $"{c.ApplicantName} {c.ApplicationNo} APP-{c.ApplicationId:D4}".ToLowerInvariant();
                return hay.Contains(term.ToLowerInvariant());
            })
            .Take(20)
            .ToList();
    }

    public async Task<int> CountPendingOutcomesAsync(long meetingId, CancellationToken cancellationToken)
    {
        return await _db.Interviews.CountAsync(
            i => i.CommitteeMeetingId == meetingId && (i.Outcome == null || i.Outcome == ""),
            cancellationToken);
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
                Reason = "Interview outcome: Positive — Temporary Member."
            });
        }

        await EnsureTemporaryAccountAsync(app, actorUserId, cancellationToken);
    }

    private async Task ApplyNegativeAsync(Interview interview, long? actorUserId, CancellationToken cancellationToken)
    {
        var app = interview.Application;
        var rejected = await FindStatusAsync("NotElected", cancellationToken)
            ?? await FindStatusAsync("NOTELECTED", cancellationToken)
            ?? await FindStatusAsync("Rejected", cancellationToken)
            ?? await FindStatusAsync("REJECTED", cancellationToken)
            ?? throw new InvalidOperationException("Rejected / Not Elected application status is missing.");

        var current = NormalizeStatus(app.Status?.Code);
        if (current is "Rejected" or "NotElected") return;

        var fromId = app.ApplicationStatusId;
        app.ApplicationStatusId = rejected.ApplicationStatusId;
        app.UpdatedAt = DateTime.UtcNow;
        app.UpdatedByUserId = actorUserId;
        _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
        {
            ApplicationId = app.ApplicationId,
            FromStatusId = fromId,
            ToStatusId = rejected.ApplicationStatusId,
            ChangedAt = DateTime.UtcNow,
            ChangedByUserId = actorUserId,
            Reason = "Interview outcome: Negative — Not elected (ballot skipped)."
        });
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
        await _db.Interviews.AsNoTracking()
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
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
            Notes = i.Notes,
            OutcomeRecorded = !string.IsNullOrWhiteSpace(i.Outcome)
        };
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
            _ => statusCode
        };
    }
}
