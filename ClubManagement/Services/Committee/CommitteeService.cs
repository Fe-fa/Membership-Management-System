using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Committee;
using ClubManagement.Entities.Committee;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Lookups;
using ClubManagement.Services.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.Committee;

public interface ICommitteeService
{
    Task EnsureLookupsAsync(CancellationToken cancellationToken);
    Task<bool> CanManageAsync(long? profileId, IReadOnlyList<string> systemRoles, CancellationToken cancellationToken);
    Task<CommitteeDetailDto?> GetCurrentAsync(string? type, CancellationToken cancellationToken);
    Task<CommitteeDetailDto?> GetByIdAsync(long committeeId, CancellationToken cancellationToken);
    Task<CommitteeDetailDto> CreateAsync(CreateCommitteeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeDetailDto?> UpdateAsync(long committeeId, UpdateCommitteeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeMemberDto> AddMemberAsync(long committeeId, AddCommitteeMemberRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeMemberDto> UpdateMemberContactAsync(long committeeId, long committeeMemberId, UpdateCommitteeMemberContactRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task SoftRemoveMemberAsync(long committeeId, long committeeMemberId, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeMeetingDto> CreateMeetingAsync(long committeeId, CreateCommitteeMeetingRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeMeetingDto?> UpdateMeetingStatusAsync(long meetingId, UpdateMeetingStatusRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<CommitteeMeetingDto?> UpdateMeetingMinutesAsync(long meetingId, UpdateMeetingMinutesRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<CommitteeRoleOptionDto>> ListRolesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<MeetingTypeOptionDto>> ListMeetingTypesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<ProfileSearchHitDto>> SearchProfilesAsync(string? search, CancellationToken cancellationToken);
    Task<IReadOnlyList<ActiveCommitteeOptionDto>> ListActiveForAssignAsync(CancellationToken cancellationToken);
}

public class CommitteeService : ICommitteeService
{
    public static readonly HashSet<string> OfficerRoleCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        "CHAIRMAN", "VICE_CHAIRMAN", "TREASURER", "GENERAL_MANAGER"
    };

    private static readonly (string Code, string Name, int Sort, bool CanApprove)[] RoleSeed =
    [
        ("CHAIRMAN", "Chairman", 10, true),
        ("VICE_CHAIRMAN", "Vice Chairman", 20, false),
        ("TREASURER", "Treasurer", 30, true),
        ("GENERAL_MANAGER", "General Manager", 40, true),
        ("COMMITTEE_MEMBER", "Committee Member", 100, false),
    ];

    private static readonly (string Code, string Name, int Sort, string? Description)[] MeetingTypeSeed =
    [
        ("COMMITTEE", "Committee Meeting", 1, "Regular committee meeting for membership and club business."),
        ("AGM", "Annual General Meeting", 2, "Annual General Meeting (Article 52)."),
        ("EGM", "Extraordinary General Meeting", 3, "Extraordinary General Meeting."),
        ("INTERVIEW", "Interview", 4, "Membership interview sitting."),
    ];

    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailSender _email;
    private readonly IInterviewConductService _interviews;
    private readonly AppPublicOptions _app;

    public CommitteeService(
        ApplicationModuleDbContext db,
        IEmailSender email,
        IInterviewConductService interviews,
        IOptions<AppPublicOptions> app)
    {
        _db = db;
        _email = email;
        _interviews = interviews;
        _app = app.Value;
    }

    public async Task EnsureLookupsAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.Committee', N'committee_type') IS NULL
    ALTER TABLE dbo.Committee ADD committee_type NVARCHAR(40) NOT NULL CONSTRAINT DF_committee_type DEFAULT(N'main');
IF COL_LENGTH(N'dbo.Committee_meeting', N'meeting_name') IS NULL
    ALTER TABLE dbo.Committee_meeting ADD meeting_name NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.Committee_meeting', N'meeting_time') IS NULL
    ALTER TABLE dbo.Committee_meeting ADD meeting_time NVARCHAR(20) NULL;
", cancellationToken);

        foreach (var (code, name, sort, canApprove) in RoleSeed)
        {
            var existing = await _db.CommitteeRoles.FirstOrDefaultAsync(r => r.Code == code, cancellationToken);
            if (existing is null)
            {
                _db.CommitteeRoles.Add(new CommitteeRole
                {
                    Code = code,
                    Name = name,
                    SortOrder = sort,
                    CanApproveCredit = canApprove,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
            else
            {
                existing.Name = name;
                existing.SortOrder = sort;
                existing.CanApproveCredit = canApprove;
                existing.IsActive = true;
            }
        }

        foreach (var (code, name, sort, description) in MeetingTypeSeed)
        {
            var existing = await _db.MeetingTypes.FirstOrDefaultAsync(t => t.Code == code, cancellationToken);
            if (existing is null)
            {
                // Prefer placing COMMITTEE first so meeting_type_id=1 is Committee Meeting when the table is empty.
                _db.MeetingTypes.Add(new MeetingType
                {
                    Code = code,
                    Name = name,
                    Description = description,
                    SortOrder = sort,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
            else
            {
                existing.Name = name;
                existing.Description = description;
                existing.SortOrder = sort;
                existing.IsActive = true;
            }
        }

        // Rename legacy REGULAR → keep as alias inactive if COMMITTEE exists
        var regular = await _db.MeetingTypes.FirstOrDefaultAsync(t => t.Code == "REGULAR", cancellationToken);
        if (regular is not null && await _db.MeetingTypes.AnyAsync(t => t.Code == "COMMITTEE", cancellationToken))
        {
            regular.IsActive = false;
            regular.Description = "Legacy alias — use COMMITTEE (Committee Meeting).";
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    private static readonly string[] ManageSystemRoles =
    [
        "ADMIN",
        "SUPER_ADMIN",
        "GENERAL_MANAGER",
        "CHAIRMAN",
        "TREASURER"
    ];

    public async Task<bool> CanManageAsync(
        long? profileId,
        IReadOnlyList<string> systemRoles,
        CancellationToken cancellationToken)
    {
        // Staff officers / admins may manage before they hold a credit-approving committee seat.
        if (systemRoles.Any(r => ManageSystemRoles.Contains(r, StringComparer.OrdinalIgnoreCase)))
            return true;

        if (profileId is null) return false;

        return await _db.CommitteeMembers.AsNoTracking()
            .AnyAsync(
                m => m.IsActive
                     && m.ProfileId == profileId.Value
                     && m.CommitteeRole.CanApproveCredit
                     && m.CommitteeRole.IsActive,
                cancellationToken);
    }

    public async Task<CommitteeDetailDto?> GetCurrentAsync(string? type, CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        var committeeType = NormalizeType(type);
        var committee = await _db.Committees.AsNoTracking()
            .Where(c => c.IsActive
                        && (c.CommitteeType == committeeType
                            || (committeeType == "main"
                                && (c.CommitteeType == null || c.CommitteeType == ""))))
            .OrderByDescending(c => c.CommitteeId)
            .FirstOrDefaultAsync(cancellationToken);
        if (committee is null) return null;
        return await MapDetailAsync(committee.CommitteeId, cancellationToken);
    }

    public async Task<CommitteeDetailDto?> GetByIdAsync(long committeeId, CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        return await MapDetailAsync(committeeId, cancellationToken);
    }

    public async Task<CommitteeDetailDto> CreateAsync(
        CreateCommitteeRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        var name = (request.CommitteeName ?? "").Trim();
        if (name.Length < 3)
            throw new InvalidOperationException("Committee name is required (at least 3 characters).");

        var type = NormalizeType(request.Type);
        var termStart = ParseOptionalDate(request.TermStart, "term start");
        var termEnd = ParseOptionalDate(request.TermEnd, "term end");
        if (termStart is not null && termEnd is not null && termEnd < termStart)
            throw new InvalidOperationException("Term end must be on or after term start.");

        var previous = await _db.Committees
            .Where(c => c.IsActive && c.CommitteeType == type)
            .ToListAsync(cancellationToken);
        foreach (var prev in previous)
        {
            prev.IsActive = false;
            prev.UpdatedByUserId = actorUserId;
        }

        var committee = new Entities.Committee.Committee
        {
            CommitteeName = name,
            CommitteeType = type,
            TermStart = termStart,
            TermEnd = termEnd,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.Committees.Add(committee);
        await _db.SaveChangesAsync(cancellationToken);

        return (await MapDetailAsync(committee.CommitteeId, cancellationToken))!;
    }

    public async Task<CommitteeDetailDto?> UpdateAsync(
        long committeeId,
        UpdateCommitteeRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        var committee = await _db.Committees.FirstOrDefaultAsync(c => c.CommitteeId == committeeId, cancellationToken);
        if (committee is null) return null;

        var name = (request.CommitteeName ?? "").Trim();
        if (name.Length < 3)
            throw new InvalidOperationException("Committee name is required (at least 3 characters).");

        var termStart = ParseOptionalDate(request.TermStart, "term start");
        var termEnd = ParseOptionalDate(request.TermEnd, "term end");
        if (termStart is not null && termEnd is not null && termEnd < termStart)
            throw new InvalidOperationException("Term end must be on or after term start.");

        committee.CommitteeName = name;
        committee.TermStart = termStart;
        committee.TermEnd = termEnd;
        committee.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDetailAsync(committeeId, cancellationToken);
    }

    public async Task<CommitteeMemberDto> AddMemberAsync(
        long committeeId,
        AddCommitteeMemberRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        var committee = await _db.Committees.FirstOrDefaultAsync(c => c.CommitteeId == committeeId, cancellationToken)
            ?? throw new InvalidOperationException("Committee not found.");

        var role = await _db.CommitteeRoles.FirstOrDefaultAsync(
            r => r.CommitteeRoleId == request.CommitteeRoleId && r.IsActive,
            cancellationToken)
            ?? throw new InvalidOperationException("Committee role not found.");

        var profile = await _db.Profiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.ProfileId == request.ProfileId && !p.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Profile not found.");

        var alreadyActive = await _db.CommitteeMembers.AnyAsync(
            m => m.CommitteeId == committeeId && m.ProfileId == request.ProfileId && m.IsActive,
            cancellationToken);
        if (alreadyActive)
            throw new InvalidOperationException("This member is already on the active committee.");

        var isOfficer = OfficerRoleCodes.Contains(role.Code);
        if (!isOfficer && string.Equals(role.Code, "COMMITTEE_MEMBER", StringComparison.OrdinalIgnoreCase))
        {
            var currentNonOfficerIds = await _db.CommitteeMembers
                .Where(m => m.CommitteeId == committeeId
                            && m.IsActive
                            && m.CommitteeRole.Code == "COMMITTEE_MEMBER")
                .Select(m => m.ProfileId)
                .ToListAsync(cancellationToken);
            if (currentNonOfficerIds.Count >= 8)
                throw new InvalidOperationException(
                    "Article 19: the committee already has 8 non-officer Committee Members.");

            var nextIds = currentNonOfficerIds.Append(request.ProfileId).Distinct().ToList();
            if (nextIds.Count == 8)
            {
                var aviationCount = await _db.MemberAviationDetails.AsNoTracking()
                    .Where(d => nextIds.Contains(d.ProfileId) && d.IsAviationAffiliated)
                    .Select(d => d.ProfileId)
                    .Distinct()
                    .CountAsync(cancellationToken);
                if (aviationCount < 6)
                    throw new InvalidOperationException(
                        "Article 19: at least 6 of the 8 non-officer Committee Members must be aviation-affiliated.");
            }
        }
        else if (!isOfficer)
        {
            throw new InvalidOperationException($"Role '{role.Code}' is not assignable.");
        }
        else
        {
            var roleTaken = await _db.CommitteeMembers.AnyAsync(
                m => m.CommitteeId == committeeId
                     && m.IsActive
                     && m.CommitteeRoleId == role.CommitteeRoleId,
                cancellationToken);
            if (roleTaken)
                throw new InvalidOperationException($"An active {role.Name} is already appointed.");
        }

        var appointed = ParseOptionalDate(request.AppointedDate, "appointed date")
                        ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var member = new CommitteeMember
        {
            CommitteeId = committeeId,
            ProfileId = request.ProfileId,
            CommitteeRoleId = role.CommitteeRoleId,
            AppointedDate = appointed,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.CommitteeMembers.Add(member);
        await _db.SaveChangesAsync(cancellationToken);

        return (await MapMemberAsync(member.CommitteeMemberId, cancellationToken))!;
    }

    public async Task SoftRemoveMemberAsync(
        long committeeId,
        long committeeMemberId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var member = await _db.CommitteeMembers
            .Include(m => m.CommitteeRole)
            .FirstOrDefaultAsync(
                m => m.CommitteeMemberId == committeeMemberId && m.CommitteeId == committeeId,
                cancellationToken)
            ?? throw new InvalidOperationException("Committee member not found.");

        if (!member.IsActive) return;

        member.IsActive = false;
        member.EndDate = DateOnly.FromDateTime(DateTime.UtcNow);
        member.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);

        // Soft-remove can only help Article 19 counts; no need to re-assert hard fail.
    }

    public async Task<CommitteeMemberDto> UpdateMemberContactAsync(
        long committeeId,
        long committeeMemberId,
        UpdateCommitteeMemberContactRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var member = await _db.CommitteeMembers
            .FirstOrDefaultAsync(
                m => m.CommitteeMemberId == committeeMemberId && m.CommitteeId == committeeId && m.IsActive,
                cancellationToken)
            ?? throw new InvalidOperationException("Committee member not found.");

        var profile = await _db.Profiles.FirstOrDefaultAsync(
            p => p.ProfileId == member.ProfileId && !p.IsDeleted,
            cancellationToken)
            ?? throw new InvalidOperationException("Profile not found.");

        profile.Mobile = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        profile.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return (await MapMemberAsync(committeeMemberId, cancellationToken))!;
    }

    public async Task<CommitteeMeetingDto> CreateMeetingAsync(
        long committeeId,
        CreateCommitteeMeetingRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        _ = await _db.Committees.FirstOrDefaultAsync(c => c.CommitteeId == committeeId, cancellationToken)
            ?? throw new InvalidOperationException("Committee not found.");

        var meetingType = await _db.MeetingTypes.FirstOrDefaultAsync(
            t => t.MeetingTypeId == request.MeetingTypeId && t.IsActive,
            cancellationToken)
            ?? throw new InvalidOperationException("Meeting type not found.");

        if (!DateOnly.TryParse(request.MeetingDate, out var meetingDate))
            throw new InvalidOperationException("Enter a valid meeting date.");

        var timeText = string.IsNullOrWhiteSpace(request.MeetingTime)
            ? null
            : request.MeetingTime.Trim();
        if (timeText is not null && !TimeOnly.TryParse(timeText, out _))
            throw new InvalidOperationException("Enter a valid meeting time (HH:mm).");

        if (request.ChairProfileId is long chairId)
        {
            var chairExists = await _db.Profiles.AnyAsync(p => p.ProfileId == chairId && !p.IsDeleted, cancellationToken);
            if (!chairExists) throw new InvalidOperationException("Chair profile not found.");
        }

        var meeting = new CommitteeMeeting
        {
            CommitteeId = committeeId,
            MeetingTypeId = meetingType.MeetingTypeId,
            MeetingDate = meetingDate,
            MeetingTime = timeText,
            MeetingName = string.IsNullOrWhiteSpace(request.MeetingName) ? null : request.MeetingName.Trim(),
            ChairProfileId = request.ChairProfileId,
            Status = "SCHEDULED",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.CommitteeMeetings.Add(meeting);
        await _db.SaveChangesAsync(cancellationToken);

        var link = (request.MeetingLink ?? "").Trim();
        if (link.Length >= 3)
        {
            meeting.MinutesUrl = link;
            await _db.SaveChangesAsync(cancellationToken);
        }

        foreach (var applicationId in (request.ApplicationIds ?? []).Where(id => id > 0).Distinct())
            await _interviews.AttachAsync(meeting.CommitteeMeetingId, applicationId, actorUserId, cancellationToken);

        if (link.Length >= 3 && !(request.ApplicationIds?.Any(id => id > 0) ?? false))
        {
            var reloaded = await _db.CommitteeMeetings
                .Include(m => m.Committee)
                .Include(m => m.MeetingType)
                .FirstAsync(m => m.CommitteeMeetingId == meeting.CommitteeMeetingId, cancellationToken);
            await ShareMeetingLinkAsync(reloaded, link, cancellationToken);
        }

        return (await MapMeetingAsync(meeting.CommitteeMeetingId, cancellationToken))!;
    }

    public async Task<CommitteeMeetingDto?> UpdateMeetingStatusAsync(
        long meetingId,
        UpdateMeetingStatusRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.CommitteeMeetings.FirstOrDefaultAsync(
            m => m.CommitteeMeetingId == meetingId,
            cancellationToken);
        if (meeting is null) return null;

        var status = (request.Status ?? "").Trim().ToUpperInvariant();
        if (status is not ("SCHEDULED" or "HELD" or "CANCELLED"))
            throw new InvalidOperationException("Status must be SCHEDULED, HELD, or CANCELLED.");

        if (!string.Equals(meeting.Status, "SCHEDULED", StringComparison.OrdinalIgnoreCase)
            && string.Equals(status, "SCHEDULED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only SCHEDULED meetings can return to SCHEDULED.");

        if (status == "HELD" && !request.Force)
        {
            var pending = await _db.Interviews.CountAsync(
                i => i.CommitteeMeetingId == meetingId && (i.Outcome == null || i.Outcome == ""),
                cancellationToken);
            if (pending > 0)
                throw new InvalidOperationException(
                    $"{pending} linked interview(s) still have no outcome. Record outcomes first, or confirm to mark Held anyway.");
        }

        meeting.Status = status;
        meeting.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await MapMeetingAsync(meetingId, cancellationToken);
    }

    public async Task<CommitteeMeetingDto?> UpdateMeetingMinutesAsync(
        long meetingId,
        UpdateMeetingMinutesRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.CommitteeMeetings
            .Include(m => m.Committee)
            .Include(m => m.MeetingType)
            .FirstOrDefaultAsync(m => m.CommitteeMeetingId == meetingId, cancellationToken);
        if (meeting is null) return null;

        var url = (request.MinutesUrl ?? "").Trim();
        if (url.Length < 3)
            throw new InvalidOperationException("Meeting / minutes link is required.");

        meeting.MinutesUrl = url;
        meeting.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);

        await ShareMeetingLinkAsync(meeting, url, cancellationToken);

        return await MapMeetingAsync(meetingId, cancellationToken);
    }

    private async Task ShareMeetingLinkAsync(
        CommitteeMeeting meeting,
        string url,
        CancellationToken cancellationToken)
    {
        var meetingLabel = string.IsNullOrWhiteSpace(meeting.MeetingName)
            ? (meeting.MeetingType?.Name ?? "Committee meeting")
            : meeting.MeetingName!;
        var when =
            $"{meeting.MeetingDate:dddd, dd MMMM yyyy}" +
            (string.IsNullOrWhiteSpace(meeting.MeetingTime) ? "" : $" at {meeting.MeetingTime}");
        var committeeName = meeting.Committee?.CommitteeName ?? "Committee";
        var portal = (_app.PublicBaseUrl ?? "http://localhost:8080").TrimEnd('/');

        var subject = $"Meeting link: {meetingLabel} — {meeting.MeetingDate:dd MMM yyyy}";
        var bodyForCommittee =
            $"A meeting link has been shared for {committeeName}.\n\n" +
            $"Meeting: {meetingLabel}\n" +
            $"When: {when}\n" +
            $"Link: {url}\n\n" +
            $"Open your portal: {portal}/governance";
        var bodyForApplicant =
            $"Your interview / committee sitting link is ready.\n\n" +
            $"Meeting: {meetingLabel}\n" +
            $"When: {when}\n" +
            $"Link: {url}\n\n" +
            $"Open your dashboard: {portal}/";

        var type = await EnsureNotificationTypeAsync(
            "MEETING_LINK",
            "Meeting link shared",
            26,
            cancellationToken);

        // Active committee members only (this meeting's committee).
        var memberProfiles = await _db.CommitteeMembers.AsNoTracking()
            .Include(m => m.Member)
            .Where(m => m.CommitteeId == meeting.CommitteeId && m.IsActive)
            .Select(m => new { m.ProfileId, m.Member.Email })
            .ToListAsync(cancellationToken);

        // Applicants linked to this sitting via Interview.
        var applicantProfiles = await _db.Interviews.AsNoTracking()
            .Where(i => i.CommitteeMeetingId == meeting.CommitteeMeetingId)
            .Select(i => new
            {
                ProfileId = i.Application.ApplicantProfileId,
                Email = i.Application.Applicant.Email,
                ApplicationId = i.ApplicationId
            })
            .ToListAsync(cancellationToken);

        var recipientKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var member in memberProfiles)
        {
            var key = $"M:{member.ProfileId}";
            if (!recipientKeys.Add(key)) continue;
            await CreateInAppAndEmailAsync(
                type.NotificationTypeId,
                member.ProfileId,
                member.Email,
                subject,
                bodyForCommittee,
                "COMMITTEE_MEETING",
                meeting.CommitteeMeetingId,
                cancellationToken);
        }

        foreach (var applicant in applicantProfiles)
        {
            var key = $"A:{applicant.ProfileId}";
            if (!recipientKeys.Add(key)) continue;
            await CreateInAppAndEmailAsync(
                type.NotificationTypeId,
                applicant.ProfileId,
                applicant.Email,
                subject,
                bodyForApplicant,
                "APPLICATION",
                applicant.ApplicationId,
                cancellationToken);
        }
    }

    private async Task CreateInAppAndEmailAsync(
        long notificationTypeId,
        long profileId,
        string? email,
        string subject,
        string body,
        string relatedType,
        long relatedId,
        CancellationToken cancellationToken)
    {
        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);
        var recipient = !string.IsNullOrWhiteSpace(email) ? email! : profileId.ToString();

        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = notificationTypeId,
            Recipient = recipient,
            Channel = "IN_APP",
            SentDate = DateTime.UtcNow,
            Content = $"{subject}\n\n{body}",
            RelatedEntityType = relatedType,
            RelatedEntityId = relatedId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(email))
        {
            try
            {
                await _email.SendAsync(email, subject, body, cancellationToken);
            }
            catch
            {
                // Do not fail minutes save if SMTP is unavailable.
            }
        }
    }

    private async Task<NotificationType> EnsureNotificationTypeAsync(
        string code,
        string name,
        int sortOrder,
        CancellationToken cancellationToken)
    {
        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == code, cancellationToken);
        if (type is not null) return type;
        type = new NotificationType
        {
            Code = code,
            Name = name,
            SortOrder = sortOrder,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.NotificationTypes.Add(type);
        await _db.SaveChangesAsync(cancellationToken);
        return type;
    }

    public async Task<IReadOnlyList<CommitteeRoleOptionDto>> ListRolesAsync(CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        var roles = await _db.CommitteeRoles.AsNoTracking()
            .Where(r => r.IsActive)
            .OrderBy(r => r.SortOrder).ThenBy(r => r.Name)
            .ToListAsync(cancellationToken);
        return roles.Select(r => new CommitteeRoleOptionDto
        {
            CommitteeRoleId = r.CommitteeRoleId,
            Code = r.Code,
            Name = r.Name,
            SortOrder = r.SortOrder,
            CanApproveCredit = r.CanApproveCredit,
            IsOfficer = OfficerRoleCodes.Contains(r.Code)
        }).ToList();
    }

    public async Task<IReadOnlyList<MeetingTypeOptionDto>> ListMeetingTypesAsync(CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        return await _db.MeetingTypes.AsNoTracking()
            .Where(t => t.IsActive)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Name)
            .Select(t => new MeetingTypeOptionDto
            {
                MeetingTypeId = t.MeetingTypeId,
                Code = t.Code,
                Name = t.Name,
                SortOrder = t.SortOrder
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ProfileSearchHitDto>> SearchProfilesAsync(
        string? search,
        CancellationToken cancellationToken)
    {
        var term = (search ?? "").Trim();
        if (term.Length < 2) return [];

        var rows = await _db.Accounts.AsNoTracking()
            .Where(a => !a.IsDeleted && a.IsActive
                        && (
                            (a.MembershipNo != null && a.MembershipNo.Contains(term))
                            || (a.Profile.FirstName != null && a.Profile.FirstName.Contains(term))
                            || (a.Profile.LastName != null && a.Profile.LastName.Contains(term))
                            || (a.Profile.Email != null && a.Profile.Email.Contains(term))))
            .OrderBy(a => a.MembershipNo)
            .Take(20)
            .Select(a => new
            {
                a.ProfileId,
                a.MembershipNo,
                a.Profile.FirstName,
                a.Profile.LastName,
                a.Profile.Title,
                Affiliated = a.Profile.MemberAviationDetails
                    .OrderByDescending(d => d.MemberAviationDetailId)
                    .Select(d => (bool?)d.IsAviationAffiliated)
                    .FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        return rows.Select(a => new ProfileSearchHitDto
        {
            ProfileId = a.ProfileId,
            MembershipNo = a.MembershipNo,
            Name = string.Join(" ", new[] { a.Title, a.FirstName, a.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
            IsAviationAffiliated = a.Affiliated ?? false
        }).ToList();
    }

    public async Task<IReadOnlyList<ActiveCommitteeOptionDto>> ListActiveForAssignAsync(
        CancellationToken cancellationToken)
    {
        await EnsureLookupsAsync(cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var committees = await _db.Committees.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.CommitteeName)
            .ToListAsync(cancellationToken);

        var committeeIds = committees.Select(c => c.CommitteeId).ToList();
        var meetings = await _db.CommitteeMeetings.AsNoTracking()
            .Include(m => m.MeetingType)
            .Include(m => m.Chair)
            .Where(m => committeeIds.Contains(m.CommitteeId)
                        && m.Status == "SCHEDULED"
                        && m.MeetingDate >= today)
            .OrderBy(m => m.MeetingDate)
            .ThenBy(m => m.MeetingTime)
            .ToListAsync(cancellationToken);

        return committees.Select(c => new ActiveCommitteeOptionDto
        {
            CommitteeId = c.CommitteeId,
            CommitteeName = c.CommitteeName,
            Type = string.IsNullOrWhiteSpace(c.CommitteeType) ? "main" : c.CommitteeType,
            TermStart = c.TermStart?.ToString("yyyy-MM-dd"),
            TermEnd = c.TermEnd?.ToString("yyyy-MM-dd"),
            ScheduledMeetings = meetings
                .Where(m => m.CommitteeId == c.CommitteeId)
                .Select(MapMeetingEntity)
                .ToList()
        }).ToList();
    }

    private async Task<CommitteeDetailDto?> MapDetailAsync(long committeeId, CancellationToken cancellationToken)
    {
        var committee = await _db.Committees.AsNoTracking()
            .FirstOrDefaultAsync(c => c.CommitteeId == committeeId, cancellationToken);
        if (committee is null) return null;

        var members = await _db.CommitteeMembers.AsNoTracking()
            .Where(m => m.CommitteeId == committeeId && m.IsActive)
            .Include(m => m.Member)
            .Include(m => m.CommitteeRole)
            .OrderBy(m => m.CommitteeRole.SortOrder)
            .ThenBy(m => m.Member.LastName)
            .ToListAsync(cancellationToken);

        var profileIds = members.Select(m => m.ProfileId).Distinct().ToList();
        var aviation = await _db.MemberAviationDetails.AsNoTracking()
            .Where(d => profileIds.Contains(d.ProfileId))
            .GroupBy(d => d.ProfileId)
            .Select(g => new
            {
                ProfileId = g.Key,
                Affiliated = g.OrderByDescending(x => x.MemberAviationDetailId)
                    .Select(x => x.IsAviationAffiliated)
                    .FirstOrDefault()
            })
            .ToDictionaryAsync(x => x.ProfileId, x => x.Affiliated, cancellationToken);

        var profileNos = members
            .Select(m => m.Member.MembershipNo)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n!)
            .Distinct()
            .ToList();

        var accountRows = await _db.Accounts.AsNoTracking()
            .Where(a => !a.IsDeleted
                        && (profileIds.Contains(a.ProfileId)
                            || (a.MembershipNo != null && profileNos.Contains(a.MembershipNo))))
            .Select(a => new MemberAccountSnapshot(
                a.ProfileId,
                a.AccountId,
                a.MembershipNo,
                a.IsActive,
                a.MembershipType.Name,
                a.CurrentMemberStatus.Name,
                a.CurrentMemberStatus.Code,
                a.CurrentMemberStatus.IsActiveStatus,
                a.JoinedDate ?? a.StartDate,
                a.EndDate))
            .ToListAsync(cancellationToken);

        var accountByProfile = accountRows
            .GroupBy(a => a.ProfileId)
            .ToDictionary(g => g.Key, g => PickLiveAccount(g));
        var accountByNo = accountRows
            .Where(a => !string.IsNullOrWhiteSpace(a.MembershipNo))
            .GroupBy(a => a.MembershipNo!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => PickLiveAccount(g), StringComparer.OrdinalIgnoreCase);

        var memberDtos = members.Select(m =>
        {
            aviation.TryGetValue(m.ProfileId, out var affiliated);
            MemberAccountSnapshot? account = null;
            if (!string.IsNullOrWhiteSpace(m.Member.MembershipNo))
                accountByNo.TryGetValue(m.Member.MembershipNo, out account);
            if (account is null)
                accountByProfile.TryGetValue(m.ProfileId, out account);
            return MapMemberEntity(m, affiliated, account);
        }).ToList();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var meetings = await _db.CommitteeMeetings.AsNoTracking()
            .Where(m => m.CommitteeId == committeeId)
            .Include(m => m.MeetingType)
            .Include(m => m.Chair)
            .OrderByDescending(m => m.MeetingDate)
            .ThenByDescending(m => m.CommitteeMeetingId)
            .Take(40)
            .ToListAsync(cancellationToken);

        var meetingDtos = meetings.Select(MapMeetingEntity).ToList();
        var meetingIds = meetings.Select(m => m.CommitteeMeetingId).ToList();
        if (meetingIds.Count > 0)
        {
            var interviewRows = await _db.Interviews.AsNoTracking()
                .Where(i => i.CommitteeMeetingId != null && meetingIds.Contains(i.CommitteeMeetingId.Value))
                .Select(i => new { MeetingId = i.CommitteeMeetingId!.Value, i.Outcome })
                .ToListAsync(cancellationToken);
            var interviewStats = interviewRows
                .GroupBy(x => x.MeetingId)
                .Select(g => new
                {
                    MeetingId = g.Key,
                    Linked = g.Count(),
                    Pending = g.Count(x => string.IsNullOrWhiteSpace(x.Outcome))
                })
                .ToList();
            var byId = interviewStats.ToDictionary(x => x.MeetingId);
            foreach (var dto in meetingDtos)
            {
                if (!byId.TryGetValue(dto.CommitteeMeetingId, out var s)) continue;
                dto.LinkedInterviewCount = s.Linked;
                dto.PendingOutcomeCount = s.Pending;
            }
        }

        var next = meetingDtos
            .Where(m => string.Equals(m.Status, "SCHEDULED", StringComparison.OrdinalIgnoreCase)
                        && DateOnly.TryParse(m.MeetingDate, out var d) && d >= today)
            .OrderBy(m => m.MeetingDate)
            .ThenBy(m => m.MeetingTime)
            .FirstOrDefault();

        var nonOfficers = memberDtos.Where(m => m.RoleCode == "COMMITTEE_MEMBER").ToList();
        var aviationActive = nonOfficers.Count(m => m.IsAviationAffiliated);

        return new CommitteeDetailDto
        {
            CommitteeId = committee.CommitteeId,
            CommitteeName = committee.CommitteeName,
            Type = string.IsNullOrWhiteSpace(committee.CommitteeType) ? "main" : committee.CommitteeType,
            TermStart = committee.TermStart?.ToString("yyyy-MM-dd"),
            TermEnd = committee.TermEnd?.ToString("yyyy-MM-dd"),
            IsActive = committee.IsActive,
            Members = memberDtos,
            Meetings = meetingDtos,
            NextMeeting = next,
            NonOfficerCount = nonOfficers.Count,
            AviationActiveNonOfficers = aviationActive,
            AviationRuleMet = nonOfficers.Count < 8 || aviationActive >= 6
        };
    }

    private async Task<CommitteeMemberDto?> MapMemberAsync(long committeeMemberId, CancellationToken cancellationToken)
    {
        var m = await _db.CommitteeMembers.AsNoTracking()
            .Include(x => x.Member)
            .Include(x => x.CommitteeRole)
            .FirstOrDefaultAsync(x => x.CommitteeMemberId == committeeMemberId, cancellationToken);
        if (m is null) return null;

        var affiliated = await _db.MemberAviationDetails.AsNoTracking()
            .Where(d => d.ProfileId == m.ProfileId)
            .OrderByDescending(d => d.MemberAviationDetailId)
            .Select(d => d.IsAviationAffiliated)
            .FirstOrDefaultAsync(cancellationToken);
        var accountRows = await _db.Accounts.AsNoTracking()
            .Where(a => !a.IsDeleted
                        && (a.ProfileId == m.ProfileId
                            || (m.Member.MembershipNo != null && a.MembershipNo == m.Member.MembershipNo)))
            .Select(a => new MemberAccountSnapshot(
                a.ProfileId,
                a.AccountId,
                a.MembershipNo,
                a.IsActive,
                a.MembershipType.Name,
                a.CurrentMemberStatus.Name,
                a.CurrentMemberStatus.Code,
                a.CurrentMemberStatus.IsActiveStatus,
                a.JoinedDate ?? a.StartDate,
                a.EndDate))
            .ToListAsync(cancellationToken);
        var account =
            (!string.IsNullOrWhiteSpace(m.Member.MembershipNo)
                ? accountRows.FirstOrDefault(a =>
                    string.Equals(a.MembershipNo, m.Member.MembershipNo, StringComparison.OrdinalIgnoreCase))
                : null)
            ?? (accountRows.Count == 0 ? null : PickLiveAccount(accountRows));

        return MapMemberEntity(m, affiliated, account);
    }

    private sealed record MemberAccountSnapshot(
        long ProfileId,
        long AccountId,
        string? MembershipNo,
        bool AccountIsActive,
        string? MembershipTypeName,
        string? MembershipStatusName,
        string? MembershipStatusCode,
        bool StatusIsActive,
        DateOnly? JoinedDate,
        DateOnly? EndDate);

    private static MemberAccountSnapshot PickLiveAccount(IEnumerable<MemberAccountSnapshot> rows) =>
        rows.OrderByDescending(a => a.AccountId).First();

    private static string? StatusFromAccount(MemberAccountSnapshot? account)
    {
        if (account is null) return null;
        var name = (account.MembershipStatusName ?? "").Trim();
        var live = account.AccountIsActive && account.StatusIsActive;
        if (live) return string.IsNullOrWhiteSpace(name) ? "Active" : name;
        if (string.IsNullOrWhiteSpace(name)
            || name.Equals("Active", StringComparison.OrdinalIgnoreCase))
            return "Inactive";
        return name;
    }

    private static CommitteeMemberDto MapMemberEntity(
        CommitteeMember m,
        bool affiliated,
        MemberAccountSnapshot? account)
    {
        return new CommitteeMemberDto
        {
            CommitteeMemberId = m.CommitteeMemberId,
            ProfileId = m.ProfileId,
            ProfileName = string.Join(" ", new[] { m.Member.Title, m.Member.FirstName, m.Member.LastName }
                .Where(v => !string.IsNullOrWhiteSpace(v))),
            MembershipNo = account?.MembershipNo ?? m.Member.MembershipNo,
            PhotoUrl = string.IsNullOrWhiteSpace(m.Member.PhotoUrl) ? null : m.Member.PhotoUrl,
            ContactEmail = string.IsNullOrWhiteSpace(m.Member.Email)
                ? (string.IsNullOrWhiteSpace(m.Member.AltEmail) ? null : m.Member.AltEmail)
                : m.Member.Email,
            Phone = string.IsNullOrWhiteSpace(m.Member.Mobile) ? null : m.Member.Mobile,
            AccountId = account?.AccountId,
            MembershipType = account?.MembershipTypeName,
            MembershipStatus = StatusFromAccount(account),
            MembershipStatusCode = account?.MembershipStatusCode,
            AccountIsActive = account?.AccountIsActive,
            JoinedDate = account?.JoinedDate?.ToString("yyyy-MM-dd"),
            NextRenewalDate = NextAnnualFrom(m.AppointedDate),
            CommitteeRoleId = m.CommitteeRoleId,
            RoleCode = m.CommitteeRole.Code,
            RoleName = m.CommitteeRole.Name,
            RoleSortOrder = m.CommitteeRole.SortOrder,
            CanApproveCredit = m.CommitteeRole.CanApproveCredit,
            IsAviationAffiliated = affiliated,
            AppointedDate = m.AppointedDate?.ToString("yyyy-MM-dd"),
            EndDate = m.EndDate?.ToString("yyyy-MM-dd"),
            IsActive = m.IsActive
        };
    }

    private static string? NextAnnualFrom(DateOnly? appointed)
    {
        if (appointed is null) return null;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var next = appointed.Value.AddYears(1);
        while (next <= today)
            next = next.AddYears(1);
        return next.ToString("yyyy-MM-dd");
    }

    private async Task<CommitteeMeetingDto?> MapMeetingAsync(long meetingId, CancellationToken cancellationToken)
    {
        var m = await _db.CommitteeMeetings.AsNoTracking()
            .Include(x => x.MeetingType)
            .Include(x => x.Chair)
            .FirstOrDefaultAsync(x => x.CommitteeMeetingId == meetingId, cancellationToken);
        if (m is null) return null;
        var dto = MapMeetingEntity(m);
        dto.LinkedInterviewCount = await _db.Interviews.CountAsync(
            i => i.CommitteeMeetingId == meetingId, cancellationToken);
        dto.PendingOutcomeCount = await _db.Interviews.CountAsync(
            i => i.CommitteeMeetingId == meetingId && (i.Outcome == null || i.Outcome == ""),
            cancellationToken);
        return dto;
    }

    private static CommitteeMeetingDto MapMeetingEntity(CommitteeMeeting m) => new()
    {
        CommitteeMeetingId = m.CommitteeMeetingId,
        CommitteeId = m.CommitteeId,
        MeetingTypeId = m.MeetingTypeId,
        MeetingTypeCode = m.MeetingType?.Code ?? "",
        MeetingTypeName = m.MeetingType?.Name ?? "",
        MeetingDate = m.MeetingDate.ToString("yyyy-MM-dd"),
        MeetingTime = m.MeetingTime,
        MeetingName = m.MeetingName,
        ChairProfileId = m.ChairProfileId,
        ChairName = m.Chair is null
            ? null
            : string.Join(" ", new[] { m.Chair.Title, m.Chair.FirstName, m.Chair.LastName }
                .Where(v => !string.IsNullOrWhiteSpace(v))),
        Status = m.Status,
        MinutesUrl = m.MinutesUrl
    };

    private static string NormalizeType(string? type)
    {
        var t = (type ?? "main").Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(t) ? "main" : t;
    }

    private static DateOnly? ParseOptionalDate(string? value, string label)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!DateOnly.TryParse(value, out var date))
            throw new InvalidOperationException($"Enter a valid {label}.");
        return date;
    }
}
