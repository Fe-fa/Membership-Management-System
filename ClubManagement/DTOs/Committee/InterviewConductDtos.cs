namespace ClubManagement.DTOs.Committee;

public class AttachInterviewRequest
{
    public long ApplicationId { get; set; }
}

public class AttachInterviewsRequest
{
    public List<long> ApplicationIds { get; set; } = [];
}

public class SaveInterviewOutcomeRequest
{
    /// <summary>Approved | Waitlist | Rejected (Form 2025). Positive/Negative/Deferred still accepted.</summary>
    public string Outcome { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public bool Attended { get; set; } = true;
    public long? InterviewerProfileId { get; set; }
    public int? AviationScore { get; set; }
    public int? ClubFamiliarityScore { get; set; }
    public int? ProposerEndorsementScore { get; set; }
    public int? FinancialReadinessScore { get; set; }
    public int? BehaviourScore { get; set; }
    public string? Recommendation { get; set; }
    /// <summary>Suitable | Conditional | NotSuitable</summary>
    public string? Suitability { get; set; }
    /// <summary>Aligned | Partial | NotAligned</summary>
    public string? VerbalAlignment { get; set; }
    /// <summary>Required when outcome is Negative — returned with the application to the previous stage.</summary>
    public string? ReturnReason { get; set; }
    public string? CandidateMinutesUrl { get; set; }
    public string? DateElected { get; set; }
    public string? MembershipNumber { get; set; }
    public string? ChairmanSignature { get; set; }
    public string? ApprovalSignature { get; set; }
    public List<long>? SignatureProfileIds { get; set; }
}

public class InterviewFormPayload
{
    public int? AviationScore { get; set; }
    public int? ClubFamiliarityScore { get; set; }
    public int? ProposerEndorsementScore { get; set; }
    public int? FinancialReadinessScore { get; set; }
    public int? BehaviourScore { get; set; }
    public string? FormOutcome { get; set; }
    public string? Recommendation { get; set; }
    public string? Suitability { get; set; }
    public string? VerbalAlignment { get; set; }
    public string? ReturnReason { get; set; }
    public string? CandidateMinutesUrl { get; set; }
    public string? DateElected { get; set; }
    public string? MembershipNumber { get; set; }
    public string? ChairmanSignature { get; set; }
    public string? ApprovalSignature { get; set; }
    public List<long> SignatureProfileIds { get; set; } = [];
}

public class InterviewDocumentDto
{
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public bool OnFile { get; set; }
    public string? FileName { get; set; }
}

public class InterviewVisitDto
{
    public string VisitDate { get; set; } = string.Empty;
    public string MetWith { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

public class InterviewPaymentLineDto
{
    public string FeeLabel { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? ReceiptNumber { get; set; }
    public string? PaymentDate { get; set; }
    public string? Status { get; set; }
    public bool Received { get; set; }
}

public class MeetingInterviewDto
{
    public long InterviewId { get; set; }
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string? StatusCode { get; set; }
    public string? StatusName { get; set; }
    public long? CommitteeMeetingId { get; set; }
    public DateTime? ScheduledAt { get; set; }
    public DateTime? ConductedAt { get; set; }
    public long? InterviewerProfileId { get; set; }
    public bool AttendedFlag { get; set; }
    public string? Outcome { get; set; }
    public string? FormOutcome { get; set; }
    public string? Notes { get; set; }
    public bool OutcomeRecorded { get; set; }
    public bool CanRetrieve { get; set; }
    public bool CanAmendHistory { get; set; }
    public bool HasClubMembership { get; set; }
    public DateTime? LinkedAt { get; set; }
    public string? SittingLabel { get; set; }

    public bool IsAviationAffiliated { get; set; }
    public bool HoldsPilotLicence { get; set; }
    public bool OwnsAircraft { get; set; }
    public string? AviationRole { get; set; }
    public string? ProposerName { get; set; }
    public string? SeconderName { get; set; }
    public bool ProposerStandingMet { get; set; }
    public int PriorApplicationCount { get; set; }
    public int ClubVisitsLogged { get; set; }
    public int ClubVisitsRequired { get; set; } = 3;
    public bool ClubVisitsMet { get; set; }
    public List<InterviewVisitDto> ClubVisits { get; set; } = [];
    public List<InterviewDocumentDto> Documents { get; set; } = [];
    public bool EntranceFeeReceived { get; set; }
    public bool AnnualSubscriptionReceived { get; set; }
    public List<InterviewPaymentLineDto> PaymentLines { get; set; } = [];
    public InterviewFormPayload Form { get; set; } = new();
}

public class InterviewCandidateDto
{
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string? PhotoUrl { get; set; }
    public string? StatusCode { get; set; }
    public string? StatusName { get; set; }
    public bool AlreadyLinked { get; set; }
    public long? LinkedMeetingId { get; set; }
    public string? LinkedMeetingLabel { get; set; }
    public long? InterviewId { get; set; }
    public string? Outcome { get; set; }
    public string? Notes { get; set; }
    public bool HasClubMembership { get; set; }
    public InterviewFormPayload Form { get; set; } = new();
}

public class SittingAttendanceRowDto
{
    public long CommitteeMemberId { get; set; }
    public long ProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoleCode { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public bool Present { get; set; }
    public bool IsGeneralManager { get; set; }
    public bool CountsAsCommitteeSignature { get; set; }
}

public class SittingAttendanceDto
{
    public long MeetingId { get; set; }
    public List<SittingAttendanceRowDto> Members { get; set; } = [];
    public int CommitteePresentCount { get; set; }
    public bool GmPresent { get; set; }
    public bool GateMet { get; set; }
}

public class SetSittingAttendanceRequest
{
    public long CommitteeMemberId { get; set; }
    public bool Present { get; set; }
}
