namespace ClubManagement.DTOs.Committee;

public class CreateCommitteeRequest
{
    public string CommitteeName { get; set; } = string.Empty;
    public string? TermStart { get; set; }
    public string? TermEnd { get; set; }
    /// <summary>Defaults to "main".</summary>
    public string? Type { get; set; }
}

public class UpdateCommitteeRequest
{
    public string CommitteeName { get; set; } = string.Empty;
    public string? TermStart { get; set; }
    public string? TermEnd { get; set; }
}

public class AddCommitteeMemberRequest
{
    public long ProfileId { get; set; }
    public long CommitteeRoleId { get; set; }
    public string? AppointedDate { get; set; }
}

public class CreateCommitteeMeetingRequest
{
    public long MeetingTypeId { get; set; }
    public string MeetingDate { get; set; } = string.Empty;
    public string? MeetingTime { get; set; }
    public string? MeetingName { get; set; }
    public long? ChairProfileId { get; set; }
}

public class UpdateMeetingStatusRequest
{
    public string Status { get; set; } = string.Empty;
    /// <summary>When true, allow marking HELD even if linked interviews lack outcomes.</summary>
    public bool Force { get; set; }
}

public class UpdateMeetingMinutesRequest
{
    public string MinutesUrl { get; set; } = string.Empty;
}

public class CommitteeMemberDto
{
    public long CommitteeMemberId { get; set; }
    public long ProfileId { get; set; }
    public string ProfileName { get; set; } = string.Empty;
    public string? MembershipNo { get; set; }
    /// <summary>Passport / profile photo URL when set (AFFIX PHOTO).</summary>
    public string? PhotoUrl { get; set; }
    /// <summary>Club email for mailto contact only — not for display on the roster.</summary>
    public string? ContactEmail { get; set; }
    public long CommitteeRoleId { get; set; }
    public string RoleCode { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public int RoleSortOrder { get; set; }
    public bool CanApproveCredit { get; set; }
    public bool IsAviationAffiliated { get; set; }
    public string? AppointedDate { get; set; }
    public string? EndDate { get; set; }
    public bool IsActive { get; set; }
}

public class CommitteeMeetingDto
{
    public long CommitteeMeetingId { get; set; }
    public long CommitteeId { get; set; }
    public long MeetingTypeId { get; set; }
    public string MeetingTypeCode { get; set; } = string.Empty;
    public string MeetingTypeName { get; set; } = string.Empty;
    public string MeetingDate { get; set; } = string.Empty;
    public string? MeetingTime { get; set; }
    public string? MeetingName { get; set; }
    public long? ChairProfileId { get; set; }
    public string? ChairName { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? MinutesUrl { get; set; }
    public int LinkedInterviewCount { get; set; }
    public int PendingOutcomeCount { get; set; }
}

public class CommitteeDetailDto
{
    public long CommitteeId { get; set; }
    public string CommitteeName { get; set; } = string.Empty;
    public string Type { get; set; } = "main";
    public string? TermStart { get; set; }
    public string? TermEnd { get; set; }
    public bool IsActive { get; set; }
    public IReadOnlyList<CommitteeMemberDto> Members { get; set; } = [];
    public IReadOnlyList<CommitteeMeetingDto> Meetings { get; set; } = [];
    public CommitteeMeetingDto? NextMeeting { get; set; }
    public int NonOfficerCount { get; set; }
    public int AviationActiveNonOfficers { get; set; }
    public bool AviationRuleMet { get; set; }
}

public class CommitteeRoleOptionDto
{
    public long CommitteeRoleId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool CanApproveCredit { get; set; }
    public bool IsOfficer { get; set; }
}

public class MeetingTypeOptionDto
{
    public long MeetingTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

public class ProfileSearchHitDto
{
    public long ProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? MembershipNo { get; set; }
    public bool IsAviationAffiliated { get; set; }
}

public class ActiveCommitteeOptionDto
{
    public long CommitteeId { get; set; }
    public string CommitteeName { get; set; } = string.Empty;
    public string Type { get; set; } = "main";
    public string? TermStart { get; set; }
    public string? TermEnd { get; set; }
    public IReadOnlyList<CommitteeMeetingDto> ScheduledMeetings { get; set; } = [];
}
