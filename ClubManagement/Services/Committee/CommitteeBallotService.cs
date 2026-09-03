using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Committee;
using ClubManagement.Entities;
using ClubManagement.Entities.Committee;
using ClubManagement.Entities.Lookups;
using ClubManagement.Services.MembershipAccount;
using ClubManagement.Services.MembershipApplication;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Committee;

public interface ICommitteeBallotService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<bool> CanAccessBallotAsync(long? profileId, IReadOnlyList<string> roles, CancellationToken cancellationToken);
    Task<CommitteeBallotMeetingDto> GetAdmissionDeskAsync(long? viewerProfileId, CancellationToken cancellationToken);
    Task<CommitteeBallotMeetingDto> GetMeetingBallotAsync(long meetingId, long? viewerProfileId, CancellationToken cancellationToken);
    Task<CommitteeBallotMeetingDto> SetAttendanceAsync(long meetingId, IReadOnlyList<long> committeeMemberIds, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeBallotItemDto> AttachAsync(long meetingId, long applicationId, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeBallotItemDto> CastVoteAsync(long itemId, long voterProfileId, string voteValue, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeBallotItemDto> ProceedToSignaturesAsync(long itemId, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeBallotItemDto> SignAdmissionAsync(long itemId, long signerProfileId, AdmissionSignRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<BallotCandidateDto>> SearchCandidatesAsync(long meetingId, string? search, CancellationToken cancellationToken);
}

public class CommitteeBallotService : ICommitteeBallotService
{
    public const int MeetingQuorum = 7;
    public const int AdverseVotesToReject = 2;
    public const int CommitteeSignaturesRequired = 4;
    /// <summary>Signatures open after more than 4 sitting members have voted on the applicant.</summary>
    public const int VotesRequiredBeforeSignatures = 5;

    private readonly ApplicationModuleDbContext _db;
    private readonly IMemberLifecycleService _members;
    private readonly IApplicationDecisionNotifier _decisions;

    public CommitteeBallotService(
        ApplicationModuleDbContext db,
        IMemberLifecycleService members,
        IApplicationDecisionNotifier decisions)
    {
        _db = db;
        _members = members;
        _decisions = decisions;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Committee_meeting', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.Committee_ballot_item', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Committee_ballot_item (
        committee_ballot_item_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Committee_ballot_item PRIMARY KEY,
        committee_meeting_id BIGINT NOT NULL,
        application_id BIGINT NOT NULL,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_cbi_status DEFAULT(N'OPEN'),
        resolved_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_cbi_created DEFAULT (SYSUTCDATETIME()),
        created_by_user_id BIGINT NULL,
        updated_by_user_id BIGINT NULL,
        CONSTRAINT UQ_cbi_meeting_app UNIQUE (committee_meeting_id, application_id),
        CONSTRAINT FK_cbi_meeting FOREIGN KEY (committee_meeting_id) REFERENCES dbo.Committee_meeting(committee_meeting_id) ON DELETE CASCADE,
        CONSTRAINT FK_cbi_app FOREIGN KEY (application_id) REFERENCES dbo.MApplication(application_id)
    );
END
IF OBJECT_ID(N'dbo.Committee_ballot_vote', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Committee_ballot_vote (
        committee_ballot_vote_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Committee_ballot_vote PRIMARY KEY,
        committee_ballot_item_id BIGINT NOT NULL,
        voter_profile_id BIGINT NOT NULL,
        vote_value NVARCHAR(20) NOT NULL,
        cast_at DATETIME2 NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_cbv_created DEFAULT (SYSUTCDATETIME()),
        created_by_user_id BIGINT NULL,
        CONSTRAINT UQ_cbv_item_voter UNIQUE (committee_ballot_item_id, voter_profile_id),
        CONSTRAINT FK_cbv_item FOREIGN KEY (committee_ballot_item_id) REFERENCES dbo.Committee_ballot_item(committee_ballot_item_id) ON DELETE CASCADE,
        CONSTRAINT FK_cbv_voter FOREIGN KEY (voter_profile_id) REFERENCES dbo.MProfile(profile_id)
    );
END
", cancellationToken);
    }

    public async Task<bool> CanAccessBallotAsync(
        long? profileId,
        IReadOnlyList<string> roles,
        CancellationToken cancellationToken)
    {
        if (roles.Any(r => r is "ADMIN" or "GENERAL_MANAGER" or "CHAIRMAN" or "TREASURER" or "COMMITTEE_MEMBER" or "MEMBER"))
            return true;
        if (profileId is null) return false;
        return await IsSittingMemberAsync(profileId.Value, cancellationToken);
    }

    public async Task<CommitteeBallotMeetingDto> GetAdmissionDeskAsync(
        long? viewerProfileId,
        CancellationToken cancellationToken)
    {
        var committee = await _db.Committees.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderByDescending(c => c.CommitteeId)
            .FirstOrDefaultAsync(cancellationToken);
        if (committee is null)
            return new CommitteeBallotMeetingDto { DeskMessage = "Create a committee term first." };

        var meeting = await _db.CommitteeMeetings.AsNoTracking()
            .Where(m => m.CommitteeId == committee.CommitteeId)
            .OrderByDescending(m => m.MeetingDate)
            .FirstOrDefaultAsync(cancellationToken);
        if (meeting is null)
            return new CommitteeBallotMeetingDto
            {
                DeskMessage = "Schedule a Committee meeting, then run the admission ballot."
            };

        return await GetMeetingBallotAsync(meeting.CommitteeMeetingId, viewerProfileId, cancellationToken);
    }

    public async Task<CommitteeBallotMeetingDto> GetMeetingBallotAsync(
        long meetingId,
        long? viewerProfileId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.CommitteeMeetings.AsNoTracking()
            .Include(m => m.MeetingType)
            .FirstOrDefaultAsync(m => m.CommitteeMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");

        var seats = await LoadSeatsAsync(meeting.CommitteeId, meetingId, cancellationToken);
        var present = seats.Count(s => s.Present);
        var size = seats.Count > 0 ? seats.Count : MeetingQuorum;
        var quorumMet = present >= MeetingQuorum;

        var items = await _db.CommitteeBallotItems
            .AsNoTracking()
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .Include(i => i.Application).ThenInclude(a => a.ElectionType)
            .Include(i => i.Application).ThenInclude(a => a.ApplicationExclusions)
            .Where(i => i.CommitteeMeetingId == meetingId)
            .OrderBy(i => i.Application.ApplicationNo)
            .ToListAsync(cancellationToken);

        var people = await LoadBallotPeopleAsync(
            items.Select(i => i.CommitteeBallotItemId).ToList(),
            items.Select(i => i.ApplicationId).ToList(),
            seats.Select(s => s.ProfileId),
            cancellationToken);

        return new CommitteeBallotMeetingDto
        {
            CommitteeMeetingId = meeting.CommitteeMeetingId,
            MeetingName = meeting.MeetingName ?? meeting.MeetingType?.Name ?? "Committee meeting",
            MeetingDate = meeting.MeetingDate.ToString("yyyy-MM-dd"),
            MeetingTime = meeting.MeetingTime,
            Status = meeting.Status,
            CommitteeSize = size,
            QuorumRequired = MeetingQuorum,
            PresentCount = present,
            MeetingQuorumMet = quorumMet,
            Seats = seats,
            Items = items.Select(i => MapItem(
                i,
                size,
                present,
                viewerProfileId,
                seats,
                people.Votes.Where(v => v.CommitteeBallotItemId == i.CommitteeBallotItemId).ToList(),
                people.Approvals.Where(a => a.ApplicationId == i.ApplicationId).ToList(),
                people.Names)).ToList(),
            PendingApplicants = await SearchCandidatesAsync(meetingId, null, cancellationToken)
        };
    }

    public async Task<CommitteeBallotMeetingDto> SetAttendanceAsync(
        long meetingId,
        IReadOnlyList<long> committeeMemberIds,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.CommitteeMeetings.FirstOrDefaultAsync(
            m => m.CommitteeMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");

        var wanted = committeeMemberIds.Distinct().ToHashSet();
        var existing = await _db.MeetingAttendances
            .Where(a => a.CommitteeMeetingId == meetingId)
            .ToListAsync(cancellationToken);

        foreach (var row in existing)
        {
            row.AttendedFlag = wanted.Contains(row.CommitteeMemberId);
            row.UpdatedByUserId = actorUserId;
        }

        var missing = wanted.Except(existing.Select(e => e.CommitteeMemberId)).ToList();
        foreach (var memberId in missing)
        {
            var sits = await _db.CommitteeMembers.AnyAsync(
                m => m.CommitteeMemberId == memberId && m.CommitteeId == meeting.CommitteeId && m.IsActive,
                cancellationToken);
            if (!sits) continue;
            _db.MeetingAttendances.Add(new MeetingAttendance
            {
                CommitteeMeetingId = meetingId,
                CommitteeMemberId = memberId,
                AttendedFlag = true,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        return await GetMeetingBallotAsync(meetingId, null, cancellationToken);
    }

    public async Task<CommitteeBallotItemDto> AttachAsync(
        long meetingId,
        long applicationId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.CommitteeMeetings.FirstOrDefaultAsync(
            m => m.CommitteeMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");

        var existing = await ReloadItemByAppAsync(meetingId, applicationId, cancellationToken);
        if (existing is not null)
            return await MapLoadedAsync(existing, null, cancellationToken);

        var app = await _db.Applications
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");

        var code = Normalize(app.Status?.Code);
        if (code is not ("TemporaryMember" or "Waitlist" or "ElectionReview" or "Committee"))
            throw new InvalidOperationException("Only screened temporary members awaiting ballot can be attached.");

        var item = new CommitteeBallotItem
        {
            CommitteeMeetingId = meetingId,
            ApplicationId = applicationId,
            Status = "OPEN",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.CommitteeBallotItems.Add(item);

        if (code == "TemporaryMember")
        {
            var wait = await FindStatusAsync("Waitlist", cancellationToken)
                       ?? await FindStatusAsync("WAITLIST", cancellationToken);
            if (wait is not null && app.ApplicationStatusId != wait.ApplicationStatusId)
            {
                var fromId = app.ApplicationStatusId;
                app.ApplicationStatusId = wait.ApplicationStatusId;
                app.UpdatedAt = DateTime.UtcNow;
                app.UpdatedByUserId = actorUserId;
                _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
                {
                    ApplicationId = app.ApplicationId,
                    FromStatusId = fromId,
                    ToStatusId = wait.ApplicationStatusId,
                    ChangedAt = DateTime.UtcNow,
                    ChangedByUserId = actorUserId,
                    Reason = "Attached to Committee admission ballot."
                });
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return await MapLoadedAsync(
            await ReloadItemAsync(item.CommitteeBallotItemId, cancellationToken),
            null,
            cancellationToken);
    }

    public async Task<CommitteeBallotItemDto> CastVoteAsync(
        long itemId,
        long voterProfileId,
        string voteValue,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var value = (voteValue ?? "").Trim().ToUpperInvariant();
        if (value is not ("FOR" or "AGAINST"))
            throw new InvalidOperationException("Vote must be FOR or AGAINST.");

        if (!await IsSittingMemberAsync(voterProfileId, cancellationToken))
            throw new InvalidOperationException("Only sitting Committee members may vote on this ballot.");

        var item = await _db.CommitteeBallotItems
            .Include(i => i.CommitteeMeeting)
            .Include(i => i.Votes).ThenInclude(v => v.Voter)
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .FirstOrDefaultAsync(i => i.CommitteeBallotItemId == itemId, cancellationToken)
            ?? throw new InvalidOperationException("Ballot item was not found.");

        if (!string.Equals(item.Status, "OPEN", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("This ballot is already resolved.");

        var presentIds = await _db.MeetingAttendances.AsNoTracking()
            .Where(a => a.CommitteeMeetingId == item.CommitteeMeetingId && a.AttendedFlag)
            .Select(a => a.CommitteeMemberId)
            .ToListAsync(cancellationToken);
        if (presentIds.Count > 0)
        {
            var seatId = await _db.CommitteeMembers.AsNoTracking()
                .Where(m => m.IsActive && m.ProfileId == voterProfileId && m.CommitteeId == item.CommitteeMeeting.CommitteeId)
                .Select(m => (long?)m.CommitteeMemberId)
                .FirstOrDefaultAsync(cancellationToken);
            if (seatId is null || !presentIds.Contains(seatId.Value))
                throw new InvalidOperationException("Mark attendance first. Only members present may vote.");
        }

        if (item.Votes.Any(v => v.VoterProfileId == voterProfileId))
            throw new InvalidOperationException("You have already voted on this application (one vote per Committee member).");

        item.Votes.Add(new CommitteeBallotVote
        {
            VoterProfileId = voterProfileId,
            VoteValue = value,
            CastAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);

        var against = item.Votes.Count(v => string.Equals(v.VoteValue, "AGAINST", StringComparison.OrdinalIgnoreCase));
        if (against >= AdverseVotesToReject)
            await AutoRejectAsync(item, against, actorUserId, cancellationToken);

        return await MapLoadedAsync(await ReloadItemAsync(itemId, cancellationToken), voterProfileId, cancellationToken);
    }

    public async Task<CommitteeBallotItemDto> ProceedToSignaturesAsync(
        long itemId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var item = await ReloadItemAsync(itemId, cancellationToken);
        if (string.Equals(item.Status, "REJECTED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("This application was auto-rejected and cannot proceed.");

        var mapped = await MapLoadedAsync(item, null, cancellationToken);
        if (mapped.AutoRejected)
            throw new InvalidOperationException("Two adverse votes have been reached — the application is auto-rejected.");
        if (mapped.VotesCast < VotesRequiredBeforeSignatures)
            throw new InvalidOperationException(
                $"Signatures open after more than 4 Committee members have voted on this applicant (currently {mapped.VotesCast}).");

        var committee = await FindStatusAsync("Committee", cancellationToken)
                        ?? throw new InvalidOperationException("Committee application status is missing.");
        var fromId = item.Application.ApplicationStatusId;
        item.Application.ApplicationStatusId = committee.ApplicationStatusId;
        item.Application.UpdatedAt = DateTime.UtcNow;
        item.Application.UpdatedByUserId = actorUserId;
        item.Status = "PASSED";
        item.ResolvedAt = DateTime.UtcNow;
        item.UpdatedByUserId = actorUserId;
        _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
        {
            ApplicationId = item.ApplicationId,
            FromStatusId = fromId,
            ToStatusId = committee.ApplicationStatusId,
            ChangedAt = DateTime.UtcNow,
            ChangedByUserId = actorUserId,
            Reason = "Committee ballot passed (fewer than two adverse votes) — collect 4 Committee + GM signatures."
        });
        await _db.SaveChangesAsync(cancellationToken);
        return await MapLoadedAsync(await ReloadItemAsync(itemId, cancellationToken), null, cancellationToken);
    }

    public async Task<CommitteeBallotItemDto> SignAdmissionAsync(
        long itemId,
        long signerProfileId,
        AdmissionSignRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var item = await ReloadItemAsync(itemId, cancellationToken);
        if (!string.Equals(item.Status, "PASSED", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(item.Application.Status?.Code, "Committee", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(item.Application.Status?.Code, "COMMITTEE", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The ballot must pass before signatures are collected.");

        var kind = (request.SignatoryKind ?? "COMMITTEE").Trim().ToUpperInvariant();
        var approvals = item.Application.ApplicationApprovals.Where(a => a.ApprovalDecision == "APPROVE").ToList();
        var committeeCount = approvals.Count(a => a.ApproverRole.Code is "COMMITTEE_MEMBER" or "CHAIRMAN" or "VICE_CHAIRMAN" or "TREASURER");
        var gmCount = approvals.Count(a => a.ApproverRole.Code is "GENERAL_MANAGER" or "MANAGER");

        CommitteeRole role;
        DateOnly? dateElected = null;
        if (kind is "COMMITTEE")
        {
            var seat = await _db.CommitteeMembers
                .Include(m => m.CommitteeRole)
                .FirstOrDefaultAsync(m => m.IsActive && m.ProfileId == signerProfileId && m.Committee.IsActive, cancellationToken)
                ?? throw new InvalidOperationException("Only a sitting Committee member may sign.");
            role = seat.CommitteeRole;
            if (approvals.Any(a => a.ApproverProfileId == signerProfileId && a.ApproverRoleId == role.CommitteeRoleId))
                throw new InvalidOperationException("You have already signed this application.");
            if (committeeCount >= CommitteeSignaturesRequired
                && role.Code is "COMMITTEE_MEMBER" or "CHAIRMAN" or "VICE_CHAIRMAN" or "TREASURER")
                throw new InvalidOperationException("Four Committee signatures are already recorded.");
        }
        else if (kind is "GENERAL_MANAGER")
        {
            role = await _db.CommitteeRoles.FirstOrDefaultAsync(r => r.Code == "GENERAL_MANAGER", cancellationToken)
                   ?? throw new InvalidOperationException("General Manager role is missing.");
            if (gmCount >= 1)
                throw new InvalidOperationException("The General Manager has already signed.");
        }
        else if (kind is "CHAIRMAN")
        {
            if (committeeCount < CommitteeSignaturesRequired || gmCount < 1)
                throw new InvalidOperationException("Collect 4 Committee signatures and the General Manager signature first.");
            if (!DateOnly.TryParse(request.DateElected, out var elected))
                throw new InvalidOperationException("Date Elected is required for the Chairman's signature.");
            if (string.IsNullOrWhiteSpace(request.MembershipNumber))
                throw new InvalidOperationException("The Chairman must assign a membership number at election.");
            MemberLifecycleService.NormalizeElectedType(request.ElectedMembershipType);
            dateElected = elected;
            role = await _db.CommitteeRoles.FirstOrDefaultAsync(r => r.Code == "CHAIRMAN", cancellationToken)
                   ?? throw new InvalidOperationException("Chairman role is missing.");
        }
        else
        {
            throw new InvalidOperationException("Signatory must be COMMITTEE, GENERAL_MANAGER or CHAIRMAN.");
        }

        _db.ApplicationApprovals.Add(new ApplicationApproval
        {
            ApplicationId = item.ApplicationId,
            ApproverProfileId = signerProfileId,
            ApproverRoleId = role.CommitteeRoleId,
            ApprovalDecision = "APPROVE",
            ApprovalSignatureUrl = string.IsNullOrWhiteSpace(request.SignatureName) ? null : request.SignatureName.Trim(),
            ApprovedAt = DateTime.UtcNow,
            DateElected = dateElected,
            Remarks = kind == "CHAIRMAN"
                ? $"Chairman election · {request.MembershipNumber?.Trim()} · {request.ElectedMembershipType}"
                : $"{kind} signature after admission ballot",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (kind == "CHAIRMAN" && dateElected is DateOnly de)
            await _members.ElectFromApplicationAsync(
                item.ApplicationId,
                actorUserId,
                de,
                request.MembershipNumber ?? "",
                request.ElectedMembershipType ?? "",
                cancellationToken);

        return await MapLoadedAsync(await ReloadItemAsync(itemId, cancellationToken), signerProfileId, cancellationToken);
    }

    public async Task<IReadOnlyList<BallotCandidateDto>> SearchCandidatesAsync(
        long meetingId,
        string? search,
        CancellationToken cancellationToken)
    {
        var term = (search ?? "").Trim();
        var linked = await _db.CommitteeBallotItems.AsNoTracking()
            .Where(i => i.CommitteeMeetingId == meetingId)
            .Select(i => i.ApplicationId)
            .ToListAsync(cancellationToken);

        var apps = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .Where(a => a.Status.Code == "TEMPORARY_MEMBER"
                        || a.Status.Code == "TemporaryMember"
                        || a.Status.Code == "Waitlist"
                        || a.Status.Code == "WAITLIST"
                        || a.Status.Code == "ElectionReview")
            .OrderByDescending(a => a.UpdatedAt)
            .Take(80)
            .ToListAsync(cancellationToken);

        var mapped = apps.Select(a =>
            {
                var name = string.Join(" ", new[] { a.Applicant.Title, a.Applicant.FirstName, a.Applicant.LastName }
                    .Where(v => !string.IsNullOrWhiteSpace(v)));
                return new BallotCandidateDto
                {
                    ApplicationId = a.ApplicationId,
                    ApplicationNo = a.ApplicationNo,
                    ApplicantName = name,
                    StatusCode = Normalize(a.Status?.Code),
                    StatusName = a.Status?.Name,
                    AlreadyLinked = linked.Contains(a.ApplicationId)
                };
            })
            .Where(c => term.Length < 2
                        || $"{c.ApplicantName} {c.ApplicationNo}".Contains(term, StringComparison.OrdinalIgnoreCase))
            .Take(40)
            .ToList();
        return mapped;
    }

    private async Task AutoRejectAsync(
        CommitteeBallotItem item,
        int against,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var rejected = await FindStatusAsync("NotElected", cancellationToken)
                       ?? await FindStatusAsync("NOTELECTED", cancellationToken)
                       ?? await FindStatusAsync("Rejected", cancellationToken)
                       ?? throw new InvalidOperationException("Not Elected status is missing.");

        var app = item.Application;
        var fromId = app.ApplicationStatusId;
        app.ApplicationStatusId = rejected.ApplicationStatusId;
        app.UpdatedAt = DateTime.UtcNow;
        app.UpdatedByUserId = actorUserId;
        item.Status = "REJECTED";
        item.ResolvedAt = DateTime.UtcNow;
        item.UpdatedByUserId = actorUserId;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var until = today.AddYears(1);
        _db.ApplicationExclusions.Add(new ApplicationExclusion
        {
            ApplicationId = app.ApplicationId,
            ApplicantProfileId = app.ApplicantProfileId,
            AdverseVoteCount = against,
            ExcludedDate = today,
            ExcludedUntilDate = until,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        });
        _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
        {
            ApplicationId = app.ApplicationId,
            FromStatusId = fromId,
            ToStatusId = rejected.ApplicationStatusId,
            ChangedAt = DateTime.UtcNow,
            ChangedByUserId = actorUserId,
            Action = ApplicationWorkflowRouter.RejectAction,
            Reason = "2 adverse votes reached — application auto-rejected. Re-apply after one year (Article 6b)."
        });
        await _db.SaveChangesAsync(cancellationToken);

        var applicant = app.Applicant;
        if (applicant is not null)
        {
            await _decisions.NotifyAsync(new ApplicationDecisionMessage
            {
                Kind = ApplicationDecisionKind.Rejected,
                ApplicationId = app.ApplicationId,
                ApplicationNo = app.ApplicationNo,
                ApplicantName = string.Join(" ", new[] { applicant.Title, applicant.FirstName, applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
                ApplicantProfileId = app.ApplicantProfileId,
                ApplicantEmail = applicant.Email,
                StageName = rejected.Name,
                IsFinal = true,
                Reason = "2 adverse votes reached — application auto-rejected. Re-apply after one year (Article 6b).",
                ReturnedStageName = rejected.Name
            }, cancellationToken);
        }
    }

    private async Task<CommitteeBallotItem> ReloadItemAsync(long itemId, CancellationToken cancellationToken) =>
        await _db.CommitteeBallotItems
            .Include(i => i.CommitteeMeeting)
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .Include(i => i.Application).ThenInclude(a => a.ElectionType)
            .Include(i => i.Application).ThenInclude(a => a.ApplicationApprovals).ThenInclude(x => x.ApproverRole)
            .Include(i => i.Application).ThenInclude(a => a.ApplicationApprovals).ThenInclude(x => x.Approver)
            .Include(i => i.Application).ThenInclude(a => a.ApplicationExclusions)
            .Include(i => i.Votes).ThenInclude(v => v.Voter)
            .FirstAsync(i => i.CommitteeBallotItemId == itemId, cancellationToken);

    private Task<CommitteeBallotItem?> ReloadItemByAppAsync(long meetingId, long applicationId, CancellationToken cancellationToken) =>
        _db.CommitteeBallotItems
            .Include(i => i.CommitteeMeeting)
            .Include(i => i.Application).ThenInclude(a => a.Applicant)
            .Include(i => i.Application).ThenInclude(a => a.Status)
            .Include(i => i.Application).ThenInclude(a => a.ElectionType)
            .Include(i => i.Application).ThenInclude(a => a.ApplicationApprovals).ThenInclude(x => x.ApproverRole)
            .Include(i => i.Application).ThenInclude(a => a.ApplicationApprovals).ThenInclude(x => x.Approver)
            .Include(i => i.Application).ThenInclude(a => a.ApplicationExclusions)
            .Include(i => i.Votes).ThenInclude(v => v.Voter)
            .FirstOrDefaultAsync(i => i.CommitteeMeetingId == meetingId && i.ApplicationId == applicationId, cancellationToken);

    private async Task<CommitteeBallotItemDto> MapLoadedAsync(
        CommitteeBallotItem item,
        long? viewerProfileId,
        CancellationToken cancellationToken)
    {
        var committeeId = item.CommitteeMeeting.CommitteeId;
        var seats = await LoadSeatsAsync(committeeId, item.CommitteeMeetingId, cancellationToken);
        var present = seats.Count(s => s.Present);
        var size = seats.Count > 0 ? seats.Count : MeetingQuorum;
        var people = await LoadBallotPeopleAsync(
            [item.CommitteeBallotItemId],
            [item.ApplicationId],
            seats.Select(s => s.ProfileId),
            cancellationToken);
        return MapItem(item, size, present, viewerProfileId, seats, people.Votes, people.Approvals, people.Names);
    }

    private static CommitteeBallotItemDto MapItem(
        CommitteeBallotItem item,
        int size,
        int presentCount,
        long? viewerProfileId,
        IReadOnlyList<BallotSeatDto> seats,
        IReadOnlyList<CommitteeBallotVote> votes,
        IReadOnlyList<ApplicationApproval> approvals,
        IReadOnlyDictionary<long, string> names)
    {
        var forCount = votes.Count(v => string.Equals(v.VoteValue, "FOR", StringComparison.OrdinalIgnoreCase));
        var against = votes.Count(v => string.Equals(v.VoteValue, "AGAINST", StringComparison.OrdinalIgnoreCase));
        var cast = votes.Count;
        var autoRejected = against >= AdverseVotesToReject
                           || string.Equals(item.Status, "REJECTED", StringComparison.OrdinalIgnoreCase);
        var mine = viewerProfileId is null
            ? null
            : votes.FirstOrDefault(v => v.VoterProfileId == viewerProfileId.Value);
        var open = string.Equals(item.Status, "OPEN", StringComparison.OrdinalIgnoreCase);
        var quorumMet = presentCount >= MeetingQuorum;
        var approved = approvals.Where(a =>
                string.Equals(a.ApprovalDecision, "APPROVE", StringComparison.OrdinalIgnoreCase)
                || string.Equals(a.ApprovalDecision, "APPROVED", StringComparison.OrdinalIgnoreCase))
            .ToList();
        var committeeSigs = approved.Count(a => a.ApproverRole?.Code is "COMMITTEE_MEMBER" or "CHAIRMAN" or "VICE_CHAIRMAN" or "TREASURER");
        var gmSigs = approved.Count(a => a.ApproverRole?.Code is "GENERAL_MANAGER" or "MANAGER");
        var chairmanSigned = approved.Any(a => a.DateElected is not null);
        var exclusion = item.Application.ApplicationExclusions?
            .Where(x => x.IsActive)
            .OrderByDescending(x => x.ExcludedUntilDate)
            .FirstOrDefault();

        var seatByProfile = seats.GroupBy(s => s.ProfileId).ToDictionary(g => g.Key, g => g.First());
        var voted = votes
            .GroupBy(v => v.VoterProfileId)
            .Select(g => g.First())
            .Select(vote =>
            {
                seatByProfile.TryGetValue(vote.VoterProfileId, out var seat);
                names.TryGetValue(vote.VoterProfileId, out var name);
                return new BallotVoterDto
                {
                    ProfileId = vote.VoterProfileId,
                    Name = !string.IsNullOrWhiteSpace(seat?.Name)
                        ? seat!.Name
                        : string.IsNullOrWhiteSpace(name) ? $"Member #{vote.VoterProfileId}" : name,
                    RoleName = seat?.RoleName ?? "",
                    VoteValue = vote.VoteValue,
                    Present = seat?.Present ?? false
                };
            })
            .ToList();
        var voteByProfile = voted.Select(v => v.ProfileId).ToHashSet();
        var eligible = seats.Count(s => s.Present) > 0 ? seats.Where(s => s.Present).ToList() : seats.ToList();
        var notVoted = eligible
            .Where(s => !voteByProfile.Contains(s.ProfileId))
            .Select(s => new BallotVoterDto
            {
                ProfileId = s.ProfileId,
                Name = s.Name,
                RoleName = s.RoleName,
                Present = s.Present
            })
            .ToList();

        var signatures = approved.Select(a =>
        {
            var code = a.ApproverRole?.Code ?? "";
            var kind = a.DateElected is not null
                ? "CHAIRMAN"
                : code is "GENERAL_MANAGER" or "MANAGER"
                    ? "GENERAL_MANAGER"
                    : "COMMITTEE";
            names.TryGetValue(a.ApproverProfileId, out var name);
            seatByProfile.TryGetValue(a.ApproverProfileId, out var seat);
            return new BallotSignatureDto
            {
                ProfileId = a.ApproverProfileId,
                Name = !string.IsNullOrWhiteSpace(seat?.Name)
                    ? seat!.Name
                    : string.IsNullOrWhiteSpace(name) ? $"Member #{a.ApproverProfileId}" : name,
                RoleName = a.ApproverRole?.Name ?? seat?.RoleName ?? code,
                Kind = kind,
                DateElected = a.DateElected?.ToString("yyyy-MM-dd")
            };
        }).ToList();

        var signedIds = signatures.Select(s => s.ProfileId).ToHashSet();
        var awaiting = new List<BallotSignatureDto>();
        if (string.Equals(item.Status, "PASSED", StringComparison.OrdinalIgnoreCase) || committeeSigs > 0 || gmSigs > 0)
        {
            if (committeeSigs < CommitteeSignaturesRequired)
            {
                foreach (var seat in seats.Where(s =>
                             !signedIds.Contains(s.ProfileId)
                             && !s.RoleName.Contains("General Manager", StringComparison.OrdinalIgnoreCase)))
                {
                    awaiting.Add(new BallotSignatureDto
                    {
                        ProfileId = seat.ProfileId,
                        Name = seat.Name,
                        RoleName = seat.RoleName,
                        Kind = "COMMITTEE"
                    });
                }
            }
            if (gmSigs < 1)
            {
                var gm = seats.FirstOrDefault(s => s.RoleName.Contains("General Manager", StringComparison.OrdinalIgnoreCase));
                awaiting.Add(new BallotSignatureDto
                {
                    ProfileId = gm?.ProfileId ?? 0,
                    Name = gm?.Name ?? "General Manager",
                    RoleName = gm?.RoleName ?? "General Manager",
                    Kind = "GENERAL_MANAGER"
                });
            }
            if (!chairmanSigned && committeeSigs >= CommitteeSignaturesRequired && gmSigs >= 1)
            {
                var chair = seats.FirstOrDefault(s => s.RoleName.Contains("Chairman", StringComparison.OrdinalIgnoreCase)
                                                    && !s.RoleName.Contains("Vice", StringComparison.OrdinalIgnoreCase));
                awaiting.Add(new BallotSignatureDto
                {
                    ProfileId = chair?.ProfileId ?? 0,
                    Name = chair?.Name ?? "Chairman",
                    RoleName = chair?.RoleName ?? "Chairman",
                    Kind = "CHAIRMAN"
                });
            }
        }

        return new CommitteeBallotItemDto
        {
            CommitteeBallotItemId = item.CommitteeBallotItemId,
            ApplicationId = item.ApplicationId,
            ApplicationNo = item.Application.ApplicationNo,
            ApplicantName = item.Application.Applicant is null
                ? item.Application.ApplicationNo
                : NameOf(item.Application.Applicant.FirstName, item.Application.Applicant.LastName),
            ApplicationStatusCode = Normalize(item.Application.Status?.Code),
            ItemStatus = item.Status,
            ForCount = forCount,
            AgainstCount = against,
            VotesCast = cast,
            CommitteeSize = size,
            QuorumRequired = MeetingQuorum,
            QuorumMet = quorumMet,
            AutoRejected = autoRejected,
            ExcludedUntil = exclusion?.ExcludedUntilDate?.ToString("yyyy-MM-dd"),
            MyVoteCast = mine is not null,
            MyVoteValue = mine?.VoteValue,
            CanProceedToSignatures = open && !autoRejected && cast >= VotesRequiredBeforeSignatures,
            CommitteeSignatures = committeeSigs,
            GmSignatures = gmSigs,
            ChairmanSigned = chairmanSigned,
            ReadyForChairman = string.Equals(item.Status, "PASSED", StringComparison.OrdinalIgnoreCase)
                               && committeeSigs >= CommitteeSignaturesRequired
                               && gmSigs >= 1
                               && !chairmanSigned,
            AppliedMembershipType = item.Application.ElectionType?.Name,
            Voted = voted,
            NotVoted = notVoted,
            Signatures = signatures,
            AwaitingSignatures = awaiting
        };
    }

    private static string NameOf(string? first, string? last) =>
        string.Join(" ", new[] { first, last }.Where(v => !string.IsNullOrWhiteSpace(v)));

    private async Task<(
        List<CommitteeBallotVote> Votes,
        List<ApplicationApproval> Approvals,
        Dictionary<long, string> Names)> LoadBallotPeopleAsync(
        IReadOnlyList<long> itemIds,
        IReadOnlyList<long> applicationIds,
        IEnumerable<long> extraProfileIds,
        CancellationToken cancellationToken)
    {
        var votes = itemIds.Count == 0
            ? []
            : await _db.CommitteeBallotVotes.AsNoTracking()
                .IgnoreQueryFilters()
                .Where(v => itemIds.Contains(v.CommitteeBallotItemId))
                .ToListAsync(cancellationToken);
        var approvals = applicationIds.Count == 0
            ? []
            : await _db.ApplicationApprovals.AsNoTracking()
                .IgnoreQueryFilters()
                .Include(a => a.ApproverRole)
                .Where(a => applicationIds.Contains(a.ApplicationId))
                .ToListAsync(cancellationToken);
        var nameIds = votes.Select(v => v.VoterProfileId)
            .Concat(approvals.Select(a => a.ApproverProfileId))
            .Concat(extraProfileIds);
        var names = await LoadProfileNamesAsync(nameIds, cancellationToken);
        return (votes, approvals, names);
    }

    private async Task<Dictionary<long, string>> LoadProfileNamesAsync(
        IEnumerable<long> ids,
        CancellationToken cancellationToken)
    {
        var list = ids.Where(id => id > 0).Distinct().ToList();
        if (list.Count == 0) return [];
        return await _db.Profiles.AsNoTracking()
            .IgnoreQueryFilters()
            .Where(p => list.Contains(p.ProfileId))
            .ToDictionaryAsync(p => p.ProfileId, p => NameOf(p.FirstName, p.LastName), cancellationToken);
    }

    private async Task<IReadOnlyList<BallotSeatDto>> LoadSeatsAsync(
        long committeeId,
        long meetingId,
        CancellationToken cancellationToken)
    {
        var members = await _db.CommitteeMembers.AsNoTracking()
            .IgnoreQueryFilters()
            .Include(m => m.Member)
            .Include(m => m.CommitteeRole)
            .Where(m => m.CommitteeId == committeeId && m.IsActive)
            .ToListAsync(cancellationToken);
        var present = await _db.MeetingAttendances.AsNoTracking()
            .Where(a => a.CommitteeMeetingId == meetingId && a.AttendedFlag)
            .Select(a => a.CommitteeMemberId)
            .ToListAsync(cancellationToken);
        return members.Select(m => new BallotSeatDto
        {
            CommitteeMemberId = m.CommitteeMemberId,
            ProfileId = m.ProfileId,
            Name = m.Member is null
                ? $"Member #{m.ProfileId}"
                : string.Join(" ", new[] { m.Member.FirstName, m.Member.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
            RoleName = m.CommitteeRole?.Name ?? "",
            Present = present.Contains(m.CommitteeMemberId)
        }).ToList();
    }

    private async Task<int> SittingCountAsync(long committeeId, CancellationToken cancellationToken)
    {
        var n = await _db.CommitteeMembers.CountAsync(m => m.CommitteeId == committeeId && m.IsActive, cancellationToken);
        return n > 0 ? n : MeetingQuorum;
    }

    private Task<int> PresentCountAsync(long meetingId, CancellationToken cancellationToken) =>
        _db.MeetingAttendances.CountAsync(a => a.CommitteeMeetingId == meetingId && a.AttendedFlag, cancellationToken);

    private Task<bool> IsSittingMemberAsync(long profileId, CancellationToken cancellationToken) =>
        _db.CommitteeMembers.AsNoTracking().AnyAsync(
            m => m.IsActive && m.ProfileId == profileId && m.Committee.IsActive,
            cancellationToken);

    private async Task<ApplicationStatus?> FindStatusAsync(string code, CancellationToken cancellationToken)
    {
        var rows = await _db.ApplicationStatuses.ToListAsync(cancellationToken);
        var compact = code.Replace("_", "");
        return rows.FirstOrDefault(s =>
            string.Equals(s.Code, code, StringComparison.OrdinalIgnoreCase)
            || string.Equals(s.Code.Replace("_", ""), compact, StringComparison.OrdinalIgnoreCase));
    }

    private static string? Normalize(string? statusCode)
    {
        if (string.IsNullOrWhiteSpace(statusCode)) return statusCode;
        return statusCode.Trim().ToUpperInvariant() switch
        {
            "TEMPORARY_MEMBER" or "TEMPORARYMEMBER" => "TemporaryMember",
            "WAITLIST" or "WAITLISTED" => "Waitlist",
            "ELECTIONREVIEW" or "ELECTION_REVIEW" => "ElectionReview",
            "NOTELECTED" or "NOT_ELECTED" => "NotElected",
            "COMMITTEE" => "Committee",
            "APPROVED" => "Approved",
            _ => statusCode
        };
    }
}
