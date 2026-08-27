namespace ClubManagement.DTOs.MembershipAccount;

public class MemberProfileDto
{
    public long AccountId { get; set; }
    public long ProfileId { get; set; }
    public long? ApplicationId { get; set; }
    public string MembershipNo { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string StatusCode { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateOnly? JoinedDate { get; set; }
    public DateOnly? StartDate { get; set; }
    public decimal OutstandingArrears { get; set; }
    public MemberIdentityDto Identity { get; set; } = new();
    public MemberContactDto Contact { get; set; } = new();
    public List<MemberKinDto> Spouses { get; set; } = [];
    public List<MemberChildDto> Children { get; set; } = [];
    public List<MemberEmergencyDto> EmergencyContacts { get; set; } = [];
    public MemberAviationDto Aviation { get; set; } = new();
    public MemberClubsDto Clubs { get; set; } = new();
    public MemberConsentDto Consent { get; set; } = new();
    public MemberGovernanceDto Governance { get; set; } = new();
}

public class MemberIdentityDto
{
    public string? Title { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public string? PhotoUrl { get; set; }
    public string? CvUrl { get; set; }
    public string? IdPassportNo { get; set; }
    public string? Nationality { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? PlaceOfBirth { get; set; }
    public int? AgeYears { get; set; }
    public string? BloodGroup { get; set; }
    public string? Gender { get; set; }
    public string? MaritalStatus { get; set; }
    public string? Occupation { get; set; }
    public string? Company { get; set; }
    public string? Role { get; set; }
}

public class MemberContactDto
{
    public string? PostalAddress { get; set; }
    public string? City { get; set; }
    public string? StateCountry { get; set; }
    public string? PostalCode { get; set; }
    public string? Country { get; set; }
    public string? CountryOfResidence { get; set; }
    public string? Email { get; set; }
    public string? AltEmail { get; set; }
    public string? TelIntlPrefix { get; set; }
    public string? Mobile { get; set; }
    public string? TelOther { get; set; }
}

public class MemberKinDto
{
    public long? DependantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
}

public class MemberChildDto
{
    public long? DependantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateOnly? DateOfBirth { get; set; }
    public int? AgeYears { get; set; }
    public bool RequiresOwnMembership { get; set; }
    public string? Note { get; set; }
}

public class MemberEmergencyDto
{
    public long? MemberEmergencyContactId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool IsPrimary { get; set; }
}

public class MemberAviationDto
{
    public bool IsAffiliated { get; set; }
    public string? AviationRole { get; set; }
    public bool HoldsLicense { get; set; }
    public bool OwnsAircraft { get; set; }
    public List<MemberLicenseEditDto> Licenses { get; set; } = [];
    public List<MemberAircraftEditDto> Aircraft { get; set; } = [];
}

public class MemberLicenseEditDto
{
    public long? MemberLicenseId { get; set; }
    public string? LicenseType { get; set; }
    public string LicenseNumber { get; set; } = string.Empty;
    public string? Issuer { get; set; }
    public string? CopyFileName { get; set; }
    public string? CopyFileUrl { get; set; }
}

public class MemberAircraftEditDto
{
    public long? MemberAircraftId { get; set; }
    public string? AircraftType { get; set; }
    public string? CountryOfRegistration { get; set; }
    public string RegistrationNumber { get; set; } = string.Empty;
    public string? HangarLocation { get; set; }
}

public class MemberGovernanceDto
{
    public long MembershipTypeId { get; set; }
    public string MembershipTypeCode { get; set; } = string.Empty;
    public string MembershipTypeName { get; set; } = string.Empty;
    public bool ClassAllowsVote { get; set; }
    public bool InGoodStanding { get; set; }
    public bool EligibleToVote { get; set; }
    public string VotingReason { get; set; } = string.Empty;
    public int ContinuousMembershipYears { get; set; }
    public bool EligibleForSenior { get; set; }
    public bool EligibleForSeniorLife { get; set; }
    public int SubscriptionDiscountPercent { get; set; }
    public string? RecommendedMembershipTypeCode { get; set; }
    public string? RecommendedMembershipTypeName { get; set; }
    public string SeniorityReason { get; set; } = string.Empty;
    public MemberLinkDto? Proposer { get; set; }
    public MemberLinkDto? Seconder { get; set; }
}

public class MemberLinkDto
{
    public long ProfileId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? MembershipNo { get; set; }
}

public class MemberAuditEntryDto
{
    public DateTime At { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string? Actor { get; set; }
    public string? Summary { get; set; }
}

public class MemberClubsDto
{
    public bool MemberOfOtherClub { get; set; }
    public List<MemberClubNameDto> OtherClubs { get; set; } = [];
}

public class MemberClubNameDto
{
    public string Name { get; set; } = string.Empty;
}

public class MemberConsentDto
{
    public bool PrivacyPolicyAccepted { get; set; }
    public bool DeclarationAccepted { get; set; }
    public string? DeclarationName { get; set; }
    public string? DeclarationSignature { get; set; }
    public DateOnly? DeclarationDate { get; set; }
}

public class UpdateMemberProfileRequest
{
    public string? MembershipNo { get; set; }
    public DateOnly? JoinedDate { get; set; }
    public MemberIdentityDto Identity { get; set; } = new();
    public MemberContactDto Contact { get; set; } = new();
    public List<MemberKinDto> Spouses { get; set; } = [];
    public List<MemberChildDto> Children { get; set; } = [];
    public List<MemberEmergencyDto> EmergencyContacts { get; set; } = [];
    public MemberAviationDto Aviation { get; set; } = new();
    public MemberClubsDto? Clubs { get; set; }
    public MemberConsentDto? Consent { get; set; }
    public long MembershipTypeId { get; set; }
    public string? ChangeReason { get; set; }
}
