using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.MembershipApplication;
using ClubManagement.Entities;
using ClubManagement.Entities.Aviation;
using ClubManagement.Entities.Guests;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.MembershipApplication;

public interface IApplicantDetailsService
{
 
    Task<ApplicantDetailsDto?> SaveDetailsAsync(
        long applicationId,
        SaveApplicantDetailsRequest request,
        CancellationToken cancellationToken = default);
    Task<ApplicantDetailsDto?> GetDetailsAsync(long applicationId, CancellationToken cancellationToken = default);
}

public class ApplicantDetailsService : IApplicantDetailsService
{
    private readonly ApplicationModuleDbContext _db;

    public ApplicantDetailsService(ApplicationModuleDbContext dbContext)
    {
        _db = dbContext;
    }

    public async Task<ApplicantDetailsDto?> SaveDetailsAsync(
        long applicationId,
        SaveApplicantDetailsRequest request,
        CancellationToken cancellationToken = default)
    {
        var application = await _db.Applications
            .FirstOrDefaultAsync(x => x.ApplicationId == applicationId, cancellationToken);
        if (application is null || request.ProfileId <= 0)
            return null;

        var profileId = request.ProfileId;

        await using var tx = await _db.Database.BeginTransactionAsync(cancellationToken);

        // ---- 1. Remove previous rows so re-submit / retry never duplicates ----
        var oldDependants = await _db.Dependants.Where(x => x.ProfileId == profileId).ToListAsync(cancellationToken);
        _db.Dependants.RemoveRange(oldDependants);

        var oldEmergency = await _db.MemberEmergencyContacts.Where(x => x.ProfileId == profileId).ToListAsync(cancellationToken);
        _db.MemberEmergencyContacts.RemoveRange(oldEmergency);

        var oldAviation = await _db.MemberAviationDetails.Where(x => x.ProfileId == profileId).ToListAsync(cancellationToken);
        _db.MemberAviationDetails.RemoveRange(oldAviation);

        var oldLicenses = await _db.MemberLicenses.Where(x => x.ProfileId == profileId).ToListAsync(cancellationToken);
        _db.MemberLicenses.RemoveRange(oldLicenses);

        var oldAircraft = await _db.MemberAircrafts.Where(x => x.ProfileId == profileId).ToListAsync(cancellationToken);
        _db.MemberAircrafts.RemoveRange(oldAircraft);

        var oldAffiliations = await _db.MemberClubAffiliations.Where(x => x.ProfileId == profileId).ToListAsync(cancellationToken);
        _db.MemberClubAffiliations.RemoveRange(oldAffiliations);

        var oldSignatures = await _db.ApplicationSignatures
            .Where(x => x.ApplicationId == applicationId)
            .ToListAsync(cancellationToken);
        _db.ApplicationSignatures.RemoveRange(oldSignatures);

        await _db.SaveChangesAsync(cancellationToken);

        // ---- 2. Family: spouse + children -> MDependant, emergency -> Member_emergency_contact ----
        if (request.Family is not null)
        {
            var spouseRelationship = await LookupResolver.ResolveRelationshipTypeAsync(_db, "SPOUSE", cancellationToken);
            var childRelationship = await LookupResolver.ResolveRelationshipTypeAsync(_db, "CHILD", cancellationToken);
            var otherRelationship = await LookupResolver.ResolveRelationshipTypeAsync(_db, "OTHER", cancellationToken);

            if (request.Family.IsMarried)
            {
                var spouses = request.Family.Spouses
                    .Where(s => !string.IsNullOrWhiteSpace(s.Name))
                    .Select(s => (s.Name, s.Phone, s.Email))
                    .ToList();
                if (spouses.Count == 0 && !string.IsNullOrWhiteSpace(request.Family.SpouseName))
                {
                    spouses.Add((request.Family.SpouseName, request.Family.SpousePhone, request.Family.SpouseEmail));
                }

                foreach (var (name, phone, email) in spouses)
                {
                    _db.Dependants.Add(CreateDependant(profileId, spouseRelationship!.RelationshipTypeId,
                        name, null, phone, email));
                }
            }

            if (request.Family.HasChildren)
            {
                foreach (var child in request.Family.Children.Where(c => !string.IsNullOrWhiteSpace(c.Name)))
                {
                    _db.Dependants.Add(CreateDependant(profileId, childRelationship!.RelationshipTypeId,
                        child.Name, ParseDate(child.DateOfBirth), null, null));
                }
            }

            if (!string.IsNullOrWhiteSpace(request.Family.EmergencyName))
            {
                _db.MemberEmergencyContacts.Add(new MemberEmergencyContact
                {
                    ProfileId = profileId,
                    ContactName = request.Family.EmergencyName.Trim(),
                    RelationshipTypeId = otherRelationship!.RelationshipTypeId,
                    Telephone = NullIfEmpty(request.Family.EmergencyPhone),
                    Email = NullIfEmpty(request.Family.EmergencyEmail),
                    IsPrimaryFlag = true,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        // ---- 3. Aviation: Member_aviation_detail + Member_license + Member_aircraft ----
        if (request.Aviation is not null)
        {
            var aviation = request.Aviation;
            _db.MemberAviationDetails.Add(new MemberAviationDetail
            {
                ProfileId = profileId,
                IsAviationAffiliated = aviation.IsAffiliated,
                AviationRole = NullIfEmpty(aviation.AviationRole),
                HoldsPilotLicenceFlag = aviation.HoldsLicense,
                OwnsAircraftFlag = aviation.OwnsAircraft,
                CreatedAt = DateTime.UtcNow
            });

            if (aviation.HoldsLicense && !string.IsNullOrWhiteSpace(aviation.LicenseNumber))
            {
                var licenseType = await LookupResolver.ResolveLicenseTypeAsync(_db, aviation.LicenseType, cancellationToken)
                                  ?? await LookupResolver.ResolveLicenseTypeAsync(_db, "OTHER", cancellationToken);
                _db.MemberLicenses.Add(new MemberLicense
                {
                    ProfileId = profileId,
                    LicenseTypeId = licenseType!.LicenseTypeId,
                    LicenseNumber = aviation.LicenseNumber.Trim(),
                    Issuer = NullIfEmpty(aviation.LicenseIssuer),
                    LicenseDocumentId = request.LicenseDocumentId,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }

            if (aviation.OwnsAircraft && !string.IsNullOrWhiteSpace(aviation.AircraftRegistration))
            {
                var aircraftType = await LookupResolver.ResolveAircraftTypeAsync(_db, aviation.AircraftType, cancellationToken)
                                   ?? await LookupResolver.ResolveAircraftTypeAsync(_db, "OTHER", cancellationToken);
                _db.MemberAircrafts.Add(new MemberAircraft
                {
                    ProfileId = profileId,
                    AircraftTypeId = aircraftType!.AircraftTypeId,
                    RegistrationNumber = aviation.AircraftRegistration.Trim(),
                    HangarLocation = NullIfEmpty(aviation.HangarLocation),
                    IsCoOwned = false,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        // ---- 4. Other clubs -> Member_club_affiliation (Club rows created on demand) ----
        if (request.Clubs is not null && request.Clubs.MemberOfOtherClub)
        {
            var affiliationType = await LookupResolver.ResolveAffiliationTypeAsync(_db, "MEMBER", cancellationToken);
            foreach (var club in request.Clubs.OtherClubs.Where(c => !string.IsNullOrWhiteSpace(c.Name)))
            {
                var clubRow = await LookupResolver.ResolveClubAsync(_db, club.Name, cancellationToken);
                if (clubRow is null) continue;
                _db.MemberClubAffiliations.Add(new MemberClubAffiliation
                {
                    ProfileId = profileId,
                    ClubId = clubRow.ClubId,
                    AffiliationTypeId = affiliationType!.AffiliationTypeId,
                    StartDate = null,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        // ---- 5. Typed signatures -> Application_signature ----------------
        // Roles: APPLICANT (membership step) and DECLARANT (consent step).
        // NOTE: the DDL has no column for the typed signature text itself; the
        // wizard keeps it in MApplication.form_data_json. The relational rows
        // record who signed, in which role and when.
        AddSignatureIfPresent(applicationId, profileId, "APPLICANT", request.Signature);
        AddSignatureIfPresent(applicationId, profileId, "DECLARANT", request.DeclarationSignature);

        await _db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);

        return await GetDetailsAsync(applicationId, cancellationToken);
    }

    public async Task<ApplicantDetailsDto?> GetDetailsAsync(long applicationId, CancellationToken cancellationToken = default)
    {
        var application = await _db.Applications
            .AsNoTracking()
            .Include(x => x.Applicant)
                .ThenInclude(x => x.Gender)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.BloodGroup)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.MaritalStatus)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.Nationality)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.CountryOfResidence)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.Country)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.MDependants)
                    .ThenInclude(d => d.RelationshipType)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.MemberEmergencyContacts)
                    .ThenInclude(e => e.RelationshipType)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.MemberAviationDetails)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.MemberLicenses)
                    .ThenInclude(l => l.LicenseType)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.MemberAircrafts)
                    .ThenInclude(a => a.AircraftType)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.MemberClubAffiliations)
                    .ThenInclude(c => c.Club)
            .Include(x => x.Applicant)
                .ThenInclude(x => x.MemberClubAffiliations)
                    .ThenInclude(c => c.AffiliationType)
            .Include(x => x.ApplicationSignatures)
            .FirstOrDefaultAsync(x => x.ApplicationId == applicationId, cancellationToken);

        if (application?.Applicant is null)
            return null;

        var p = application.Applicant;
        return new ApplicantDetailsDto
        {
            ApplicationId = application.ApplicationId,
            ProfileId = p.ProfileId,
            MembershipNo = p.MembershipNo,
            FullName = string.Join(" ", new[] { p.Title, p.FirstName, p.MiddleName, p.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
            GenderName = p.Gender?.Name,
            BloodGroupName = p.BloodGroup?.Name,
            MaritalStatusName = p.MaritalStatus?.Name,
            DateOfBirth = p.DateOfBirth,
            NationalityName = p.Nationality?.CountryName,
            CountryOfResidenceName = p.CountryOfResidence?.CountryName,
            PostalCountryName = p.Country?.CountryName,
            PhotoUrl = p.PhotoUrl,
            Email = p.Email,
            Mobile = p.Mobile,
            Dependants = p.MDependants.OrderBy(d => d.DependantId).Select(d => new DependantDto
            {
                DependantId = d.DependantId,
                RelationshipName = d.RelationshipType?.Name ?? string.Empty,
                DependantName = d.DependantName,
                DependantDob = d.DependantDob,
                Telephone = d.Telephone,
                Email = d.Email,
                IsBelow18Flag = d.IsBelow18Flag
            }).ToList(),
            EmergencyContacts = p.MemberEmergencyContacts.Select(e => new EmergencyContactDto
            {
                MemberEmergencyContactId = e.MemberEmergencyContactId,
                ContactName = e.ContactName,
                RelationshipName = e.RelationshipType?.Name ?? string.Empty,
                Telephone = e.Telephone,
                Email = e.Email,
                IsPrimaryFlag = e.IsPrimaryFlag
            }).ToList(),
            AviationDetail = p.MemberAviationDetails.Select(a => new AviationDetailDto
            {
                MemberAviationDetailId = a.MemberAviationDetailId,
                IsAviationAffiliated = a.IsAviationAffiliated,
                AviationRole = a.AviationRole,
                HoldsPilotLicenceFlag = a.HoldsPilotLicenceFlag,
                OwnsAircraftFlag = a.OwnsAircraftFlag
            }).FirstOrDefault(),
            Licenses = p.MemberLicenses.Select(l => new MemberLicenseDto
            {
                MemberLicenseId = l.MemberLicenseId,
                LicenseTypeName = l.LicenseType?.Name ?? string.Empty,
                LicenseNumber = l.LicenseNumber,
                Issuer = l.Issuer,
                IsActive = l.IsActive
            }).ToList(),
            Aircrafts = p.MemberAircrafts.Select(a => new MemberAircraftDto
            {
                MemberAircraftId = a.MemberAircraftId,
                AircraftTypeName = a.AircraftType?.Name ?? string.Empty,
                RegistrationNumber = a.RegistrationNumber,
                HangarLocation = a.HangarLocation,
                IsCoOwned = a.IsCoOwned
            }).ToList(),
            ClubAffiliations = p.MemberClubAffiliations.Select(c => new ClubAffiliationDto
            {
                MemberClubAffiliationId = c.MemberClubAffiliationId,
                ClubName = c.Club?.ClubName ?? string.Empty,
                AffiliationTypeName = c.AffiliationType?.Name ?? string.Empty,
                StartDate = c.StartDate
            }).ToList(),
            Signatures = application.ApplicationSignatures.OrderBy(s => s.ApplicationSignatureId).Select(s => new SignatureRecordDto
            {
                ApplicationSignatureId = s.ApplicationSignatureId,
                ApplicationId = s.ApplicationId,
                SignatoryProfileId = s.SignatoryProfileId,
                SignatoryRole = s.SignatoryRole,
                SignedAt = s.SignedAt
            }).ToList()
        };
    }

    private void AddSignatureIfPresent(long applicationId, long profileId, string role, WizardSignatureDto? signature)
    {
        if (signature is null ||
            (string.IsNullOrWhiteSpace(signature.Name) && string.IsNullOrWhiteSpace(signature.SignedAt)))
        {
            return;
        }

        _db.ApplicationSignatures.Add(new ApplicationSignature
        {
            ApplicationId = applicationId,
            SignatoryProfileId = profileId,
            SignatoryRole = role,
            SignatureImageUrl = null,
            SignedAt = ParseDateTime(signature.SignedAt) ?? DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        });
    }

    private static MDependant CreateDependant(long profileId, long relationshipTypeId, string name, DateOnly? dob, string? telephone, string? email)
    {
        var isBelow18 = dob.HasValue && (DateOnly.FromDateTime(DateTime.UtcNow).Year - dob.Value.Year) < 18;
        return new MDependant
        {
            ProfileId = profileId,
            RelationshipTypeId = relationshipTypeId,
            DependantName = name.Trim(),
            DependantDob = dob,
            Telephone = NullIfEmpty(telephone),
            Email = NullIfEmpty(email),
            IsBelow18Flag = isBelow18,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
    }

    private static string? NullIfEmpty(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static DateOnly? ParseDate(string? value)
        => DateOnly.TryParse(value, out var result) ? result : null;

    private static DateTime? ParseDateTime(string? value)
        => DateTime.TryParse(value, out var result) ? result : null;
}
