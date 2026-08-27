using System;
using System.Collections.Generic;

namespace ClubManagement.DTOs.MembershipApplication;

/// <summary>
/// Payload the React wizard sends to persist the relational (non-JSON) side of
/// the membership application: family, aviation, other-club affiliations and the
/// applicant's typed signature. Each slice maps 1:1 onto the DDL child tables:
///   family   -> MDependant (SPOUSE + CHILD rows) + Member_emergency_contact
///   aviation -> Member_aviation_detail + Member_license + Member_aircraft
///   clubs    -> Member_club_affiliation
///   signature-> Application_signature (role APPLICANT)
/// </summary>
public class SaveApplicantDetailsRequest
{
    public long ProfileId { get; set; }
    public FamilyDetailsDto? Family { get; set; }
    public AviationDetailsDto? Aviation { get; set; }
    public ClubAffiliationsDto? Clubs { get; set; }
    public WizardSignatureDto? Signature { get; set; }
    /// <summary>Declaration signature captured on the consent step (role DECLARANT).</summary>
    public WizardSignatureDto? DeclarationSignature { get; set; }
    /// <summary>Id of the uploaded copy of the pilot licence (Aplication_document row).</summary>
    public long? LicenseDocumentId { get; set; }
}

public class FamilyDetailsDto
{
    public bool IsMarried { get; set; }
    public string? SpouseName { get; set; }
    public string? SpousePhone { get; set; }
    public string? SpouseEmail { get; set; }
    public List<SpouseDto> Spouses { get; set; } = new();
    public bool HasChildren { get; set; }
    public List<ChildDto> Children { get; set; } = new();
    public string? EmergencyName { get; set; }
    public string? EmergencyPhone { get; set; }
    public string? EmergencyEmail { get; set; }
}

public class SpouseDto
{
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
}

public class ChildDto
{
    public string Name { get; set; } = string.Empty;
    public string? DateOfBirth { get; set; } // yyyy-MM-dd
}

public class AviationDetailsDto
{
    public bool IsAffiliated { get; set; }
    public string? AviationRole { get; set; }
    public bool HoldsLicense { get; set; }
    public string? LicenseType { get; set; }
    public string? LicenseNumber { get; set; }
    public string? LicenseIssuer { get; set; }
    public bool OwnsAircraft { get; set; }
    public string? AircraftType { get; set; }
    public string? AircraftRegistration { get; set; }
    public string? HangarLocation { get; set; }
}

public class ClubAffiliationsDto
{
    public bool MemberOfOtherClub { get; set; }
    public List<OtherClubDto> OtherClubs { get; set; } = new();
}

public class OtherClubDto
{
    public string Name { get; set; } = string.Empty;
}

public class WizardSignatureDto
{
    public string? Name { get; set; }
    public string? SignedAt { get; set; } // yyyy-MM-dd
}

/// <summary>Read model for GET /api/applications/{id}/details — everything the
/// wizard captured, re-joined against the lookup tables for display.</summary>
public class ApplicantDetailsDto
{
    public long ApplicationId { get; set; }
    public long ProfileId { get; set; }
    public string? MembershipNo { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? GenderName { get; set; }
    public string? BloodGroupName { get; set; }
    public string? MaritalStatusName { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? NationalityName { get; set; }
    public string? CountryOfResidenceName { get; set; }
    public string? PostalCountryName { get; set; }
    public string? PhotoUrl { get; set; }
    public string? Email { get; set; }
    public string? Mobile { get; set; }
    public List<DependantDto> Dependants { get; set; } = new();
    public List<EmergencyContactDto> EmergencyContacts { get; set; } = new();
    public AviationDetailDto? AviationDetail { get; set; }
    public List<MemberLicenseDto> Licenses { get; set; } = new();
    public List<MemberAircraftDto> Aircrafts { get; set; } = new();
    public List<ClubAffiliationDto> ClubAffiliations { get; set; } = new();
    public List<SignatureRecordDto> Signatures { get; set; } = new();
}

public class DependantDto
{
    public long DependantId { get; set; }
    public string RelationshipName { get; set; } = string.Empty;
    public string DependantName { get; set; } = string.Empty;
    public DateOnly? DependantDob { get; set; }
    public string? Telephone { get; set; }
    public string? Email { get; set; }
    public bool IsBelow18Flag { get; set; }
}

public class EmergencyContactDto
{
    public long MemberEmergencyContactId { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string RelationshipName { get; set; } = string.Empty;
    public string? Telephone { get; set; }
    public string? Email { get; set; }
    public bool IsPrimaryFlag { get; set; }
}

public class AviationDetailDto
{
    public long MemberAviationDetailId { get; set; }
    public bool IsAviationAffiliated { get; set; }
    public string? AviationRole { get; set; }
    public bool HoldsPilotLicenceFlag { get; set; }
    public bool OwnsAircraftFlag { get; set; }
}

public class MemberLicenseDto
{
    public long MemberLicenseId { get; set; }
    public string LicenseTypeName { get; set; } = string.Empty;
    public string LicenseNumber { get; set; } = string.Empty;
    public string? Issuer { get; set; }
    public bool IsActive { get; set; }
}

public class MemberAircraftDto
{
    public long MemberAircraftId { get; set; }
    public string AircraftTypeName { get; set; } = string.Empty;
    public string RegistrationNumber { get; set; } = string.Empty;
    public string? HangarLocation { get; set; }
    public bool IsCoOwned { get; set; }
}

public class ClubAffiliationDto
{
    public long MemberClubAffiliationId { get; set; }
    public string ClubName { get; set; } = string.Empty;
    public string AffiliationTypeName { get; set; } = string.Empty;
    public DateOnly? StartDate { get; set; }
}

public class SignatureRecordDto
{
    public long ApplicationSignatureId { get; set; }
    public long ApplicationId { get; set; }
    public long SignatoryProfileId { get; set; }
    public string SignatoryRole { get; set; } = string.Empty;
    public DateTime? SignedAt { get; set; }
}
