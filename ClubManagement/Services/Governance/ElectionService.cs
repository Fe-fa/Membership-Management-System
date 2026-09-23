using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Governance;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.GeneralMeetings;
using ClubManagement.Entities.Lookups;
using ClubManagement.Services.Identity;
using ClubManagement.Services.MembershipAccount;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.Governance;

public interface IElectionService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<MeetingNoticeDto>> ListNoticesAsync(CancellationToken cancellationToken);
    Task<MemberElectionDto> GetMineAsync(long profileId, CancellationToken cancellationToken);
    Task<VoteReceiptDto> CastVoteAsync(long meetingId, long profileId, CastMemberBallotRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task AppointProxyAsync(long meetingId, long profileId, AppointProxyRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> ReviewProxyAsync(long meetingId, long proxyId, ReviewProxyRequest request, long? actorProfileId, bool privilegedReviewer, long? actorUserId, CancellationToken cancellationToken);
    Task<NominationDto> NominateAsync(long meetingId, CreateNominationRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ElectionDeskDto>> ListDeskAsync(CancellationToken cancellationToken);
    Task<ElectionDeskDto> PublishNoticeAsync(PublishMeetingNoticeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> UpdateNoticeAsync(long meetingId, PublishMeetingNoticeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> AddAgendaAsync(long meetingId, AddAgendaItemRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> SetWindowAsync(long meetingId, SetBallotWindowRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> AppointOfficersAsync(long meetingId, AppointElectionOfficersRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> DeclareResultAsync(long meetingId, long? chairmanProfileId, long? actorUserId, CancellationToken cancellationToken);
    Task<MeetingMinutesDto> GetMinutesAsync(long meetingId, CancellationToken cancellationToken);
    Task<MeetingMinutesDto> SaveMinutesDraftAsync(long meetingId, SaveMeetingMinutesRequest request, long? recorderProfileId, long? actorUserId, CancellationToken cancellationToken);
    Task<MeetingMinutesDto> SignMinutesAsync(long meetingId, SaveMeetingMinutesRequest request, long? chairmanProfileId, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MemberSearchHitDto>> SearchMembersAsync(string? search, CancellationToken cancellationToken);
}

public class ElectionService : IElectionService
{
    private static readonly HashSet<string> NominateClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "FULL", "LIFE", "COUNTRY", "OVERSEAS", "SENIOR", "SENIOR_LIFE"
    };

    private static readonly HashSet<string> VotingClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "FULL", "LIFE", "COUNTRY", "OVERSEAS", "SENIOR", "SENIOR_LIFE"
    };

    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailSender _email;
    private readonly AppPublicOptions _app;

    public ElectionService(ApplicationModuleDbContext db, IEmailSender email, IOptions<AppPublicOptions> app)
    {
        _db = db;
        _email = email;
        _app = app.Value;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.General_meeting', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.General_meeting', N'agenda_text') IS NULL
        ALTER TABLE dbo.General_meeting ADD agenda_text NVARCHAR(2000) NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'papers_url') IS NULL
        ALTER TABLE dbo.General_meeting ADD papers_url NVARCHAR(500) NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'venue') IS NULL
        ALTER TABLE dbo.General_meeting ADD venue NVARCHAR(200) NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'ballot_window_open') IS NULL
        ALTER TABLE dbo.General_meeting ADD ballot_window_open BIT NOT NULL CONSTRAINT DF_gm_ballot_open DEFAULT(0);
    IF COL_LENGTH(N'dbo.General_meeting', N'ballot_opens_at') IS NULL
        ALTER TABLE dbo.General_meeting ADD ballot_opens_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'ballot_closes_at') IS NULL
        ALTER TABLE dbo.General_meeting ADD ballot_closes_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'ballot_conductor_profile_id') IS NULL
        ALTER TABLE dbo.General_meeting ADD ballot_conductor_profile_id BIGINT NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'scrutineer_1_profile_id') IS NULL
        ALTER TABLE dbo.General_meeting ADD scrutineer_1_profile_id BIGINT NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'scrutineer_2_profile_id') IS NULL
        ALTER TABLE dbo.General_meeting ADD scrutineer_2_profile_id BIGINT NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'result_declared_at') IS NULL
        ALTER TABLE dbo.General_meeting ADD result_declared_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'result_declared_by_profile_id') IS NULL
        ALTER TABLE dbo.General_meeting ADD result_declared_by_profile_id BIGINT NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'result_summary') IS NULL
        ALTER TABLE dbo.General_meeting ADD result_summary NVARCHAR(1000) NULL;
END
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.Proxy', N'proxy_title') IS NULL
        ALTER TABLE dbo.Proxy ADD proxy_title NVARCHAR(20) NULL;
    IF COL_LENGTH(N'dbo.Proxy', N'alternate_title') IS NULL
        ALTER TABLE dbo.Proxy ADD alternate_title NVARCHAR(20) NULL;
    IF COL_LENGTH(N'dbo.Proxy', N'alternate_name') IS NULL
        ALTER TABLE dbo.Proxy ADD alternate_name NVARCHAR(200) NULL;
    IF COL_LENGTH(N'dbo.Proxy', N'leave_to_discretion') IS NULL
        ALTER TABLE dbo.Proxy ADD leave_to_discretion BIT NOT NULL CONSTRAINT DF_proxy_discretion DEFAULT(0);
    IF COL_LENGTH(N'dbo.Proxy', N'appointing_name') IS NULL
        ALTER TABLE dbo.Proxy ADD appointing_name NVARCHAR(200) NULL;
    IF COL_LENGTH(N'dbo.Proxy', N'appointing_po_box') IS NULL
        ALTER TABLE dbo.Proxy ADD appointing_po_box NVARCHAR(200) NULL;
    IF COL_LENGTH(N'dbo.Proxy', N'is_poll') IS NULL
        ALTER TABLE dbo.Proxy ADD is_poll BIT NOT NULL CONSTRAINT DF_proxy_poll DEFAULT(0);
END
IF OBJECT_ID(N'dbo.Election_nomination', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Election_nomination (
        election_nomination_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Election_nomination PRIMARY KEY,
        general_meeting_id BIGINT NOT NULL,
        nominee_profile_id BIGINT NOT NULL,
        proposer_profile_id BIGINT NOT NULL,
        seconder_profile_id BIGINT NOT NULL,
        role_standing_for NVARCHAR(120) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_enom_created DEFAULT (SYSUTCDATETIME()),
        created_by_user_id BIGINT NULL,
        CONSTRAINT FK_enom_meeting FOREIGN KEY (general_meeting_id) REFERENCES dbo.General_meeting(general_meeting_id) ON DELETE CASCADE,
        CONSTRAINT FK_enom_nominee FOREIGN KEY (nominee_profile_id) REFERENCES dbo.MProfile(profile_id),
        CONSTRAINT FK_enom_proposer FOREIGN KEY (proposer_profile_id) REFERENCES dbo.MProfile(profile_id),
        CONSTRAINT FK_enom_seconder FOREIGN KEY (seconder_profile_id) REFERENCES dbo.MProfile(profile_id)
    );
END
", cancellationToken);

        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Proxy', N'proxy_notes') IS NULL
BEGIN
    ALTER TABLE dbo.Proxy ADD proxy_notes NVARCHAR(2000) NULL;
END", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Proxy', N'signed_form_url') IS NULL
BEGIN
    ALTER TABLE dbo.Proxy ADD signed_form_url NVARCHAR(500) NULL;
END", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.General_meeting', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.General_meeting', N'minutes_text') IS NULL
        ALTER TABLE dbo.General_meeting ADD minutes_text NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'minutes_status') IS NULL
        ALTER TABLE dbo.General_meeting ADD minutes_status NVARCHAR(20) NOT NULL CONSTRAINT DF_gm_minutes_status DEFAULT('DRAFT');
    IF COL_LENGTH(N'dbo.General_meeting', N'minutes_recorded_by_profile_id') IS NULL
        ALTER TABLE dbo.General_meeting ADD minutes_recorded_by_profile_id BIGINT NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'minutes_recorded_at') IS NULL
        ALTER TABLE dbo.General_meeting ADD minutes_recorded_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'minutes_signed_by_profile_id') IS NULL
        ALTER TABLE dbo.General_meeting ADD minutes_signed_by_profile_id BIGINT NULL;
    IF COL_LENGTH(N'dbo.General_meeting', N'minutes_signed_at') IS NULL
        ALTER TABLE dbo.General_meeting ADD minutes_signed_at DATETIME2 NULL;
END", cancellationToken);
        // Separate batches: SQL Server rejects ALTER + UPDATE of a new column in the same batch.
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Proxy', N'review_status') IS NULL
    ALTER TABLE dbo.Proxy ADD review_status NVARCHAR(20) NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Proxy', N'review_reason') IS NULL
    ALTER TABLE dbo.Proxy ADD review_reason NVARCHAR(500) NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Proxy', N'reviewed_at') IS NULL
    ALTER TABLE dbo.Proxy ADD reviewed_at DATETIME2 NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Proxy', N'reviewed_by_profile_id') IS NULL
    ALTER TABLE dbo.Proxy ADD reviewed_by_profile_id BIGINT NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Proxy', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Proxy', N'review_status') IS NOT NULL
BEGIN
    UPDATE dbo.Proxy
    SET review_status = CASE WHEN deposited_on_time_flag = 1 THEN N'PENDING' ELSE N'LATE' END,
        is_valid_flag = 0
    WHERE review_status IS NULL;
END", cancellationToken);
    }

    public async Task<IReadOnlyList<MeetingNoticeDto>> ListNoticesAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.GeneralMeetings.AsNoTracking()
            .OrderByDescending(m => m.MeetingDate)
            .Take(20)
            .ToListAsync(cancellationToken);
        return rows.Select(MapNotice).ToList();
    }

    public async Task<MemberElectionDto> GetMineAsync(long profileId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.AsNoTracking()
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .Include(a => a.Profile)
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .OrderByDescending(a => a.IsActive)
            .FirstOrDefaultAsync(cancellationToken);

        var code = account?.MembershipType?.Code;
        var priv = MemberClassPrivileges.ForCode(code);
        var classOk = VotingClasses.Contains(code ?? "");
        var years = YearsBetween(account?.JoinedDate ?? account?.StartDate, DateOnly.FromDateTime(DateTime.UtcNow));
        var paidUp = account is null || await SubscriptionsPaidUpAsync(account.AccountId, priv, account.CurrentMemberStatus?.Code, cancellationToken);
        var classReason = classOk
            ? null
            : "Your class does not carry a vote. Electronic voting is for Full, Life, Country or Overseas members (Article 65).";
        var payReason = paidUp
            ? null
            : "Voting is blocked because your subscription is not paid up (Article 62).";
        var meeting = await CurrentMeetingAsync(cancellationToken);

        var dto = new MemberElectionDto
        {
            CanVote = classOk && priv.CanVote,
            SubscriptionsPaidUp = paidUp,
            EligibleToVote = classOk && priv.CanVote && paidUp,
            CanRunForOffice = priv.CanRunForOffice,
            ContinuousMembershipYears = years,
            ClassCode = code,
            ClassName = account?.MembershipType.Name,
            MemberName = account?.Profile is null
                ? ""
                : string.Join(" ", new[] { account.Profile.Title, account.Profile.FirstName, account.Profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
            MembershipNo = account?.MembershipNo,
            PostalAddress = FormatPoBox(account?.Profile.PostalAddress, account?.Profile.PostalCode, account?.Profile.City),
            NoVoteReason = classReason ?? payReason
        };

        if (meeting is null)
        {
            dto.Nominations = [];
            dto.BallotItems = [];
            dto.ProxiesHeld = await ListProxiesHeldAsync(profileId, cancellationToken);
            return dto;
        }

        var meetingStart = meeting.MeetingDate.ToDateTime(TimeOnly.MinValue);
        dto.Notice = MapNotice(meeting);
        dto.BallotWindowOpen = WindowOpen(meeting);
        dto.BallotOpensAt = meeting.BallotOpensAt;
        dto.BallotClosesAt = meeting.BallotClosesAt
            ?? meetingStart.AddDays(-2);
        dto.ProxyDeadlineAt = meetingStart.AddHours(-48);
        dto.PollProxyDeadlineAt = meetingStart.AddHours(-24);
        dto.Nominations = await ListNominationsAsync(meeting.GeneralMeetingId, cancellationToken);
        dto.ProxiesHeld = await ListProxiesHeldAsync(profileId, cancellationToken);

        dto.BallotItems = meeting.MeetingAgendaItems.OrderBy(a => a.SortOrder).Select(a =>
        {
            var mine = meeting.MemberVotes.FirstOrDefault(v =>
                v.GeneralMeetingBusinessItemId == a.MeetingAgendaItemId && v.VoterProfileId == profileId);
            return new MemberBallotItemDto
            {
                AgendaItemId = a.MeetingAgendaItemId,
                Subject = a.Subject,
                ResolutionText = a.Resolution?.ResolutionText,
                IsSpecialBusiness = a.IsSpecialBusinessFlag,
                MyVoteValue = mine?.VoteValue,
                ReceiptNumber = mine is null ? null : ReceiptNo(mine.MemberVoteId, a.MeetingAgendaItemId),
                CastAt = mine?.CastAt
            };
        }).ToList();

        var proxy = meeting.Proxies.FirstOrDefault(p => p.AppointingProfileId == profileId);
        if (proxy is not null)
        {
            dto.Proxy = new MemberProxyDto
            {
                ProxyId = proxy.ProxyId,
                ProxyProfileId = proxy.ProxyProfileId,
                LinkedMember = proxy.ProxyProfileId is > 0,
                ProxyTitle = proxy.ProxyTitle,
                ProxyName = proxy.ProxyName,
                AlternateTitle = proxy.AlternateTitle,
                AlternateName = proxy.AlternateName,
                VoteInstruction = proxy.VoteInstruction,
                LeaveToDiscretion = proxy.LeaveToDiscretion,
                AppointingName = proxy.AppointingName,
                AppointingPoBox = proxy.AppointingPoBox,
                ProxyMembershipNo = proxy.ProxyContact,
                Notes = proxy.ProxyNotes,
                SignedFormUrl = proxy.SignedFormUrl,
                InstrumentReceivedAt = proxy.InstrumentReceivedAt,
                DepositedOnTime = proxy.DepositedOnTimeFlag,
                ReviewStatus = ProxyReviewStatus(proxy),
                ReviewReason = proxy.ReviewReason
            };
        }

        if (meeting.ResultDeclaredAt is not null)
        {
            dto.ResultDeclaredAt = meeting.ResultDeclaredAt;
            dto.UniqueVoters = CountQuorumParticipants(meeting);
            dto.EligibleVoters = await CountEligibleVotersAsync(cancellationToken);
            dto.QuorumRequired = meeting.QuorumRequired > 0 ? meeting.QuorumRequired : 4;
            dto.QuorumMet = meeting.QuorumMetFlag || dto.UniqueVoters >= dto.QuorumRequired;
            dto.PublishedResults = meeting.MeetingAgendaItems.OrderBy(a => a.SortOrder).Select(a =>
            {
                var votes = CountedVotes(meeting, a.MeetingAgendaItemId).ToList();
                return new AgendaItemTallyDto
                {
                    AgendaItemId = a.MeetingAgendaItemId,
                    Subject = a.Subject,
                    IsSpecialBusiness = a.IsSpecialBusinessFlag,
                    ForCount = votes.Count(v => v.VoteValue.Equals("FOR", StringComparison.OrdinalIgnoreCase)),
                    AgainstCount = votes.Count(v => v.VoteValue.Equals("AGAINST", StringComparison.OrdinalIgnoreCase)),
                    AbstainCount = votes.Count(v => v.VoteValue.Equals("ABSTAIN", StringComparison.OrdinalIgnoreCase)),
                    VotesCast = votes.Count
                };
            }).ToList();
        }

        return dto;
    }

    public async Task<VoteReceiptDto> CastVoteAsync(
        long meetingId,
        long profileId,
        CastMemberBallotRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        EnsureWindowOpen(meeting);
        await EnsureCanVoteAsync(profileId, cancellationToken);

        var approvedProxy = meeting.Proxies.FirstOrDefault(p =>
            p.AppointingProfileId == profileId && IsApprovedProxy(p));
        if (approvedProxy is not null)
            throw new InvalidOperationException(
                "Your approved proxy already records your vote. You cannot also vote electronically.");

        var value = (request.VoteValue ?? "").Trim().ToUpperInvariant();
        if (value is not ("FOR" or "AGAINST"))
            throw new InvalidOperationException("Vote must be FOR or AGAINST.");

        var item = meeting.MeetingAgendaItems.FirstOrDefault(a => a.MeetingAgendaItemId == request.AgendaItemId)
            ?? throw new InvalidOperationException("Agenda item was not found on this meeting.");

        if (meeting.MemberVotes.Any(v => v.VoterProfileId == profileId && v.GeneralMeetingBusinessItemId == item.MeetingAgendaItemId))
            throw new InvalidOperationException("You have already voted on this resolution. An electronic vote cannot be recast.");

        var vote = new MemberVote
        {
            GeneralMeetingId = meetingId,
            GeneralMeetingBusinessItemId = item.MeetingAgendaItemId,
            VoterProfileId = profileId,
            VoteMethod = "ELECTRONIC",
            VoteValue = value,
            CastAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.MemberVotes.Add(vote);
        await _db.SaveChangesAsync(cancellationToken);
        return new VoteReceiptDto
        {
            MemberVoteId = vote.MemberVoteId,
            ReceiptNumber = ReceiptNo(vote.MemberVoteId, item.MeetingAgendaItemId),
            AgendaItemId = item.MeetingAgendaItemId,
            Subject = item.Subject,
            VoteValue = value,
            CastAt = vote.CastAt ?? DateTime.UtcNow
        };
    }

    public async Task AppointProxyAsync(
        long meetingId,
        long profileId,
        AppointProxyRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        var meetingStart = meeting.MeetingDate.ToDateTime(TimeOnly.MinValue);
        var hoursRequired = request.IsPoll ? 24 : 48;
        var deadline = meetingStart.AddHours(-hoursRequired);
        var onTime = DateTime.UtcNow <= deadline;

        await EnsureCanVoteAsync(profileId, cancellationToken);

        var linked = await ResolveProxyMemberAsync(request, cancellationToken);
        if (linked?.ProfileId == profileId)
            throw new InvalidOperationException("You cannot appoint yourself as proxy.");

        var name = (linked?.Name ?? request.ProxyName ?? "").Trim();
        if (name.Length < 2)
            throw new InvalidOperationException("Proxy name is required — search for a member or type a name.");

        var instruction = (request.VoteInstruction ?? "").Trim().ToUpperInvariant();
        if (request.LeaveToDiscretion) instruction = "DISCRETION";
        if (instruction is not ("FOR" or "AGAINST" or "DISCRETION") && request.Instructions.Count == 0 && !request.LeaveToDiscretion)
        {
            instruction = "DISCRETION";
            request.LeaveToDiscretion = true;
        }

        var packed = request.LeaveToDiscretion || instruction == "DISCRETION"
            ? "DISCRETION"
            : instruction is "FOR" or "AGAINST"
                ? instruction
                : string.Join("; ", request.Instructions
                    .Select(i => $"{i.AgendaItemId}:{(i.VoteValue ?? "").Trim().ToUpperInvariant()}")
                    .Where(s => s.Contains(":FOR") || s.Contains(":AGAINST")));

        var existing = meeting.Proxies.FirstOrDefault(p => p.AppointingProfileId == profileId);
        var existingStatus = existing is null ? null : ProxyReviewStatus(existing);
        if (existingStatus is "APPROVED" or "REJECTED")
            throw new InvalidOperationException("This proxy has already been reviewed and cannot be changed.");
        if (existingStatus == "LATE")
            throw new InvalidOperationException(
                request.IsPoll
                    ? "This poll proxy was lodged after the 24-hour cutoff and cannot count (Article 65)."
                    : "This proxy was lodged after the 48-hour cutoff and cannot count (Article 65).");

        var previousProxyProfileId = existing?.ProxyProfileId;
        var status = onTime ? "PENDING" : "LATE";
        if (existing is null)
        {
            existing = new Proxy
            {
                GeneralMeetingId = meetingId,
                AppointingProfileId = profileId,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId,
                InstrumentReceivedAt = DateTime.UtcNow
            };
            _db.Proxies.Add(existing);
        }

        existing.ProxyProfileId = linked?.ProfileId;
        existing.ProxyTitle = string.IsNullOrWhiteSpace(request.ProxyTitle) ? "Mr" : request.ProxyTitle.Trim();
        existing.ProxyName = name;
        existing.AlternateTitle = string.IsNullOrWhiteSpace(request.AlternateTitle) ? null : request.AlternateTitle.Trim();
        existing.AlternateName = string.IsNullOrWhiteSpace(request.AlternateName) ? null : request.AlternateName.Trim();
        existing.VoteInstruction = packed;
        existing.LeaveToDiscretion = request.LeaveToDiscretion || packed == "DISCRETION";
        existing.AppointingName = string.IsNullOrWhiteSpace(request.AppointingName) ? null : request.AppointingName.Trim();
        existing.AppointingPoBox = string.IsNullOrWhiteSpace(request.AppointingPoBox) ? null : request.AppointingPoBox.Trim();
        existing.ProxyContact = linked?.MembershipNo
            ?? (string.IsNullOrWhiteSpace(request.ProxyMembershipNo) ? existing.ProxyContact : request.ProxyMembershipNo.Trim());
        existing.ProxyNotes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        existing.SignedFormUrl = string.IsNullOrWhiteSpace(request.SignedFormUrl) ? existing.SignedFormUrl : request.SignedFormUrl.Trim();
        existing.IsPoll = request.IsPoll;
        existing.DepositedOnTimeFlag = onTime;
        existing.InstrumentReceivedAt ??= DateTime.UtcNow;
        existing.ReviewStatus = status;
        existing.IsValidFlag = false;
        existing.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);

        if (linked is not null && (previousProxyProfileId != linked.ProfileId || existingStatus is null or "PENDING"))
        {
            var appointingName = string.IsNullOrWhiteSpace(existing.AppointingName)
                ? await ProfileNameAsync(profileId, cancellationToken) ?? "A member"
                : existing.AppointingName!;
            await NotifyProxyAppointedAsync(
                linked.ProfileId,
                existing.ProxyId,
                appointingName,
                meeting,
                packed,
                existing.LeaveToDiscretion,
                deadline,
                force: previousProxyProfileId != linked.ProfileId,
                cancellationToken);
        }
    }

    private sealed record LinkedProxyMember(long ProfileId, string Name, string? MembershipNo, string? Email);

    private async Task<LinkedProxyMember?> ResolveProxyMemberAsync(
        AppointProxyRequest request,
        CancellationToken cancellationToken)
    {
        if (request.ProxyProfileId is > 0)
        {
            var account = await _db.Accounts.AsNoTracking()
                .Include(a => a.Profile)
                .Where(a => a.ProfileId == request.ProxyProfileId && a.IsActive && !a.IsDeleted)
                .OrderByDescending(a => a.IsActive)
                .FirstOrDefaultAsync(cancellationToken);
            if (account?.Profile is null)
                throw new InvalidOperationException("The selected proxy member was not found.");
            var p = account.Profile;
            return new LinkedProxyMember(
                p.ProfileId,
                Name(p.FirstName, p.LastName),
                account.MembershipNo,
                p.Email);
        }

        var membershipNo = (request.ProxyMembershipNo ?? "").Trim();
        if (membershipNo.Length < 2) return null;

        var byNo = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Where(a => a.IsActive && !a.IsDeleted && a.MembershipNo == membershipNo)
            .OrderByDescending(a => a.IsActive)
            .FirstOrDefaultAsync(cancellationToken);
        if (byNo?.Profile is null) return null;
        return new LinkedProxyMember(
            byNo.Profile.ProfileId,
            Name(byNo.Profile.FirstName, byNo.Profile.LastName),
            byNo.MembershipNo,
            byNo.Profile.Email);
    }

    private async Task NotifyProxyAppointedAsync(
        long proxyProfileId,
        long proxyId,
        string appointingName,
        GeneralMeeting meeting,
        string instruction,
        bool leaveToDiscretion,
        DateTime deadline,
        bool force,
        CancellationToken cancellationToken)
    {
        var profile = await _db.Profiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.ProfileId == proxyProfileId, cancellationToken);
        if (profile is null) return;

        var instructionLabel = InstructionLabel(instruction, leaveToDiscretion);
        var meetingLabel = $"{meeting.MeetingType} on {meeting.MeetingDate:dd MMM yyyy}";
        var subject = $"{appointingName} appointed you as their proxy for {meetingLabel}";
        var body =
            $"{subject}.\n\n" +
            $"Voting instruction: {instructionLabel}.\n" +
            $"Proxy authority ends at the lodging deadline: {deadline:dd MMM yyyy HH:mm} UTC " +
            $"(48 hours before the meeting; 24 hours for a poll).\n\n" +
            $"Open Election to review appointments made to you:\n{_app.PublicBaseUrl.TrimEnd('/')}/election";

        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == "PROXY_APPOINTMENT", cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = "PROXY_APPOINTMENT",
                Name = "Proxy appointment",
                SortOrder = 35,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var recipient = profile.Email ?? profile.ProfileId.ToString();
        if (!force)
        {
            var already = await _db.Notifications.AnyAsync(n =>
                n.NotificationTypeId == type.NotificationTypeId &&
                n.RelatedEntityType == "PROXY" &&
                n.RelatedEntityId == proxyId &&
                n.Recipient == recipient, cancellationToken);
            if (already) return;
        }

        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profile.ProfileId && !a.IsDeleted)
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
            RelatedEntityType = "PROXY",
            RelatedEntityId = proxyId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(profile.Email))
        {
            try { await _email.SendAsync(profile.Email, subject, body, cancellationToken); }
            catch { /* in-app notice still stands if SMTP is down */ }
        }
    }

    private static string InstructionLabel(string? instruction, bool leaveToDiscretion)
    {
        if (leaveToDiscretion) return "Left to your discretion";
        var raw = (instruction ?? "").Trim().ToUpperInvariant();
        return raw switch
        {
            "FOR" => "In favour of every resolution",
            "AGAINST" => "Against every resolution",
            "DISCRETION" => "Left to your discretion",
            _ when string.IsNullOrWhiteSpace(raw) => "See notes on the instrument",
            _ => raw
        };
    }

    private async Task<IReadOnlyList<ProxyHeldDto>> ListProxiesHeldAsync(long profileId, CancellationToken cancellationToken)
    {
        var rows = await _db.Proxies.AsNoTracking()
            .Include(p => p.GeneralMeeting)
                .ThenInclude(m => m.MeetingAgendaItems)
            .Include(p => p.AppointingProfile)
            .Where(p => p.ProxyProfileId == profileId)
            .Where(p => p.GeneralMeeting.Status != "CANCELLED")
            .OrderByDescending(p => p.InstrumentReceivedAt ?? p.CreatedAt)
            .Take(20)
            .ToListAsync(cancellationToken);

        var appointingIds = rows.Select(r => r.AppointingProfileId).Distinct().ToList();
        var membershipNos = await _db.Accounts.AsNoTracking()
            .Where(a => appointingIds.Contains(a.ProfileId) && !a.IsDeleted)
            .Select(a => new { a.ProfileId, a.MembershipNo })
            .ToListAsync(cancellationToken);
        var noByProfile = membershipNos
            .GroupBy(a => a.ProfileId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.MembershipNo).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)));

        return rows.Select(p =>
        {
            var meetingStart = p.GeneralMeeting.MeetingDate.ToDateTime(TimeOnly.MinValue);
            var hours = p.IsPoll ? 24 : 48;
            var appointing = string.IsNullOrWhiteSpace(p.AppointingName)
                ? Name(p.AppointingProfile?.FirstName, p.AppointingProfile?.LastName)
                : p.AppointingName!;
            return new ProxyHeldDto
            {
                ProxyId = p.ProxyId,
                GeneralMeetingId = p.GeneralMeetingId,
                MeetingType = p.GeneralMeeting.MeetingType,
                MeetingDate = p.GeneralMeeting.MeetingDate.ToString("yyyy-MM-dd"),
                Venue = p.GeneralMeeting.Venue,
                AppointingName = appointing,
                AppointingMembershipNo = noByProfile.GetValueOrDefault(p.AppointingProfileId),
                VoteInstruction = p.VoteInstruction,
                LeaveToDiscretion = p.LeaveToDiscretion,
                InstructionLabel = InstructionLabel(p.VoteInstruction, p.LeaveToDiscretion),
                ReviewStatus = ProxyReviewStatus(p),
                ProxyDeadlineAt = meetingStart.AddHours(-hours),
                InstrumentReceivedAt = p.InstrumentReceivedAt,
                Resolutions = p.GeneralMeeting.MeetingAgendaItems
                    .OrderBy(a => a.SortOrder)
                    .Select(a => a.Subject)
                    .ToList()
            };
        }).ToList();
    }

    public async Task<ElectionDeskDto> ReviewProxyAsync(
        long meetingId,
        long proxyId,
        ReviewProxyRequest request,
        long? actorProfileId,
        bool privilegedReviewer,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        var isReturningOfficer = actorProfileId is > 0 && actorProfileId == meeting.BallotConductorProfileId;
        if (!isReturningOfficer && !privilegedReviewer)
            throw new InvalidOperationException("Only the Returning Officer may approve or reject a lodged proxy.");

        var proxy = meeting.Proxies.FirstOrDefault(p => p.ProxyId == proxyId)
            ?? throw new InvalidOperationException("Proxy appointment was not found.");
        var current = ProxyReviewStatus(proxy);
        if (current is "APPROVED" or "REJECTED")
            throw new InvalidOperationException("This proxy has already been reviewed and cannot be changed.");
        if (current == "LATE")
            throw new InvalidOperationException("A late proxy cannot be approved. It was lodged after the cutoff (Article 65).");

        var decision = (request.Decision ?? "").Trim().ToUpperInvariant();
        if (decision is not ("APPROVE" or "REJECT"))
            throw new InvalidOperationException("Decision must be APPROVE or REJECT.");

        if (decision == "APPROVE")
        {
            proxy.ReviewStatus = "APPROVED";
            proxy.IsValidFlag = true;
            proxy.ReviewReason = null;
            ApplyApprovedProxyVotes(meeting, proxy, actorUserId);
        }
        else
        {
            proxy.ReviewStatus = "REJECTED";
            proxy.IsValidFlag = false;
            var reason = (request.Reason ?? "").Trim();
            proxy.ReviewReason = string.IsNullOrWhiteSpace(reason) ? null : reason[..Math.Min(reason.Length, 500)];
        }

        proxy.ReviewedAt = DateTime.UtcNow;
        proxy.ReviewedByProfileId = actorProfileId;
        proxy.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(meetingId, cancellationToken);
    }

    public async Task<NominationDto> NominateAsync(
        long meetingId,
        CreateNominationRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var daysBefore = meeting.MeetingDate.DayNumber - today.DayNumber;
        if (daysBefore < 14)
            throw new InvalidOperationException(
                "Nominations must be submitted at least 14 days before the AGM/EGM (Article 20).");
        var role = (request.RoleStandingFor ?? "").Trim();
        if (role.Length < 2)
            throw new InvalidOperationException("Role standing for is required.");
        if (request.NomineeProfileId == 0 || request.ProposerProfileId == 0 || request.SeconderProfileId == 0)
            throw new InvalidOperationException("Nominee, proposer and seconder are required.");
        if (request.ProposerProfileId == request.SeconderProfileId)
            throw new InvalidOperationException("Proposer and seconder must be different members.");

        await EnsureEligibleNominatorAsync(request.ProposerProfileId, "proposer", cancellationToken);
        await EnsureEligibleNominatorAsync(request.SeconderProfileId, "seconder", cancellationToken);
        await EnsureEligibleNominatorAsync(request.NomineeProfileId, "nominee", cancellationToken, requireOffice: true);

        var row = new ElectionNomination
        {
            GeneralMeetingId = meetingId,
            NomineeProfileId = request.NomineeProfileId,
            ProposerProfileId = request.ProposerProfileId,
            SeconderProfileId = request.SeconderProfileId,
            RoleStandingFor = role,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.ElectionNominations.Add(row);
        await _db.SaveChangesAsync(cancellationToken);
        var list = await ListNominationsAsync(meetingId, cancellationToken);
        return list.First(n => n.ElectionNominationId == row.ElectionNominationId);
    }

    public async Task<IReadOnlyList<ElectionDeskDto>> ListDeskAsync(CancellationToken cancellationToken)
    {
             var ids = await _db.GeneralMeetings.AsNoTracking()
            .OrderBy(m => m.Status == "HELD" || m.Status == "CANCELLED" ? 1 : 0)
            .ThenByDescending(m => m.MeetingDate)
            .ThenByDescending(m => m.GeneralMeetingId)
            .Select(m => m.GeneralMeetingId)
            .Take(20)
            .ToListAsync(cancellationToken);
        var list = new List<ElectionDeskDto>();
        foreach (var id in ids)
            list.Add(await MapDeskAsync(id, cancellationToken));
        return list;
    }

    public async Task<ElectionDeskDto> PublishNoticeAsync(
        PublishMeetingNoticeRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var draft = BuildNoticeDraft(request, actorUserId);
        var notice = MapNotice(draft);
        if (!notice.NoticePeriodMet)
            throw new InvalidOperationException(notice.NoticePeriodDetail);

        _db.GeneralMeetings.Add(draft);
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(draft.GeneralMeetingId, cancellationToken);
    }

    public async Task<ElectionDeskDto> UpdateNoticeAsync(
        long meetingId,
        PublishMeetingNoticeRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.GeneralMeetings.FirstOrDefaultAsync(m => m.GeneralMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");
        var status = (meeting.Status ?? "").Trim().ToUpperInvariant();
        if (status is "HELD" or "CANCELLED")
            throw new InvalidOperationException("Only scheduled meeting notices can be edited.");
        if (meeting.ResultDeclaredAt is not null)
            throw new InvalidOperationException("This meeting’s result has been declared; the notice can no longer be edited.");

        var draft = BuildNoticeDraft(request, actorUserId);
        var preview = MapNotice(draft);
        if (!preview.NoticePeriodMet)
            throw new InvalidOperationException(preview.NoticePeriodDetail);

        meeting.MeetingType = draft.MeetingType;
        meeting.MeetingDate = draft.MeetingDate;
        meeting.NoticeSentDate = draft.NoticeSentDate;
        meeting.AgendaText = draft.AgendaText;
        meeting.PapersUrl = draft.PapersUrl;
        meeting.Venue = draft.Venue;
        meeting.UpdatedByUserId = actorUserId;
        // Keep ballot close aligned with the meeting date unless a custom window is already open.
        if (!meeting.BallotWindowOpen)
            meeting.BallotClosesAt = draft.BallotClosesAt;

        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(meetingId, cancellationToken);
    }

    private static GeneralMeeting BuildNoticeDraft(PublishMeetingNoticeRequest request, long? actorUserId)
    {
        if (!DateOnly.TryParse(request.MeetingDate, out var meetingDate))
            throw new InvalidOperationException("Meeting date is required.");
        var type = (request.MeetingType ?? "AGM").Trim().ToUpperInvariant();
        if (type is not ("AGM" or "EGM"))
            throw new InvalidOperationException("Meeting type must be AGM or EGM.");

        var noticeDate = DateOnly.TryParse(request.NoticeSentDate, out var n) ? n : DateOnly.FromDateTime(DateTime.UtcNow);
        return new GeneralMeeting
        {
            MeetingType = type,
            MeetingDate = meetingDate,
            NoticeSentDate = noticeDate,
            NoticeMethod = "PORTAL",
            AgendaText = request.Agenda?.Trim(),
            PapersUrl = request.PapersUrl?.Trim(),
            Venue = string.IsNullOrWhiteSpace(request.Venue) ? "Clubhouse, Wilson Airport, Nairobi" : request.Venue.Trim(),
            QuorumRequired = 0,
            Status = "SCHEDULED",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId,
            BallotClosesAt = meetingDate.ToDateTime(TimeOnly.MinValue).AddHours(-48),
        };
    }

    public async Task<ElectionDeskDto> AddAgendaAsync(
        long meetingId,
        AddAgendaItemRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var subject = (request.Subject ?? "").Trim();
        if (subject.Length < 3)
            throw new InvalidOperationException("Agenda / resolution subject is required.");
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        var order = meeting.MeetingAgendaItems.Count == 0 ? 1 : meeting.MeetingAgendaItems.Max(a => a.SortOrder) + 1;
        _db.MeetingAgendaItems.Add(new MeetingAgendaItem
        {
            GeneralMeetingId = meetingId,
            Subject = subject,
            IsSpecialBusinessFlag = request.IsSpecialBusiness,
            SortOrder = order,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(meetingId, cancellationToken);
    }

    public async Task<ElectionDeskDto> SetWindowAsync(
        long meetingId,
        SetBallotWindowRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.GeneralMeetings.FirstOrDefaultAsync(m => m.GeneralMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");

        if (request.Open)
        {
            var conductor = request.ConductorProfileId is > 0
                ? request.ConductorProfileId
                : meeting.BallotConductorProfileId;
            if (conductor is null or 0)
                throw new InvalidOperationException("Appoint the electronic-ballot returning officer first.");
            await EnsureSittingCommitteeAsync(conductor.Value, "returning officer", cancellationToken);
            meeting.BallotWindowOpen = true;
            meeting.BallotConductorProfileId = conductor;
            meeting.BallotOpensAt = DateTime.UtcNow;
            meeting.BallotClosesAt = meeting.MeetingDate.ToDateTime(TimeOnly.MinValue).AddHours(-48);
        }
        else
        {
            meeting.BallotWindowOpen = false;
        }

        meeting.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(meetingId, cancellationToken);
    }

    public async Task<ElectionDeskDto> AppointOfficersAsync(
        long meetingId,
        AppointElectionOfficersRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.GeneralMeetings.FirstOrDefaultAsync(m => m.GeneralMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");

        if (request.Scrutineer1ProfileId is > 0)
        {
            await EnsureSittingCommitteeAsync(request.Scrutineer1ProfileId.Value, "scrutineer", cancellationToken);
            meeting.Scrutineer1ProfileId = request.Scrutineer1ProfileId;
        }
        if (request.Scrutineer2ProfileId is > 0)
        {
            await EnsureSittingCommitteeAsync(request.Scrutineer2ProfileId.Value, "scrutineer", cancellationToken);
            meeting.Scrutineer2ProfileId = request.Scrutineer2ProfileId;
        }
        if (meeting.Scrutineer1ProfileId is > 0
            && meeting.Scrutineer2ProfileId is > 0
            && meeting.Scrutineer1ProfileId == meeting.Scrutineer2ProfileId)
            throw new InvalidOperationException("Two distinct scrutineers are required (Article 55).");

        if (request.ReturningOfficerProfileId is > 0)
        {
            await EnsureSittingCommitteeAsync(request.ReturningOfficerProfileId.Value, "returning officer", cancellationToken);
            meeting.BallotConductorProfileId = request.ReturningOfficerProfileId;
        }

        meeting.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(meetingId, cancellationToken);
    }

    public async Task<ElectionDeskDto> DeclareResultAsync(
        long meetingId,
        long? chairmanProfileId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        if (meeting.Scrutineer1ProfileId is null or 0 || meeting.Scrutineer2ProfileId is null or 0)
            throw new InvalidOperationException("Appoint two scrutineers before declaring the result.");
        var uniqueVoters = CountQuorumParticipants(meeting);
        if (uniqueVoters < 4)
            throw new InvalidOperationException(
                $"Quorum is not met ({uniqueVoters} of 20 Full/Life/Country/Overseas members.");
        var parts = meeting.MeetingAgendaItems.OrderBy(a => a.SortOrder).Select(a =>
        {
            var votes = CountedVotes(meeting, a.MeetingAgendaItemId).ToList();
            var forCount = votes.Count(v => v.VoteValue.Equals("FOR", StringComparison.OrdinalIgnoreCase));
            var against = votes.Count(v => v.VoteValue.Equals("AGAINST", StringComparison.OrdinalIgnoreCase));
            return $"{a.Subject}: FOR {forCount}, AGAINST {against}";
        });
        meeting.ResultDeclaredAt = DateTime.UtcNow;
        meeting.ResultDeclaredByProfileId = chairmanProfileId;
        meeting.QuorumMetFlag = true;
        meeting.ResultSummary =
            "Chairman's declaration is final and conclusive. " + string.Join(" · ", parts);
        meeting.BallotWindowOpen = false;
        meeting.Status = "HELD";
        meeting.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(meetingId, cancellationToken);
    }

    public async Task<MeetingMinutesDto> GetMinutesAsync(long meetingId, CancellationToken cancellationToken)
    {
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        return await MapMinutesAsync(meeting, cancellationToken);
    }

    public async Task<MeetingMinutesDto> SaveMinutesDraftAsync(
        long meetingId,
        SaveMeetingMinutesRequest request,
        long? recorderProfileId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await _db.GeneralMeetings.FirstOrDefaultAsync(m => m.GeneralMeetingId == meetingId, cancellationToken)
            ?? throw new InvalidOperationException("Meeting was not found.");
        EnsureMinutesUnsigned(meeting);
        meeting.MinutesText = request.Proceedings?.Trim();
        meeting.MinutesStatus = "DRAFT";
        meeting.MinutesRecordedByProfileId = recorderProfileId ?? meeting.MinutesRecordedByProfileId;
        meeting.MinutesRecordedAt = DateTime.UtcNow;
        meeting.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await GetMinutesAsync(meetingId, cancellationToken);
    }

    public async Task<MeetingMinutesDto> SignMinutesAsync(
        long meetingId,
        SaveMeetingMinutesRequest request,
        long? chairmanProfileId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        EnsureMinutesUnsigned(meeting);
        if (meeting.ResultDeclaredAt is null)
            throw new InvalidOperationException("Declare the vote result before the Chairman signs the minutes.");
        var text = string.IsNullOrWhiteSpace(request.Proceedings)
            ? meeting.MinutesText
            : request.Proceedings.Trim();
        if (string.IsNullOrWhiteSpace(text))
            throw new InvalidOperationException("Write up the proceedings of the meeting before signing.");
        meeting.MinutesText = text;
        meeting.MinutesStatus = "SIGNED";
        meeting.MinutesSignedByProfileId = chairmanProfileId;
        meeting.MinutesSignedAt = DateTime.UtcNow;
        meeting.MinutesRecordedByProfileId ??= chairmanProfileId;
        meeting.MinutesRecordedAt ??= DateTime.UtcNow;
        meeting.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await GetMinutesAsync(meetingId, cancellationToken);
    }

    public async Task<IReadOnlyList<MemberSearchHitDto>> SearchMembersAsync(string? search, CancellationToken cancellationToken)
    {
        var term = (search ?? "").Trim();
        if (term.Length < 2) return [];
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var accounts = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Where(a => a.IsActive && !a.IsDeleted)
            .Take(200)
            .ToListAsync(cancellationToken);

        return accounts.Select(a =>
            {
                var years = YearsBetween(a.JoinedDate ?? a.StartDate, today);
                var name = string.Join(" ", new[] { a.Profile.Title, a.Profile.FirstName, a.Profile.LastName }
                    .Where(v => !string.IsNullOrWhiteSpace(v)));
                var code = a.MembershipType.Code ?? "";
                var eligible = NominateClasses.Contains(code) && years >= 3;
                return new MemberSearchHitDto
                {
                    ProfileId = a.ProfileId,
                    Name = name,
                    MembershipNo = a.MembershipNo,
                    ClassCode = code,
                    ContinuousYears = years,
                    EligibleToNominate = eligible
                };
            })
            .Where(h => $"{h.Name} {h.MembershipNo}".Contains(term, StringComparison.OrdinalIgnoreCase))
            .Take(20)
            .ToList();
    }

    private async Task<ElectionDeskDto> MapDeskAsync(long meetingId, CancellationToken cancellationToken)
    {
        var meeting = await LoadMeetingAsync(meetingId, cancellationToken);
        var uniqueVoters = CountQuorumParticipants(meeting);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var daysBefore = meeting.MeetingDate.DayNumber - today.DayNumber;
        var nominationDeadline = meeting.MeetingDate.AddDays(-14);

        return new ElectionDeskDto
        {
            Meeting = MapNotice(meeting),
            BallotWindowOpen = meeting.BallotWindowOpen,
            BallotOpensAt = meeting.BallotOpensAt,
            BallotClosesAt = meeting.BallotClosesAt,
            ConductorProfileId = meeting.BallotConductorProfileId,
            ConductorName = await ProfileNameAsync(meeting.BallotConductorProfileId, cancellationToken),
            Scrutineer1ProfileId = meeting.Scrutineer1ProfileId,
            Scrutineer1Name = await ProfileNameAsync(meeting.Scrutineer1ProfileId, cancellationToken),
            Scrutineer2ProfileId = meeting.Scrutineer2ProfileId,
            Scrutineer2Name = await ProfileNameAsync(meeting.Scrutineer2ProfileId, cancellationToken),
            ResultDeclaredAt = meeting.ResultDeclaredAt,
            ResultSummary = meeting.ResultSummary,
            NominationDeadline = nominationDeadline.ToString("yyyy-MM-dd"),
            NominationsOpen = daysBefore >= 14,
            UniqueVoters = uniqueVoters,
            QuorumRequired = 4,
            QuorumMet = uniqueVoters >= 4,
            Agenda = meeting.MeetingAgendaItems.OrderBy(a => a.SortOrder).Select(a =>
            {
                var votes = CountedVotes(meeting, a.MeetingAgendaItemId).ToList();
                return new AgendaItemTallyDto
                {
                    AgendaItemId = a.MeetingAgendaItemId,
                    Subject = a.Subject,
                    IsSpecialBusiness = a.IsSpecialBusinessFlag,
                    ForCount = votes.Count(v => v.VoteValue.Equals("FOR", StringComparison.OrdinalIgnoreCase)),
                    AgainstCount = votes.Count(v => v.VoteValue.Equals("AGAINST", StringComparison.OrdinalIgnoreCase)),
                    AbstainCount = votes.Count(v => v.VoteValue.Equals("ABSTAIN", StringComparison.OrdinalIgnoreCase)),
                    VotesCast = votes.Count
                };
            }).ToList(),
            Nominations = await ListNominationsAsync(meetingId, cancellationToken),
            Proxies = meeting.Proxies
                .OrderByDescending(p => p.InstrumentReceivedAt ?? p.CreatedAt)
                .Select(p =>
                {
                    var status = ProxyReviewStatus(p);
                    return new DeskProxyDto
                    {
                        ProxyId = p.ProxyId,
                        AppointingName = p.AppointingName,
                        ProxyName = p.ProxyName,
                        ProxyMembershipNo = p.ProxyContact,
                        ProxyProfileId = p.ProxyProfileId,
                        LinkedMember = p.ProxyProfileId is > 0,
                        ManualContactRequired = p.ProxyProfileId is null or 0,
                        VoteInstruction = p.VoteInstruction,
                        LeaveToDiscretion = p.LeaveToDiscretion,
                        InstrumentReceivedAt = p.InstrumentReceivedAt,
                        DepositedOnTime = p.DepositedOnTimeFlag,
                        IsValid = status == "APPROVED",
                        ReviewStatus = status,
                        ReviewReason = p.ReviewReason
                    };
                })
                .ToList()
        };
    }

    private async Task<IReadOnlyList<NominationDto>> ListNominationsAsync(long meetingId, CancellationToken cancellationToken)
    {
        var rows = await _db.ElectionNominations.AsNoTracking()
            .Include(n => n.Nominee)
            .Include(n => n.Proposer)
            .Include(n => n.Seconder)
            .Where(n => n.GeneralMeetingId == meetingId)
            .OrderBy(n => n.CreatedAt)
            .ToListAsync(cancellationToken);
        return rows.Select(n => new NominationDto
        {
            ElectionNominationId = n.ElectionNominationId,
            NomineeName = Name(n.Nominee.FirstName, n.Nominee.LastName),
            NomineeMembershipNo = n.Nominee.MembershipNo,
            ProposerName = Name(n.Proposer.FirstName, n.Proposer.LastName),
            SeconderName = Name(n.Seconder.FirstName, n.Seconder.LastName),
            RoleStandingFor = n.RoleStandingFor,
            PhotoUrl = string.IsNullOrWhiteSpace(n.Nominee.PhotoUrl) ? null : n.Nominee.PhotoUrl,
            Occupation = n.Nominee.Occupation,
            Company = n.Nominee.Company,
            CreatedAt = n.CreatedAt
        }).ToList();
    }

    private async Task<GeneralMeeting?> CurrentMeetingAsync(CancellationToken cancellationToken)
    {
        var id = await _db.GeneralMeetings.AsNoTracking()
            .OrderBy(m => m.Status == "HELD" || m.Status == "CANCELLED" ? 1 : 0)
            .ThenByDescending(m => m.MeetingDate)
            .ThenByDescending(m => m.GeneralMeetingId)
            .Select(m => (long?)m.GeneralMeetingId)
            .FirstOrDefaultAsync(cancellationToken);
        return id is null ? null : await LoadMeetingAsync(id.Value, cancellationToken);
    }

    private async Task<GeneralMeeting> LoadMeetingAsync(long meetingId, CancellationToken cancellationToken) =>
        await _db.GeneralMeetings
            .Include(m => m.MeetingAgendaItems)
                .ThenInclude(a => a.Resolution)
            .Include(m => m.MemberVotes)
            .Include(m => m.Proxies)
            .FirstOrDefaultAsync(m => m.GeneralMeetingId == meetingId, cancellationToken)
        ?? throw new InvalidOperationException("Meeting was not found.");

    private async Task<int> CountEligibleVotersAsync(CancellationToken cancellationToken)
    {
        string[] codes = ["FULL", "LIFE", "COUNTRY", "OVERSEAS", "SENIOR", "SENIOR_LIFE"];
        return await _db.Accounts.AsNoTracking()
            .Where(a => a.IsActive && !a.IsDeleted && codes.Contains(a.MembershipType.Code))
            .CountAsync(cancellationToken);
    }

    private async Task EnsureCanVoteAsync(long profileId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.AsNoTracking()
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .Where(a => a.ProfileId == profileId && !a.IsDeleted && a.IsActive)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("Membership account was not found.");
        var code = account.MembershipType?.Code ?? "";
        if (!VotingClasses.Contains(code) || !MemberClassPrivileges.ForCode(code).CanVote)
            throw new InvalidOperationException("Your class does not carry a vote (Article 65).");
        var priv = MemberClassPrivileges.ForCode(code);
        if (!await SubscriptionsPaidUpAsync(account.AccountId, priv, account.CurrentMemberStatus?.Code, cancellationToken))
            throw new InvalidOperationException("Voting is blocked because your subscription is not paid up (Article 62).");
    }

    private async Task<bool> SubscriptionsPaidUpAsync(
        long accountId,
        MemberPrivilegeSet priv,
        string? statusCode,
        CancellationToken cancellationToken)
    {
        if (!priv.PaysSubscription) return true;
        if (string.Equals(statusCode, "REMOVED", StringComparison.OrdinalIgnoreCase)
            || string.Equals(statusCode, "POSTED", StringComparison.OrdinalIgnoreCase))
            return false;
        var year = DateTime.UtcNow.Year;
        return !await _db.Subscriptions.AsNoTracking()
            .AnyAsync(s =>
                s.AccountId == accountId
                && s.SubscriptionYear <= year
                && !s.WaivedFlag
                && s.AmountPaid < s.AmountDue,
                cancellationToken);
    }

    private static string ReceiptNo(long voteId, long agendaItemId) =>
        $"EV-{agendaItemId:D4}-{voteId:D6}";

    private static string? FormatPoBox(string? postal, string? code, string? city)
    {
        var parts = new[] { postal, code, city }.Where(v => !string.IsNullOrWhiteSpace(v));
        var joined = string.Join(", ", parts);
        return string.IsNullOrWhiteSpace(joined) ? null : joined;
    }

    private async Task EnsureSittingCommitteeAsync(long profileId, string role, CancellationToken cancellationToken)
    {
        var sitting = await _db.CommitteeMembers.AnyAsync(
            m => m.IsActive && m.Committee.IsActive && m.ProfileId == profileId, cancellationToken);
        if (!sitting)
            throw new InvalidOperationException($"The {role} must be a sitting Committee member.");
    }

    private async Task<MeetingMinutesDto> MapMinutesAsync(GeneralMeeting meeting, CancellationToken cancellationToken)
    {
        var status = string.Equals(meeting.MinutesStatus, "SIGNED", StringComparison.OrdinalIgnoreCase)
            ? "SIGNED"
            : "DRAFT";
        return new MeetingMinutesDto
        {
            GeneralMeetingId = meeting.GeneralMeetingId,
            Meeting = MapNotice(meeting),
            Proceedings = meeting.MinutesText,
            Status = status,
            RecordedByName = await ProfileNameAsync(meeting.MinutesRecordedByProfileId, cancellationToken),
            RecordedAt = meeting.MinutesRecordedAt,
            SignedByName = await ProfileNameAsync(meeting.MinutesSignedByProfileId, cancellationToken),
            SignedAt = meeting.MinutesSignedAt,
            ResultDeclaredAt = meeting.ResultDeclaredAt,
            ResultSummary = meeting.ResultSummary,
            Agenda = meeting.MeetingAgendaItems.OrderBy(a => a.SortOrder).Select(a =>
            {
                var votes = CountedVotes(meeting, a.MeetingAgendaItemId).ToList();
                return new AgendaItemTallyDto
                {
                    AgendaItemId = a.MeetingAgendaItemId,
                    Subject = a.Subject,
                    IsSpecialBusiness = a.IsSpecialBusinessFlag,
                    ForCount = votes.Count(v => v.VoteValue.Equals("FOR", StringComparison.OrdinalIgnoreCase)),
                    AgainstCount = votes.Count(v => v.VoteValue.Equals("AGAINST", StringComparison.OrdinalIgnoreCase)),
                    AbstainCount = votes.Count(v => v.VoteValue.Equals("ABSTAIN", StringComparison.OrdinalIgnoreCase)),
                    VotesCast = votes.Count
                };
            }).ToList()
        };
    }

    private static void EnsureMinutesUnsigned(GeneralMeeting meeting)
    {
        if (string.Equals(meeting.MinutesStatus, "SIGNED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("These minutes have been signed and can no longer be edited.");
    }

    private static string ProxyReviewStatus(Proxy proxy)
    {
        var status = (proxy.ReviewStatus ?? "").Trim().ToUpperInvariant();
        if (status is "PENDING" or "APPROVED" or "REJECTED" or "LATE")
            return status;
        return proxy.DepositedOnTimeFlag ? "PENDING" : "LATE";
    }

    private static bool IsApprovedProxy(Proxy proxy) =>
        ProxyReviewStatus(proxy) == "APPROVED";

    private static bool VoteCounts(GeneralMeeting meeting, MemberVote vote)
    {
        if (!vote.CastViaProxyId.HasValue || vote.CastViaProxyId.Value == 0)
            return true;
        var proxyId = vote.CastViaProxyId.Value;
        var proxy = meeting.Proxies.FirstOrDefault(p => p.ProxyId == proxyId);
        return proxy is not null && IsApprovedProxy(proxy);
    }

    private static IEnumerable<MemberVote> CountedVotes(GeneralMeeting meeting, long agendaItemId) =>
        meeting.MemberVotes.Where(v =>
            v.GeneralMeetingBusinessItemId == agendaItemId && VoteCounts(meeting, v));

    private static int CountQuorumParticipants(GeneralMeeting meeting)
    {
        var ids = new HashSet<long>();
        foreach (var vote in meeting.MemberVotes.Where(v => VoteCounts(meeting, v)))
            ids.Add(vote.VoterProfileId);
        foreach (var proxy in meeting.Proxies.Where(IsApprovedProxy))
            ids.Add(proxy.AppointingProfileId);
        return ids.Count;
    }

    private void ApplyApprovedProxyVotes(GeneralMeeting meeting, Proxy proxy, long? actorUserId)
    {
        if (proxy.LeaveToDiscretion)
            return;
        var instruction = (proxy.VoteInstruction ?? "").Trim().ToUpperInvariant();
        if (instruction is not ("FOR" or "AGAINST"))
            return;

        foreach (var item in meeting.MeetingAgendaItems)
        {
            if (meeting.MemberVotes.Any(v =>
                    v.VoterProfileId == proxy.AppointingProfileId
                    && v.GeneralMeetingBusinessItemId == item.MeetingAgendaItemId))
                continue;

            var vote = new MemberVote
            {
                GeneralMeetingId = meeting.GeneralMeetingId,
                GeneralMeetingBusinessItemId = item.MeetingAgendaItemId,
                VoterProfileId = proxy.AppointingProfileId,
                VoteMethod = "PROXY",
                VoteValue = instruction,
                CastViaProxyId = proxy.ProxyId,
                CastAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.MemberVotes.Add(vote);
            meeting.MemberVotes.Add(vote);
        }
    }

    private async Task<string?> ProfileNameAsync(long? profileId, CancellationToken cancellationToken)
    {
        if (profileId is null or 0) return null;
        var p = await _db.Profiles.AsNoTracking().FirstOrDefaultAsync(x => x.ProfileId == profileId, cancellationToken);
        return p is null ? null : Name(p.FirstName, p.LastName);
    }

    private async Task EnsureEligibleNominatorAsync(
        long profileId,
        string role,
        CancellationToken cancellationToken,
        bool requireOffice = false)
    {
        var account = await _db.Accounts.AsNoTracking()
            .Include(a => a.MembershipType)
            .Where(a => a.ProfileId == profileId && !a.IsDeleted && a.IsActive)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException($"The {role} is not an active member.");
        var code = account.MembershipType.Code ?? "";
        if (!NominateClasses.Contains(code))
            throw new InvalidOperationException($"The {role} must be a Life, Full, Country or Overseas member .");
        var years = YearsBetween(account.JoinedDate ?? account.StartDate, DateOnly.FromDateTime(DateTime.UtcNow));
        if (years < 3)
            throw new InvalidOperationException($"The {role} must have at least three consecutive years of membership.");
        if (requireOffice && !MemberClassPrivileges.ForCode(code).CanRunForOffice)
            throw new InvalidOperationException("That class is not eligible to stand for Committee or office.");
    }

    private static void EnsureWindowOpen(GeneralMeeting meeting)
    {
        if (!WindowOpen(meeting))
            throw new InvalidOperationException("The electronic balloting window is closed.");
    }

    private static bool WindowOpen(GeneralMeeting meeting)
    {
        if (!meeting.BallotWindowOpen) return false;
        if (meeting.BallotClosesAt is DateTime close && DateTime.UtcNow > close) return false;
        return meeting.ResultDeclaredAt is null;
    }

    private static MeetingNoticeDto MapNotice(GeneralMeeting meeting)
    {
        var type = (meeting.MeetingType ?? "AGM").ToUpperInvariant();
        var required = type == "EGM" ? 21 : 14;
        var notice = meeting.NoticeSentDate ?? DateOnly.FromDateTime(meeting.CreatedAt);
        var clear = meeting.MeetingDate.DayNumber - notice.DayNumber - 1;
        var met = clear >= required;
        return new MeetingNoticeDto
        {
            GeneralMeetingId = meeting.GeneralMeetingId,
            MeetingType = type,
            MeetingDate = meeting.MeetingDate.ToString("yyyy-MM-dd"),
            NoticeSentDate = meeting.NoticeSentDate?.ToString("yyyy-MM-dd"),
            Agenda = meeting.AgendaText,
            PapersUrl = meeting.PapersUrl,
            Venue = meeting.Venue,
            Status = meeting.Status,
            RequiredClearDays = required,
            ActualClearDays = Math.Max(clear, 0),
            NoticePeriodMet = met,
            //NoticePeriodDetail = met
            //    ? $"{type} notice period met ({clear} clear days; ≥{required})."
            //    : $"{type} notice needs at least {required} clear days. This notice gives {Math.Max(clear, 0)}."
        };
    }

    private static string Name(string? first, string? last) =>
        string.Join(" ", new[] { first, last }.Where(v => !string.IsNullOrWhiteSpace(v)));

    private static int YearsBetween(DateOnly? from, DateOnly today)
    {
        if (from is null) return 0;
        var years = today.Year - from.Value.Year;
        if (today < from.Value.AddYears(years)) years--;
        return Math.Max(years, 0);
    }
}
