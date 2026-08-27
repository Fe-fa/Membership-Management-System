namespace ClubManagement.DTOs.MembershipAccount;

public class MemberDashboardDto
{
    public bool IsElectedMember { get; set; }
    public long AccountId { get; set; }
    public long ProfileId { get; set; }
    public string MembershipNo { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? PhotoUrl { get; set; }
    public string ClassCode { get; set; } = string.Empty;
    public string ClassName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string StatusCode { get; set; } = string.Empty;
    public DateOnly? DateElected { get; set; }
    public int ContinuousMembershipYears { get; set; }
    public MemberCardFlagsDto Cards { get; set; } = new();
    public MemberPrivilegeFlagsDto Privileges { get; set; } = new();
    public string Standing { get; set; } = "InGoodStanding";
    public string StandingDetail { get; set; } = string.Empty;
    public int PendingEndorsements { get; set; }
    public int ChildrenRequiringOwnMembership { get; set; }
}

public class MemberCardFlagsDto
{
    public bool Profile { get; set; } = true;
    public bool Subscriptions { get; set; }
    public bool Guests { get; set; }
    public bool Committee { get; set; }
    public string CommitteeMode { get; set; } = "hidden";
    /// <summary>Election / AGM ballot &amp; nominations — driven by CanVote (and office for nominate).</summary>
    public bool Election { get; set; }
    public bool Accommodation { get; set; } = true;
    public bool Endorsements { get; set; } = true;
    public bool Documents { get; set; } = true;
    /// <summary>Sitting Committee members only — Article 6 admission ballot.</summary>
    public bool CommitteeBallot { get; set; }
}

public class MemberPrivilegeFlagsDto
{
    public bool CanVote { get; set; }
    public bool CanRunForOffice { get; set; }
    public bool CanIntroduceGuests { get; set; }
    public bool ReciprocationAllowed { get; set; }
    public bool PaysSubscription { get; set; }
    public int SubscriptionDiscountPercent { get; set; }
}

public class MemberSubscriptionDto
{
    public string Standing { get; set; } = "InGoodStanding";
    public string Detail { get; set; } = string.Empty;
    public bool PaysSubscription { get; set; }
    public int Year { get; set; }
    public decimal AmountDue { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal Outstanding { get; set; }
    public DateOnly DueDate { get; set; }
    public DateOnly PostingDeadline { get; set; }
    public DateOnly RemovalDeadline { get; set; }
    public int DiscountPercent { get; set; }
}

public class MemberNotificationDto
{
    public long NotificationId { get; set; }
    public string TypeCode { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string? Channel { get; set; }
    public DateTime? SentDate { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public bool IsRead { get; set; }
    public string? RelatedEntityType { get; set; }
    public long? RelatedEntityId { get; set; }
}

public class CompleteEndorsementRequest
{
    public string EndorserRole { get; set; } = string.Empty;
    public int YearsKnownCandidate { get; set; }
    public string PersonalKnowledge { get; set; } = string.Empty;
    public string ProfessionalKnowledge { get; set; } = string.Empty;
    public string ValueAddition { get; set; } = string.Empty;
    public bool IntegrityConfirmed { get; set; }
    public string? SignatureImageUrl { get; set; }
}

public class EndorsementInviteDto
{
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string? ApplicantPhotoUrl { get; set; }
    public string MembershipType { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public int? EndorserYearOfJoining { get; set; }
    public string? EndorserMembershipNo { get; set; }
    public string? EndorserName { get; set; }
    public string? EndorserPhone { get; set; }
    public string? EndorserEmail { get; set; }
}

public class EndorsementHistoryDto
{
    public long ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Outcome { get; set; } = string.Empty;
    public DateTime CompletedAt { get; set; }
}

public class MemberDocumentsDto
{
    public bool DataConsentGiven { get; set; }
    public DateTime? PrivacyPolicyAcceptedAt { get; set; }
    public DateTime? ConsentWithdrawnAt { get; set; }
    public List<MemberCircularDto> Circulars { get; set; } = [];
    public List<PaymentRowLite> Receipts { get; set; } = [];
}

public class MemberCircularDto
{
    public string Title { get; set; } = string.Empty;
    public string Kind { get; set; } = "Circular";
    public string Summary { get; set; } = string.Empty;
}

public class PaymentRowLite
{
    public string? ReceiptNumber { get; set; }
    public decimal Amount { get; set; }
    public DateOnly? PaymentDate { get; set; }
    public string? Method { get; set; }
}

public class ReciprocalUsageDto
{
    public long ReciprocalUsageId { get; set; }
    public long HomeClubId { get; set; }
    public string HomeClubName { get; set; } = string.Empty;
    public DateOnly VisitDate { get; set; }
    public int DaysUsed { get; set; }
}

public class ReciprocalSummaryDto
{
    public int DaysUsedIn12Months { get; set; }
    public int MaxDays { get; set; }
    public List<ReciprocalUsageDto> Visits { get; set; } = [];
    public List<ClubOptionDto> Clubs { get; set; } = [];
}

public class ClubOptionDto
{
    public long ClubId { get; set; }
    public string ClubName { get; set; } = string.Empty;
}

public class AccommodationBookingDto
{
    public long AccommodationBookingId { get; set; }
    public DateOnly CheckInDate { get; set; }
    public DateOnly CheckOutDate { get; set; }
    public string? RoomType { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal? CancellationFee { get; set; }
}

public class CreateAccommodationBookingRequest
{
    public DateOnly CheckInDate { get; set; }
    public DateOnly CheckOutDate { get; set; }
    public string? RoomType { get; set; }
}

public class MemberPayRequest
{
    public long PaymentMethodId { get; set; }
    public decimal Amount { get; set; }
    public DateOnly PaymentDate { get; set; }
    public string? MpesaCode { get; set; }
    public string? ChequeNo { get; set; }
    public string? ReferenceNote { get; set; }
    /// <summary>Optional override (PENDING | PAID | PARTIALLY_PAID). Defaults by method.</summary>
    public string? PaymentStatusCode { get; set; }
}

public class ApplicationPayRequest
{
    public long PaymentMethodId { get; set; }
    /// <summary>JOINING | ANNUAL</summary>
    public string FeeTypeCode { get; set; } = "JOINING";
    public decimal Amount { get; set; }
    public DateOnly PaymentDate { get; set; }
    public string? MpesaCode { get; set; }
    public string? MpesaPhone { get; set; }
    public string? ChequeNo { get; set; }
    public string? ReferenceNote { get; set; }
    public string? PaymentStatusCode { get; set; }
}
