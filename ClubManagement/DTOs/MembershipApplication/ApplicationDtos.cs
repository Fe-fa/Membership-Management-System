namespace ClubManagement.DTOs.MembershipApplication;

public class ApplicationListItemDto
{
    public long ApplicationId { get; set; }

    /// <summary>UI‑ready display reference ("APP-0002").</summary>
    public string ReferenceNumber { get; set; } = string.Empty;

    public string ApplicationNo { get; set; } = string.Empty;
    public long ApplicantProfileId { get; set; }
    public string ApplicantName { get; set; } = string.Empty;

    public string? ApplicantCity { get; set; }
    public string? ApplicantCountry { get; set; }
    public DateOnly? ApplicantDateOfBirth { get; set; }
    public int? ApplicantAgeYears { get; set; }

    public long ApplicationStatusId { get; set; }

    /// <summary>Workflow code the React client already speaks
    /// ("Draft" | "Submitted" | "UnderReview" | "Waitlist" | "Approved" | "Rejected").</summary>
    public string? StatusCode { get; set; }
    public string? StatusName { get; set; }

    public long ElectionTypeId { get; set; }

    /// <summary>Title of what was applied for (e.g. "Full Membership").
    /// Pulled from the wizard's formDataJson.membership.membershipType payload.</summary>
    public string? MembershipTypeName { get; set; }

    /// <summary>Short badge shown alongside the applicant name (e.g. "FULL").</summary>
    public string? MembershipTypeBadge { get; set; }

    /// <summary>When the applicant actually submitted; falls back to CreatedAt for drafts.</summary>
    public DateTime? AppliedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public int SectionsCompleted { get; set; }
    public int TotalSections { get; set; }

    public decimal? EntranceFeeAmount { get; set; }
    public decimal? AnnualSubscriptionAmount { get; set; }

    public bool InterviewRequiredFlag { get; set; }

    /// <summary>Display name from Payment_status (Pending | Paid | Partially paid | …).</summary>
    public string PaymentStatus { get; set; } = "Pending";

    /// <summary>Normalized Payment_status.code (PENDING | PAID | PARTIALLY_PAID | …).</summary>
    public string? PaymentStatusCode { get; set; }

    /// <summary>Pending | Partial | Complete — from Endorsement rows (proposer/seconder).</summary>
    public string SponsorStatus { get; set; } = "Pending";

    /// <summary>PENDING | PARTIAL | COMPLETE</summary>
    public string? SponsorStatusCode { get; set; }

    /// <summary>When both endorsements were last completed (UTC), if known.</summary>
    public DateTime? SponsorCompletedAt { get; set; }

    public int EndorsementsCompleted { get; set; }
    public int EndorsementsRequired { get; set; } = 2;

    /// <summary>Stage A: endorsements complete and both fees paid/initiated.</summary>
    public bool? StageAReadyForManager { get; set; }
    public bool? StageAPaymentsReady { get; set; }
    public bool? StageADocumentsReady { get; set; }
    public int? ClubVisitsLogged { get; set; }
    public bool? ClubVisitsMet { get; set; }
    public bool? CanAuthorizeToInterview { get; set; }

    /// <summary>Committee meeting the application was assigned to for interview (if any).</summary>
    public long? CommitteeMeetingId { get; set; }
    public string? CommitteeMeetingDate { get; set; }
    public string? CommitteeMeetingName { get; set; }
    public string? CommitteeMeetingTime { get; set; }
    public bool AssignedToMeeting { get; set; }

    /// <summary>Applicant-safe ballot label. Never includes vote counts.</summary>
    public string? ApplicantBallotLabel { get; set; }
    public DateOnly? ExcludedUntilDate { get; set; }
}

public class ApplicationDetailDto
{
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public long ApplicantProfileId { get; set; }
    public string ApplicantName { get; set; } = string.Empty;
    public long? ApplicationFormVersionId { get; set; }
    public long ElectionTypeId { get; set; }
    public long? ProposerProfileId { get; set; }
    public string? ProposerName { get; set; }
    public long? SeconderProfileId { get; set; }
    public string? SeconderName { get; set; }
    public long ApplicationStatusId { get; set; }
    public DateOnly? ReceivedDate { get; set; }
    public int ClubVisitsCount { get; set; }
    public bool InterviewRequiredFlag { get; set; }
    public decimal? EntranceFeeAmount { get; set; }
    public decimal? AnnualSubscriptionAmount { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
    public long? UpdatedByUserId { get; set; }
    // ---- Fields the React client consumes ----
    public string? StatusCode { get; set; }
    public string? StatusName { get; set; }
    public string? FormDataJson { get; set; }
    public List<string>? CompletedSteps { get; set; }
    // -------------------------------------------
    public List<ApplicationDocumentDto> Documents { get; set; } = new();
    public List<EndorsementDto> Endorsements { get; set; } = new();
    public List<ApplicationSignatureDto> Signatures { get; set; } = new();
    public List<ApplicationApprovalDto> Approvals { get; set; } = new();
    public List<ApplicationStatusHistoryDto> StatusHistory { get; set; } = new();
    public List<InterviewDto> Interviews { get; set; } = new();
    public List<ApplicationExclusionDto> Exclusions { get; set; } = new();
}

public class CreateApplicationRequest
{
    // Nullable so the React wizard can POST/PUT only the draft payload
    // (formDataJson / completedSteps / supporters) without wiping scalars.
    public string? ApplicationNo { get; set; }
    public long? ApplicantProfileId { get; set; }
    public long? ApplicationFormVersionId { get; set; }
    public long? ElectionTypeId { get; set; }
    public long? ProposerProfileId { get; set; }
    public long? SeconderProfileId { get; set; }
    public long? ApplicationStatusId { get; set; }
    public DateOnly? ReceivedDate { get; set; }
    public int ClubVisitsCount { get; set; }
    public bool InterviewRequiredFlag { get; set; }
    public decimal? EntranceFeeAmount { get; set; }
    public decimal? AnnualSubscriptionAmount { get; set; }
    public DateTime? SubmittedAt { get; set; }
    // Wizard draft payload + step progress.
    public string? FormDataJson { get; set; }
    public List<string>? CompletedSteps { get; set; }
    public long? CreatedByUserId { get; set; }
}

public class UpdateApplicationRequest : CreateApplicationRequest
{
    public long? UpdatedByUserId { get; set; }
}

public class SubmitApplicationRequest
{
    public long? ChangedByUserId { get; set; }
    public string? Reason { get; set; }
    public DateTime? SubmittedAt { get; set; }
}

public class ChangeApplicationStatusRequest
{
    public long ToStatusId { get; set; }
    public string? StatusCode { get; set; }
    public long? ChangedByUserId { get; set; }
    public string? Reason { get; set; }
}

public class ApplicationDocumentDto
{
    public long ApplicationDocumentId { get; set; }
    public long ApplicationId { get; set; }
    public long DocumentTypeId { get; set; }
    public string? DocumentTypeName { get; set; }
    public string? DocumentTypeCode { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string FileUrl { get; set; } = string.Empty;
    public DateTime? UploadedAt { get; set; }
    public long? UploadedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
    public long? UpdatedByUserId { get; set; }
    public bool IsVerified { get; set; }
    public string? VerificationStatus { get; set; }
    public string? VerificationNotes { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public long? VerifiedByUserId { get; set; }
}

public class VerifyApplicationDocumentRequest
{
    public bool Verified { get; set; }
    public string? Notes { get; set; }
    public long? VerifiedByUserId { get; set; }
}

public class CreateApplicationDocumentRequest
{
    public long DocumentTypeId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string FileUrl { get; set; } = string.Empty;
    public DateTime? UploadedAt { get; set; }
    public long? UploadedByUserId { get; set; }
    public long? CreatedByUserId { get; set; }
}

public class EndorsementDto
{
    public long EndorsementId { get; set; }
    public long ApplicationId { get; set; }
    public long EndorserProfileId { get; set; }
    public string? EndorserName { get; set; }
    public string EndorserRole { get; set; } = string.Empty;
    public int? YearsKnownCandidate { get; set; }
    public string? PersonalKnowledge { get; set; }
    public string? ProfessionalKnowledge { get; set; }
    public string? ValueAddition { get; set; }
    public int? EndorserYearOfJoining { get; set; }
    public string? EndorserPhone { get; set; }
    public string? EndorserEmail { get; set; }
    public DateTime CreatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
    public long? UpdatedByUserId { get; set; }
}

public class CreateEndorsementRequest
{
    public long EndorserProfileId { get; set; }
    public string EndorserRole { get; set; } = string.Empty;
    public int? YearsKnownCandidate { get; set; }
    public string? PersonalKnowledge { get; set; }
    public string? ProfessionalKnowledge { get; set; }
    public string? ValueAddition { get; set; }
    public int? EndorserYearOfJoining { get; set; }
    public string? EndorserPhone { get; set; }
    public string? EndorserEmail { get; set; }
    public long? CreatedByUserId { get; set; }
}

public class ApplicationSignatureDto
{
    public long ApplicationSignatureId { get; set; }
    public long ApplicationId { get; set; }
    public long SignatoryProfileId { get; set; }
    public string SignatoryRole { get; set; } = string.Empty;
    public string? SignatureImageUrl { get; set; }
    public DateTime? SignedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
    public long? UpdatedByUserId { get; set; }
}

public class CreateApplicationSignatureRequest
{
    public long SignatoryProfileId { get; set; }
    public string SignatoryRole { get; set; } = string.Empty;
    public string? SignatureImageUrl { get; set; }
    public DateTime? SignedAt { get; set; }
    public long? CreatedByUserId { get; set; }
}

public class ApplicationApprovalDto
{
    public long ApplicationApprovalId { get; set; }
    public long ApplicationId { get; set; }
    public long ApproverProfileId { get; set; }
    public long ApproverRoleId { get; set; }
    public string ApprovalDecision { get; set; } = string.Empty;
    public string? ApprovalSignatureUrl { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateOnly? DateElected { get; set; }
    public string? Remarks { get; set; }
    public DateTime CreatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
    public long? UpdatedByUserId { get; set; }
}

public class CreateApplicationApprovalRequest
{
    public long ApproverProfileId { get; set; }
    public long ApproverRoleId { get; set; }
    public string ApprovalDecision { get; set; } = string.Empty;
    public string? ApprovalSignatureUrl { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateOnly? DateElected { get; set; }
    public string? Remarks { get; set; }
    public long? CreatedByUserId { get; set; }
}

public class ApplicationStatusHistoryDto
{
    public long ApplicationStatusHistoryId { get; set; }
    public long ApplicationId { get; set; }
    public long? FromStatusId { get; set; }
    public string? FromStatusCode { get; set; }
    public string? FromStatusName { get; set; }
    public long ToStatusId { get; set; }
    public string? ToStatusCode { get; set; }
    public string? ToStatusName { get; set; }
    public DateTime ChangedAt { get; set; }
    public long? ChangedByUserId { get; set; }
    public string? Reason { get; set; }
}

public class InterviewDto
{
    public long InterviewId { get; set; }
    public long ApplicationId { get; set; }
    public long? CommitteeMeetingId { get; set; }
    public string? CommitteeMeetingDate { get; set; }
    public string? CommitteeMeetingName { get; set; }
    public string? CommitteeMeetingTime { get; set; }
    public string? CommitteeMeetingStatus { get; set; }
    public bool MeetingCreated { get; set; }
    public DateTime? ScheduledAt { get; set; }
    public DateTime? ConductedAt { get; set; }
    public long? InterviewerProfileId { get; set; }
    public bool AttendedFlag { get; set; }
    public string? Outcome { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
    public long? UpdatedByUserId { get; set; }
}

public class AssignMeetingRequest
{
    /// <summary>Existing Committee to attach the interview to (required).</summary>
    public long CommitteeId { get; set; }
    /// <summary>When set, assign to this existing scheduled meeting (must belong to CommitteeId).</summary>
    public long? CommitteeMeetingId { get; set; }
    /// <summary>ISO date yyyy-MM-dd — required when creating a new sitting under the committee.</summary>
    public string? MeetingDate { get; set; }
    /// <summary>Local time HH:mm — required when creating a new sitting under the committee.</summary>
    public string? MeetingTime { get; set; }
}

public class CreateInterviewRequest
{
    public long? CommitteeMeetingId { get; set; }
    public DateTime? ScheduledAt { get; set; }
    public DateTime? ConductedAt { get; set; }
    public long? InterviewerProfileId { get; set; }
    public bool AttendedFlag { get; set; }
    public string? Outcome { get; set; }
    public string? Notes { get; set; }
    public long? CreatedByUserId { get; set; }
}

public class ApplicationExclusionDto
{
    public long ApplicationExclusionId { get; set; }
    public long ApplicationId { get; set; }
    public long ApplicantProfileId { get; set; }
    public int AdverseVoteCount { get; set; }
    public DateOnly ExcludedDate { get; set; }
    public DateOnly? ExcludedUntilDate { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
    public long? UpdatedByUserId { get; set; }
}

public class CreateApplicationExclusionRequest
{
    public long ApplicantProfileId { get; set; }
    public int AdverseVoteCount { get; set; }
    public DateOnly ExcludedDate { get; set; }
    public DateOnly? ExcludedUntilDate { get; set; }
    public bool IsActive { get; set; } = true;
    public long? CreatedByUserId { get; set; }
}

public class WorkflowValidationResultDto
{
    public bool IsValid { get; set; }
    public List<string> Errors { get; set; } = new();
}

/// <summary>Stage A — Submit to Manager readiness + club-visit gate for interview.</summary>
public class ManagerReadinessDto
{
    public long ApplicationId { get; set; }
    public string? StatusCode { get; set; }
    public string? StatusName { get; set; }
    public bool EndorsementsComplete { get; set; }
    public bool EntranceFeeOk { get; set; }
    public bool AnnualSubscriptionOk { get; set; }
    public bool CvUploaded { get; set; }
    public bool IdPassportUploaded { get; set; }
    public bool PilotLicenseRequired { get; set; }
    public bool PilotLicenseUploaded { get; set; }
    public bool ReadyForManager { get; set; }
    /// <summary>Entrance + annual payments initiated/completed (gate for manager notification).</summary>
    public bool PaymentsReady { get; set; }
    /// <summary>Payments + required documents (CV, ID, licence if applicable).</summary>
    public bool DocumentsReady { get; set; }
    public List<string> PendingItems { get; set; } = [];
    public List<string> PendingPaymentItems { get; set; } = [];
    public int ClubVisitsLogged { get; set; }
    public int ClubVisitsRequired { get; set; } = 3;
    public bool ClubVisitsMet { get; set; }
    public bool ClubVisitsOverride { get; set; }
    public string? ClubVisitsOverrideReason { get; set; }
    /// <summary>Manager may authorize to Interview when docs, payments, sponsors and visits are verified.</summary>
    public bool CanProceedToInterview { get; set; }
    public bool VisibleToManager { get; set; }
}

public class ApplicationClubVisitDto
{
    public long ApplicationClubVisitId { get; set; }
    public long ApplicationId { get; set; }
    public DateOnly VisitDate { get; set; }
    public string MetWith { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
}

public class CreateApplicationClubVisitRequest
{
    public DateOnly VisitDate { get; set; }
    public string MetWith { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

public class ClubVisitsOverrideRequest
{
    public string Reason { get; set; } = string.Empty;
}
