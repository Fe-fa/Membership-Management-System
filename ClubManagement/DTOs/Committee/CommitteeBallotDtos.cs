using System.Text.Json.Serialization;

namespace ClubManagement.DTOs.Committee;

public class AttachBallotRequest
{
    public long ApplicationId { get; set; }
}

public class CastCommitteeBallotRequest
{
    /// <summary>FOR | AGAINST</summary>
    public string VoteValue { get; set; } = string.Empty;
}

public class SetAttendanceRequest
{
    public List<long> CommitteeMemberIds { get; set; } = [];
}

public class AdmissionSignRequest
{
    /// <summary>COMMITTEE | GENERAL_MANAGER | CHAIRMAN</summary>
    public string SignatoryKind { get; set; } = "COMMITTEE";
    public string? SignatureName { get; set; }
    public string? DateElected { get; set; }
    public string? MembershipNumber { get; set; }
    public string? ElectedMembershipType { get; set; }
}

public class CommitteeBallotMeetingDto
{
    public long CommitteeMeetingId { get; set; }
    public string MeetingName { get; set; } = string.Empty;
    public string MeetingDate { get; set; } = string.Empty;
    public string? MeetingTime { get; set; }
    public string Status { get; set; } = string.Empty;
    public int CommitteeSize { get; set; }
    public int QuorumRequired { get; set; } = 7;
    public int PresentCount { get; set; }
    public bool MeetingQuorumMet { get; set; }
    public string? DeskMessage { get; set; }
    public IReadOnlyList<BallotSeatDto> Seats { get; set; } = [];
    public IReadOnlyList<CommitteeBallotItemDto> Items { get; set; } = [];
    public IReadOnlyList<BallotCandidateDto> PendingApplicants { get; set; } = [];
}

public class BallotSeatDto
{
    public long CommitteeMemberId { get; set; }
    public long ProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public bool Present { get; set; }
}

public class CommitteeBallotItemDto
{
    public long CommitteeBallotItemId { get; set; }
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string? ApplicationStatusCode { get; set; }
    public string ItemStatus { get; set; } = "OPEN";
    public int ForCount { get; set; }
    public int AgainstCount { get; set; }
    public int VotesCast { get; set; }
    public int CommitteeSize { get; set; }
    public int QuorumRequired { get; set; }
    public bool QuorumMet { get; set; }
    public bool AutoRejected { get; set; }
    public string? ExcludedUntil { get; set; }
    public bool MyVoteCast { get; set; }
    public string? MyVoteValue { get; set; }
    public bool CanProceedToSignatures { get; set; }
    public int CommitteeSignatures { get; set; }
    public int GmSignatures { get; set; }
    public bool ChairmanSigned { get; set; }
    public bool ReadyForChairman { get; set; }
    public string? AppliedMembershipType { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    [JsonPropertyName("voted")]
    public List<BallotVoterDto> Voted { get; set; } = [];

    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    [JsonPropertyName("notVoted")]
    public List<BallotVoterDto> NotVoted { get; set; } = [];

    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    [JsonPropertyName("signatures")]
    public List<BallotSignatureDto> Signatures { get; set; } = [];

    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    [JsonPropertyName("awaitingSignatures")]
    public List<BallotSignatureDto> AwaitingSignatures { get; set; } = [];
}

public class BallotVoterDto
{
    public long ProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public string? VoteValue { get; set; }
    public bool Present { get; set; }
}

public class BallotSignatureDto
{
    public long ProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string? DateElected { get; set; }
}

public class BallotCandidateDto
{
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string? StatusCode { get; set; }
    public string? StatusName { get; set; }
    public bool AlreadyLinked { get; set; }
}
