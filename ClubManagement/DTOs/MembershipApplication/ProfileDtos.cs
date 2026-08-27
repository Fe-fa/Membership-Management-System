namespace ClubManagement.DTOs.MembershipApplication;

public class ProfileListItemDto
{
    public long ProfileId { get; set; }
    public string? MembershipNo { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Mobile { get; set; }
    public string? Occupation { get; set; }
    public bool IsActive { get; set; }
}

public class ProfileDetailDto
{
    public long ProfileId { get; set; }
    public long? AccountTypeId { get; set; }
    public string? MembershipNo { get; set; }
    public string? Title { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public long? GenderId { get; set; }
    public string? GenderName { get; set; }
    public long? MaritalStatusId { get; set; }
    public string? MaritalStatusName { get; set; }
    public long? BloodGroupId { get; set; }
    public string? BloodGroupName { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? PlaceOfBirth { get; set; }
    public long? NationalityId { get; set; }
    public string? NationalityName { get; set; }
    public long? CountryOfResidenceId { get; set; }
    public string? CountryOfResidenceName { get; set; }
    public string? IdPassportNo { get; set; }
    public string? Occupation { get; set; }
    public string? Company { get; set; }
    public string? Role { get; set; }
    public string? PostalAddress { get; set; }
    public string? City { get; set; }
    public string? StateCountry { get; set; }
    public string? PostalCode { get; set; }
    public long? CountryId { get; set; }
    public string? CountryName { get; set; }
    public string? Email { get; set; }
    public string? AltEmail { get; set; }
    public string? TelIntlPrefix { get; set; }
    public string? Mobile { get; set; }
    public string? TelOther { get; set; }
    public string? PhotoUrl { get; set; }
    public bool DataConsentGiven { get; set; }
    public DateTime? PrivacyPolicyAcceptedAt { get; set; }
    public bool IsActive { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime CreatedAt { get; set; }
    public long? CreatedByUserId { get; set; }
    public long? UpdatedByUserId { get; set; }
}

/// <summary>
/// The wizard posts display-name values ("Female", "Kenya", "PPL") rather than
/// FK ids; the service resolves them through the lookup tables ("*_name" fields)
/// and falls back to the explicit "*_id" fields when no name is supplied.
/// </summary>
public class CreateProfileRequest
{
    public long? AccountTypeId { get; set; }
    public string? MembershipNo { get; set; }
    public string? Title { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public long? GenderId { get; set; }
    public string? GenderName { get; set; }
    public long? MaritalStatusId { get; set; }
    public string? MaritalStatusName { get; set; }
    public long? BloodGroupId { get; set; }
    public string? BloodGroupName { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? PlaceOfBirth { get; set; }
    public long? NationalityId { get; set; }
    public string? NationalityName { get; set; }
    public long? CountryOfResidenceId { get; set; }
    public string? CountryOfResidenceName { get; set; }
    public string? IdPassportNo { get; set; }
    public string? Occupation { get; set; }
    public string? Company { get; set; }
    public string? Role { get; set; }
    public string? PostalAddress { get; set; }
    public string? City { get; set; }
    public string? StateCountry { get; set; }
    public string? PostalCode { get; set; }
    public long? CountryId { get; set; }
    public string? CountryName { get; set; }
    public string? Email { get; set; }
    public string? AltEmail { get; set; }
    public string? TelIntlPrefix { get; set; }
    public string? Mobile { get; set; }
    public string? TelOther { get; set; }
    public string? PhotoUrl { get; set; }
    public bool DataConsentGiven { get; set; }
    public DateTime? PrivacyPolicyAcceptedAt { get; set; }
    public bool IsActive { get; set; } = true;
    public long? CreatedByUserId { get; set; }
}

public class UpdateProfileRequest : CreateProfileRequest
{
    public bool IsDeleted { get; set; }
    public long? UpdatedByUserId { get; set; }
}
