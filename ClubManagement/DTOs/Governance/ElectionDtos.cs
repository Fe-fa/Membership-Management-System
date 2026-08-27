namespace ClubManagement.DTOs.Governance;

public class PublishMeetingNoticeRequest
{
    /// <summary>AGM | EGM</summary>
    public string MeetingType { get; set; } = "AGM";
    public string MeetingDate { get; set; } = string.Empty;
    public string? Agenda { get; set; }
    public string? PapersUrl { get; set; }
    public string? Venue { get; set; }
    public string? NoticeSentDate { get; set; }
}

public class SetBallotWindowRequest
{
    public bool Open { get; set; }
    public long? ConductorProfileId { get; set; }
    public DateTime? ClosesAt { get; set; }
}

public class CreateNominationRequest
{
    public long NomineeProfileId { get; set; }
    public long ProposerProfileId { get; set; }
    public long SeconderProfileId { get; set; }
    public string RoleStandingFor { get; set; } = string.Empty;
}

public class CastMemberBallotRequest
{
    public long AgendaItemId { get; set; }
    public string VoteValue { get; set; } = string.Empty;
}

public class AppointProxyRequest
{
    public string ProxyTitle { get; set; } = string.Empty;
    public string ProxyName { get; set; } = string.Empty;
    public string? AlternateTitle { get; set; }
    public string? AlternateName { get; set; }
    public string? VoteInstruction { get; set; }
    public bool LeaveToDiscretion { get; set; }
    public string? AppointingName { get; set; }
    public string? AppointingPoBox { get; set; }
    public bool IsPoll { get; set; }
    public List<ProxyInstructionDto> Instructions { get; set; } = [];
}

public class ProxyInstructionDto
{
    public long AgendaItemId { get; set; }
    /// <summary>FOR | AGAINST</summary>
    public string VoteValue { get; set; } = string.Empty;
}

public class AddAgendaItemRequest
{
    public string Subject { get; set; } = string.Empty;
    public bool IsSpecialBusiness { get; set; }
}

public class MeetingNoticeDto
{
    public long GeneralMeetingId { get; set; }
    public string MeetingType { get; set; } = string.Empty;
    public string MeetingDate { get; set; } = string.Empty;
    public string? NoticeSentDate { get; set; }
    public string? Agenda { get; set; }
    public string? PapersUrl { get; set; }
    public string? Venue { get; set; }
    public string Status { get; set; } = string.Empty;
    public int RequiredClearDays { get; set; }
    public int ActualClearDays { get; set; }
    public bool NoticePeriodMet { get; set; }
    public string NoticePeriodDetail { get; set; } = string.Empty;
}

public class AppointElectionOfficersRequest
{
    public long? Scrutineer1ProfileId { get; set; }
    public long? Scrutineer2ProfileId { get; set; }
    public long? ReturningOfficerProfileId { get; set; }
}

public class ElectionDeskDto
{
    public MeetingNoticeDto Meeting { get; set; } = new();
    public bool BallotWindowOpen { get; set; }
    public DateTime? BallotClosesAt { get; set; }
    public long? ConductorProfileId { get; set; }
    public string? ConductorName { get; set; }
    public long? Scrutineer1ProfileId { get; set; }
    public string? Scrutineer1Name { get; set; }
    public long? Scrutineer2ProfileId { get; set; }
    public string? Scrutineer2Name { get; set; }
    public DateTime? ResultDeclaredAt { get; set; }
    public string? ResultSummary { get; set; }
    public string? NominationDeadline { get; set; }
    public bool NominationsOpen { get; set; }
    public int UniqueVoters { get; set; }
    public int QuorumRequired { get; set; } = 20;
    public bool QuorumMet { get; set; }
    public IReadOnlyList<AgendaItemTallyDto> Agenda { get; set; } = [];
    public IReadOnlyList<NominationDto> Nominations { get; set; } = [];
}

public class AgendaItemTallyDto
{
    public long AgendaItemId { get; set; }
    public string Subject { get; set; } = string.Empty;
    public bool IsSpecialBusiness { get; set; }
    public int ForCount { get; set; }
    public int AgainstCount { get; set; }
    public int AbstainCount { get; set; }
    public int VotesCast { get; set; }
}

public class NominationDto
{
    public long ElectionNominationId { get; set; }
    public string NomineeName { get; set; } = string.Empty;
    public string? NomineeMembershipNo { get; set; }
    public string ProposerName { get; set; } = string.Empty;
    public string SeconderName { get; set; } = string.Empty;
    public string RoleStandingFor { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class MemberElectionDto
{
    public bool CanVote { get; set; }
    public bool SubscriptionsPaidUp { get; set; }
    public bool EligibleToVote { get; set; }
    public bool CanRunForOffice { get; set; }
    public int ContinuousMembershipYears { get; set; }
    public string? ClassCode { get; set; }
    public string? ClassName { get; set; }
    public string MemberName { get; set; } = string.Empty;
    public string? MembershipNo { get; set; }
    public string? PostalAddress { get; set; }
    public string? NoVoteReason { get; set; }
    public MeetingNoticeDto? Notice { get; set; }
    public bool BallotWindowOpen { get; set; }
    public DateTime? BallotOpensAt { get; set; }
    public DateTime? BallotClosesAt { get; set; }
    public DateTime? ProxyDeadlineAt { get; set; }
    public DateTime? PollProxyDeadlineAt { get; set; }
    public IReadOnlyList<MemberBallotItemDto> BallotItems { get; set; } = [];
    public MemberProxyDto? Proxy { get; set; }
    public IReadOnlyList<NominationDto> Nominations { get; set; } = [];
}

public class MemberBallotItemDto
{
    public long AgendaItemId { get; set; }
    public string Subject { get; set; } = string.Empty;
    public bool IsSpecialBusiness { get; set; }
    public string? MyVoteValue { get; set; }
    public string? ReceiptNumber { get; set; }
    public DateTime? CastAt { get; set; }
}

public class VoteReceiptDto
{
    public long MemberVoteId { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public long AgendaItemId { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string VoteValue { get; set; } = string.Empty;
    public DateTime CastAt { get; set; }
}

public class MemberProxyDto
{
    public long ProxyId { get; set; }
    public string? ProxyTitle { get; set; }
    public string? ProxyName { get; set; }
    public string? AlternateTitle { get; set; }
    public string? AlternateName { get; set; }
    public string? VoteInstruction { get; set; }
    public bool LeaveToDiscretion { get; set; }
    public string? AppointingName { get; set; }
    public string? AppointingPoBox { get; set; }
    public bool DepositedOnTime { get; set; }
}

public class MemberSearchHitDto
{
    public long ProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? MembershipNo { get; set; }
    public string ClassCode { get; set; } = string.Empty;
    public int ContinuousYears { get; set; }
    public bool EligibleToNominate { get; set; }
}
