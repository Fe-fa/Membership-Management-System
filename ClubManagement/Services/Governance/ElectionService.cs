using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Governance;
using ClubManagement.Entities.GeneralMeetings;
using ClubManagement.Services.MembershipAccount;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Governance;

public interface IElectionService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<MeetingNoticeDto>> ListNoticesAsync(CancellationToken cancellationToken);
    Task<MemberElectionDto> GetMineAsync(long profileId, CancellationToken cancellationToken);
    Task<VoteReceiptDto> CastVoteAsync(long meetingId, long profileId, CastMemberBallotRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task AppointProxyAsync(long meetingId, long profileId, AppointProxyRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<NominationDto> NominateAsync(long meetingId, CreateNominationRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ElectionDeskDto>> ListDeskAsync(CancellationToken cancellationToken);
    Task<ElectionDeskDto> PublishNoticeAsync(PublishMeetingNoticeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> AddAgendaAsync(long meetingId, AddAgendaItemRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> SetWindowAsync(long meetingId, SetBallotWindowRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> AppointOfficersAsync(long meetingId, AppointElectionOfficersRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ElectionDeskDto> DeclareResultAsync(long meetingId, long? chairmanProfileId, long? actorUserId, CancellationToken cancellationToken);
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

    public ElectionService(ApplicationModuleDbContext db) => _db = db;

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

        var code = account?.MembershipType.Code;
        var priv = MemberClassPrivileges.ForCode(code);
        var classOk = VotingClasses.Contains(code ?? "");
        var years = YearsBetween(account?.JoinedDate ?? account?.StartDate, DateOnly.FromDateTime(DateTime.UtcNow));
        var paidUp = account is null || await SubscriptionsPaidUpAsync(account.AccountId, priv, account.CurrentMemberStatus.Code, cancellationToken);
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

        dto.BallotItems = meeting.MeetingAgendaItems.OrderBy(a => a.SortOrder).Select(a =>
        {
            var mine = meeting.MemberVotes.FirstOrDefault(v =>
                v.GeneralMeetingBusinessItemId == a.MeetingAgendaItemId && v.VoterProfileId == profileId);
            return new MemberBallotItemDto
            {
                AgendaItemId = a.MeetingAgendaItemId,
                Subject = a.Subject,
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
                ProxyTitle = proxy.ProxyTitle,
                ProxyName = proxy.ProxyName,
                AlternateTitle = proxy.AlternateTitle,
                AlternateName = proxy.AlternateName,
                VoteInstruction = proxy.VoteInstruction,
                LeaveToDiscretion = proxy.LeaveToDiscretion,
                AppointingName = proxy.AppointingName,
                AppointingPoBox = proxy.AppointingPoBox,
                DepositedOnTime = proxy.DepositedOnTimeFlag
            };
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
        if (DateTime.UtcNow > deadline)
            throw new InvalidOperationException(
                request.IsPoll
                    ? "A poll proxy must be lodged at least 24 hours before the meeting (Article 65)."
                    : "A proxy must be lodged at least 48 hours before the meeting (Article 65).");

        await EnsureCanVoteAsync(profileId, cancellationToken);

        var name = (request.ProxyName ?? "").Trim();
        if (name.Length < 2)
            throw new InvalidOperationException("Proxy name is required.");

        var instructions = request.Instructions
            .Select(i => $"{i.AgendaItemId}:{(i.VoteValue ?? "").Trim().ToUpperInvariant()}")
            .Where(s => s.Contains(":FOR") || s.Contains(":AGAINST"));
        var packed = request.LeaveToDiscretion
            ? "DISCRETION"
            : string.IsNullOrWhiteSpace(request.VoteInstruction)
                ? string.Join("; ", instructions)
                : request.VoteInstruction.Trim();

        var existing = meeting.Proxies.FirstOrDefault(p => p.AppointingProfileId == profileId);
        if (existing is null)
        {
            existing = new Proxy
            {
                GeneralMeetingId = meetingId,
                AppointingProfileId = profileId,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId,
                IsValidFlag = true,
                DepositedOnTimeFlag = true,
                InstrumentReceivedAt = DateTime.UtcNow
            };
            _db.Proxies.Add(existing);
        }

        existing.ProxyTitle = string.IsNullOrWhiteSpace(request.ProxyTitle) ? "Mr" : request.ProxyTitle.Trim();
        existing.ProxyName = name;
        existing.AlternateTitle = string.IsNullOrWhiteSpace(request.AlternateTitle) ? null : request.AlternateTitle.Trim();
        existing.AlternateName = string.IsNullOrWhiteSpace(request.AlternateName) ? null : request.AlternateName.Trim();
        existing.VoteInstruction = packed;
        existing.LeaveToDiscretion = request.LeaveToDiscretion;
        existing.AppointingName = string.IsNullOrWhiteSpace(request.AppointingName) ? null : request.AppointingName.Trim();
        existing.AppointingPoBox = string.IsNullOrWhiteSpace(request.AppointingPoBox) ? null : request.AppointingPoBox.Trim();
        existing.IsPoll = request.IsPoll;
        existing.DepositedOnTimeFlag = DateTime.UtcNow <= deadline;
        existing.InstrumentReceivedAt = DateTime.UtcNow;
        existing.IsValidFlag = existing.DepositedOnTimeFlag;
        existing.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
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
            .OrderByDescending(m => m.MeetingDate)
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
        if (!DateOnly.TryParse(request.MeetingDate, out var meetingDate))
            throw new InvalidOperationException("Meeting date is required.");
        var type = (request.MeetingType ?? "AGM").Trim().ToUpperInvariant();
        if (type is not ("AGM" or "EGM"))
            throw new InvalidOperationException("Meeting type must be AGM or EGM.");

        var noticeDate = DateOnly.TryParse(request.NoticeSentDate, out var n) ? n : DateOnly.FromDateTime(DateTime.UtcNow);
        var meeting = new GeneralMeeting
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
            BallotClosesAt = type == "AGM"
                ? meetingDate.ToDateTime(new TimeOnly(23, 59)).AddDays(-2)
                : meetingDate.ToDateTime(new TimeOnly(23, 59)).AddDays(-2)
        };
        var notice = MapNotice(meeting);
        if (!notice.NoticePeriodMet)
            throw new InvalidOperationException(notice.NoticePeriodDetail);

        _db.GeneralMeetings.Add(meeting);
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(meeting.GeneralMeetingId, cancellationToken);
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
                throw new InvalidOperationException("Appoint the electronic-ballot returning officer first (Article 65).");
            await EnsureSittingCommitteeAsync(conductor.Value, "returning officer", cancellationToken);
            meeting.BallotWindowOpen = true;
            meeting.BallotConductorProfileId = conductor;
            meeting.BallotOpensAt ??= DateTime.UtcNow;
            meeting.BallotClosesAt = request.ClosesAt
                ?? meeting.MeetingDate.ToDateTime(new TimeOnly(23, 59)).AddDays(-2);
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
            throw new InvalidOperationException("Appoint two scrutineers before declaring the result (Article 55).");
        var uniqueVoters = meeting.MemberVotes.Select(v => v.VoterProfileId).Distinct().Count();
        if (uniqueVoters < 20)
            throw new InvalidOperationException(
                $"Quorum is not met ({uniqueVoters} of 20 Full/Life/Country/Overseas members — Article 56).");
        var parts = meeting.MeetingAgendaItems.OrderBy(a => a.SortOrder).Select(a =>
        {
            var votes = meeting.MemberVotes.Where(v => v.GeneralMeetingBusinessItemId == a.MeetingAgendaItemId).ToList();
            var forCount = votes.Count(v => v.VoteValue.Equals("FOR", StringComparison.OrdinalIgnoreCase));
            var against = votes.Count(v => v.VoteValue.Equals("AGAINST", StringComparison.OrdinalIgnoreCase));
            return $"{a.Subject}: FOR {forCount}, AGAINST {against}";
        });
        meeting.ResultDeclaredAt = DateTime.UtcNow;
        meeting.ResultDeclaredByProfileId = chairmanProfileId;
        meeting.QuorumMetFlag = true;
        meeting.ResultSummary =
            "Chairman's declaration is final and conclusive (Article 60). " + string.Join(" · ", parts);
        meeting.BallotWindowOpen = false;
        meeting.Status = "HELD";
        meeting.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return await MapDeskAsync(meetingId, cancellationToken);
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
        var uniqueVoters = meeting.MemberVotes.Select(v => v.VoterProfileId).Distinct().Count();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var daysBefore = meeting.MeetingDate.DayNumber - today.DayNumber;
        var nominationDeadline = meeting.MeetingDate.AddDays(-14);

        return new ElectionDeskDto
        {
            Meeting = MapNotice(meeting),
            BallotWindowOpen = meeting.BallotWindowOpen,
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
            QuorumRequired = 20,
            QuorumMet = uniqueVoters >= 20,
            Agenda = meeting.MeetingAgendaItems.OrderBy(a => a.SortOrder).Select(a =>
            {
                var votes = meeting.MemberVotes.Where(v => v.GeneralMeetingBusinessItemId == a.MeetingAgendaItemId).ToList();
                return new AgendaItemTallyDto
                {
                    AgendaItemId = a.MeetingAgendaItemId,
                    Subject = a.Subject,
                    IsSpecialBusiness = a.IsSpecialBusinessFlag,
                    ForCount = votes.Count(v => v.VoteValue.Equals("FOR", StringComparison.OrdinalIgnoreCase)),
                    AgainstCount = votes.Count(v => v.VoteValue.Equals("AGAINST", StringComparison.OrdinalIgnoreCase)),
                    VotesCast = votes.Count
                };
            }).ToList(),
            Nominations = await ListNominationsAsync(meetingId, cancellationToken)
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
            CreatedAt = n.CreatedAt
        }).ToList();
    }

    private async Task<GeneralMeeting?> CurrentMeetingAsync(CancellationToken cancellationToken)
    {
        var id = await _db.GeneralMeetings.AsNoTracking()
            .OrderByDescending(m => m.MeetingDate)
            .Select(m => (long?)m.GeneralMeetingId)
            .FirstOrDefaultAsync(cancellationToken);
        return id is null ? null : await LoadMeetingAsync(id.Value, cancellationToken);
    }

    private async Task<GeneralMeeting> LoadMeetingAsync(long meetingId, CancellationToken cancellationToken) =>
        await _db.GeneralMeetings
            .Include(m => m.MeetingAgendaItems)
            .Include(m => m.MemberVotes)
            .Include(m => m.Proxies)
            .FirstOrDefaultAsync(m => m.GeneralMeetingId == meetingId, cancellationToken)
        ?? throw new InvalidOperationException("Meeting was not found.");

    private async Task EnsureCanVoteAsync(long profileId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.AsNoTracking()
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .Where(a => a.ProfileId == profileId && !a.IsDeleted && a.IsActive)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("Membership account was not found.");
        var code = account.MembershipType.Code ?? "";
        if (!VotingClasses.Contains(code) || !MemberClassPrivileges.ForCode(code).CanVote)
            throw new InvalidOperationException("Your class does not carry a vote (Article 65).");
        var priv = MemberClassPrivileges.ForCode(code);
        if (!await SubscriptionsPaidUpAsync(account.AccountId, priv, account.CurrentMemberStatus.Code, cancellationToken))
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
        var sub = await _db.Subscriptions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == year, cancellationToken);
        if (sub is null) return true;
        return sub.AmountDue - sub.AmountPaid <= 0;
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
            throw new InvalidOperationException($"The {role} must be a Life, Full, Country or Overseas member (Article 20).");
        var years = YearsBetween(account.JoinedDate ?? account.StartDate, DateOnly.FromDateTime(DateTime.UtcNow));
        if (years < 3)
            throw new InvalidOperationException($"The {role} must have at least three consecutive years of membership (Article 20).");
        if (requireOffice && !MemberClassPrivileges.ForCode(code).CanRunForOffice)
            throw new InvalidOperationException("That class is not eligible to stand for Committee or office (Article 5).");
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
            NoticePeriodDetail = met
                ? $"{type} notice period met ({clear} clear days; Article 52 requires ≥{required})."
                : $"{type} notice needs at least {required} clear days (Article 52). This notice gives {Math.Max(clear, 0)}."
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
