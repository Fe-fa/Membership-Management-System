using System.Text.Json;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.MembershipAccount;
using ClubManagement.Entities;
using ClubManagement.Entities.Aviation;
using ClubManagement.Entities.Guests;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Settings;
using ClubManagement.Services.MembershipApplication;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.MembershipAccount;

public interface IMemberProfileService
{
    Task<MemberProfileDto?> GetAsync(long accountId, CancellationToken cancellationToken);
    Task<MemberProfileDto?> GetByProfileIdAsync(long profileId, CancellationToken cancellationToken);
    Task<MemberProfileDto?> UpdateAsync(long accountId, UpdateMemberProfileRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MemberAuditEntryDto>> GetAuditAsync(long accountId, CancellationToken cancellationToken);
}

public class MemberProfileService : IMemberProfileService
{
    private static readonly HashSet<string> VotingCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        "FULL", "COUNTRY", "OVERSEAS", "LIFE", "SENIOR", "SENIOR_LIFE"
    };
    private static readonly HashSet<string> NonVotingCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        "TEMPORARY", "HONORARY"
    };
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };

    private readonly ApplicationModuleDbContext _db;
    private readonly IMemberLifecycleService _lifecycle;

    public MemberProfileService(ApplicationModuleDbContext db, IMemberLifecycleService lifecycle)
    {
        _db = db;
        _lifecycle = lifecycle;
    }

    public async Task<MemberProfileDto?> GetAsync(long accountId, CancellationToken cancellationToken)
    {
        var account = await LoadAsync(accountId, cancellationToken);
        return account is null ? null : await MapAsync(account, cancellationToken);
    }

    public async Task<MemberProfileDto?> GetByProfileIdAsync(long profileId, CancellationToken cancellationToken)
    {
        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .OrderByDescending(a => a.IsActive)
            .Select(a => a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);
        return accountId == 0 ? null : await GetAsync(accountId, cancellationToken);
    }

    public async Task<MemberProfileDto?> UpdateAsync(long accountId, UpdateMemberProfileRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await LoadAsync(accountId, cancellationToken);
        if (account is null) return null;

        var profile = account.Profile;
        var before = Snapshot(account);
        var now = DateTime.UtcNow;
        var identity = request.Identity;
        var contact = request.Contact;

        profile.Title = EmptyToNull(identity.Title);
        profile.FirstName = identity.FirstName.Trim();
        profile.MiddleName = EmptyToNull(identity.MiddleName);
        profile.LastName = identity.LastName.Trim();
        profile.PhotoUrl = EmptyToNull(identity.PhotoUrl);
        profile.IdPassportNo = EmptyToNull(identity.IdPassportNo);
        profile.DateOfBirth = identity.DateOfBirth;
        profile.PlaceOfBirth = EmptyToNull(identity.PlaceOfBirth);
        profile.Occupation = EmptyToNull(identity.Occupation);
        profile.Company = EmptyToNull(identity.Company);
        profile.Role = EmptyToNull(identity.Role);
        profile.PostalAddress = EmptyToNull(contact.PostalAddress);
        profile.City = EmptyToNull(contact.City);
        profile.StateCountry = EmptyToNull(contact.StateCountry);
        profile.PostalCode = EmptyToNull(contact.PostalCode);
        profile.Email = EmptyToNull(contact.Email);
        profile.AltEmail = EmptyToNull(contact.AltEmail);
        profile.TelIntlPrefix = EmptyToNull(contact.TelIntlPrefix);
        profile.Mobile = EmptyToNull(contact.Mobile);
        profile.TelOther = EmptyToNull(contact.TelOther);
        profile.UpdatedByUserId = actorUserId;

        profile.GenderId = await OptionalGenderAsync(identity.Gender, cancellationToken);
        profile.BloodGroupId = await OptionalBloodAsync(identity.BloodGroup, cancellationToken);
        profile.MaritalStatusId = await OptionalMaritalAsync(identity.MaritalStatus, cancellationToken);
        profile.NationalityId = await OptionalCountryAsync(identity.Nationality, cancellationToken);
        profile.CountryOfResidenceId = await OptionalCountryAsync(contact.CountryOfResidence, cancellationToken);
        profile.CountryId = await OptionalCountryAsync(contact.Country, cancellationToken);

        if (!string.IsNullOrWhiteSpace(request.MembershipNo))
        {
            var membershipNo = request.MembershipNo.Trim();
            var taken = await _db.Accounts.AnyAsync(
                a => a.MembershipNo == membershipNo && a.AccountId != accountId && !a.IsDeleted,
                cancellationToken);
            if (taken)
                throw new InvalidOperationException("Membership number already exists.");
            account.MembershipNo = membershipNo;
            profile.MembershipNo = membershipNo;
        }

        if (request.JoinedDate.HasValue)
        {
            account.JoinedDate = request.JoinedDate;
            account.StartDate = request.JoinedDate;
        }

        if (request.Consent is not null)
        {
            profile.DataConsentGiven = request.Consent.PrivacyPolicyAccepted || request.Consent.DeclarationAccepted;
            if (request.Consent.PrivacyPolicyAccepted && profile.PrivacyPolicyAcceptedAt is null)
                profile.PrivacyPolicyAcceptedAt = now;
            if (!request.Consent.PrivacyPolicyAccepted)
                profile.PrivacyPolicyAcceptedAt = null;
        }

        var spouseType = await LookupResolver.ResolveRelationshipTypeAsync(_db, "SPOUSE", cancellationToken);
        var childType = await LookupResolver.ResolveRelationshipTypeAsync(_db, "CHILD", cancellationToken);
        var otherType = await LookupResolver.ResolveRelationshipTypeAsync(_db, "OTHER", cancellationToken);

        _db.Dependants.RemoveRange(await _db.Dependants.Where(d => d.ProfileId == profile.ProfileId).ToListAsync(cancellationToken));
        foreach (var spouse in request.Spouses.Where(s => !string.IsNullOrWhiteSpace(s.Name)))
            _db.Dependants.Add(MakeDependant(profile.ProfileId, spouseType!.RelationshipTypeId, spouse.Name, null, spouse.Phone, spouse.Email, actorUserId, now));
        foreach (var child in request.Children.Where(c => !string.IsNullOrWhiteSpace(c.Name)))
            _db.Dependants.Add(MakeDependant(profile.ProfileId, childType!.RelationshipTypeId, child.Name, child.DateOfBirth, null, null, actorUserId, now));

        _db.MemberEmergencyContacts.RemoveRange(await _db.MemberEmergencyContacts.Where(e => e.ProfileId == profile.ProfileId).ToListAsync(cancellationToken));
        var primarySet = false;
        foreach (var row in request.EmergencyContacts.Where(e => !string.IsNullOrWhiteSpace(e.Name)))
        {
            _db.MemberEmergencyContacts.Add(new MemberEmergencyContact
            {
                ProfileId = profile.ProfileId,
                ContactName = row.Name.Trim(),
                RelationshipTypeId = otherType!.RelationshipTypeId,
                Telephone = EmptyToNull(row.Phone),
                Email = EmptyToNull(row.Email),
                IsPrimaryFlag = row.IsPrimary || !primarySet,
                IsActive = true,
                CreatedAt = now,
                CreatedByUserId = actorUserId
            });
            primarySet = true;
        }

        var aviation = request.Aviation;
        _db.MemberAviationDetails.RemoveRange(await _db.MemberAviationDetails.Where(x => x.ProfileId == profile.ProfileId).ToListAsync(cancellationToken));
        _db.MemberAviationDetails.Add(new MemberAviationDetail
        {
            ProfileId = profile.ProfileId,
            IsAviationAffiliated = aviation.IsAffiliated,
            AviationRole = EmptyToNull(aviation.AviationRole),
            HoldsPilotLicenceFlag = aviation.HoldsLicense,
            OwnsAircraftFlag = aviation.OwnsAircraft,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        });

        _db.MemberLicenses.RemoveRange(await _db.MemberLicenses.Where(x => x.ProfileId == profile.ProfileId).ToListAsync(cancellationToken));
        if (aviation.HoldsLicense)
        {
            foreach (var license in aviation.Licenses.Where(l => !string.IsNullOrWhiteSpace(l.LicenseNumber)))
            {
                var type = await LookupResolver.ResolveLicenseTypeAsync(_db, license.LicenseType, cancellationToken)
                    ?? await LookupResolver.ResolveLicenseTypeAsync(_db, "OTHER", cancellationToken);
                _db.MemberLicenses.Add(new MemberLicense
                {
                    ProfileId = profile.ProfileId,
                    LicenseTypeId = type!.LicenseTypeId,
                    LicenseNumber = license.LicenseNumber.Trim(),
                    Issuer = EmptyToNull(license.Issuer),
                    IsActive = true,
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
            }
        }

        _db.MemberAircrafts.RemoveRange(await _db.MemberAircrafts.Where(x => x.ProfileId == profile.ProfileId).ToListAsync(cancellationToken));
        if (aviation.OwnsAircraft)
        {
            foreach (var aircraft in aviation.Aircraft.Where(a => !string.IsNullOrWhiteSpace(a.RegistrationNumber)))
            {
                var type = await LookupResolver.ResolveAircraftTypeAsync(_db, aircraft.AircraftType, cancellationToken)
                    ?? await LookupResolver.ResolveAircraftTypeAsync(_db, "OTHER", cancellationToken);
                _db.MemberAircrafts.Add(new MemberAircraft
                {
                    ProfileId = profile.ProfileId,
                    AircraftTypeId = type!.AircraftTypeId,
                    RegistrationNumber = aircraft.RegistrationNumber.Trim(),
                    CountryOfRegistration = EmptyToNull(aircraft.CountryOfRegistration),
                    HangarLocation = EmptyToNull(aircraft.HangarLocation),
                    IsCoOwned = false,
                    IsActive = true,
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
            }
        }

        if (request.Clubs is not null)
        {
            _db.MemberClubAffiliations.RemoveRange(
                await _db.MemberClubAffiliations.Where(x => x.ProfileId == profile.ProfileId).ToListAsync(cancellationToken));
            if (request.Clubs.MemberOfOtherClub)
            {
                var affiliationType = await LookupResolver.ResolveAffiliationTypeAsync(_db, "MEMBER", cancellationToken);
                foreach (var club in request.Clubs.OtherClubs.Where(c => !string.IsNullOrWhiteSpace(c.Name)))
                {
                    var clubRow = await LookupResolver.ResolveClubAsync(_db, club.Name, cancellationToken);
                    if (clubRow is null || affiliationType is null) continue;
                    _db.MemberClubAffiliations.Add(new MemberClubAffiliation
                    {
                        ProfileId = profile.ProfileId,
                        ClubId = clubRow.ClubId,
                        AffiliationTypeId = affiliationType.AffiliationTypeId,
                        IsActive = true,
                        CreatedAt = now,
                        CreatedByUserId = actorUserId
                    });
                }
            }
        }

        account.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);

        if (request.MembershipTypeId > 0 && request.MembershipTypeId != account.MembershipTypeId)
        {
            await _lifecycle.ChangeTypeAsync(
                accountId,
                new ChangeMemberTypeRequest(request.MembershipTypeId, request.ChangeReason ?? "Updated from member profile"),
                actorUserId,
                cancellationToken);
        }

        account = await LoadAsync(accountId, cancellationToken);
        if (account is null) return null;

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MAccount",
            RecordId = account.AccountId,
            Action = "UPDATE",
            OldValues = before,
            NewValues = Snapshot(account),
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return await MapAsync(account, cancellationToken);
    }

    public async Task<IReadOnlyList<MemberAuditEntryDto>> GetAuditAsync(long accountId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);
        if (account is null) return [];

        var logs = await _db.AuditLogs.AsNoTracking()
            .Where(l => (l.TableName == "MAccount" && l.RecordId == account.AccountId)
                        || (l.TableName == "MProfile" && l.RecordId == account.ProfileId))
            .OrderByDescending(l => l.ChangedAt)
            .Take(80)
            .ToListAsync(cancellationToken);

        var ids = logs.Where(l => l.ChangedByUserId.HasValue).Select(l => l.ChangedByUserId!.Value).Distinct().ToList();
        var users = await _db.UserAccounts.AsNoTracking()
            .Where(u => ids.Contains(u.UserAccountId))
            .ToDictionaryAsync(u => u.UserAccountId, u => u.Username, cancellationToken);

        var history = await _db.MemberStatusHistories.AsNoTracking()
            .Include(h => h.FromStatus)
            .Include(h => h.ToStatus)
            .Where(h => h.AccountId == accountId)
            .OrderByDescending(h => h.CreatedAt)
            .Take(40)
            .ToListAsync(cancellationToken);

        var entries = logs.Select(l => new MemberAuditEntryDto
        {
            At = l.ChangedAt,
            Action = l.Action,
            Source = l.TableName,
            Actor = l.ChangedByUserId is long id && users.TryGetValue(id, out var name) ? name : null,
            Summary = Trim($"{l.OldValues} → {l.NewValues}")
        }).ToList();

        entries.AddRange(history.Select(h => new MemberAuditEntryDto
        {
            At = h.CreatedAt,
            Action = "STATUS",
            Source = "MemberStatusHistory",
            Actor = null,
            Summary = $"{h.FromStatus?.Name ?? "—"} → {h.ToStatus.Name}{(string.IsNullOrWhiteSpace(h.Reason) ? "" : $" ({h.Reason})")}"
        }));

        return entries.OrderByDescending(e => e.At).Take(100).ToList();
    }

    private async Task<MAccount?> LoadAsync(long accountId, CancellationToken cancellationToken) =>
        await _db.Accounts
            .Include(a => a.Profile).ThenInclude(p => p.Gender)
            .Include(a => a.Profile).ThenInclude(p => p.BloodGroup)
            .Include(a => a.Profile).ThenInclude(p => p.MaritalStatus)
            .Include(a => a.Profile).ThenInclude(p => p.Nationality)
            .Include(a => a.Profile).ThenInclude(p => p.CountryOfResidence)
            .Include(a => a.Profile).ThenInclude(p => p.Country)
            .Include(a => a.Profile).ThenInclude(p => p.MDependants).ThenInclude(d => d.RelationshipType)
            .Include(a => a.Profile).ThenInclude(p => p.MemberEmergencyContacts)
            .Include(a => a.Profile).ThenInclude(p => p.MemberAviationDetails)
            .Include(a => a.Profile).ThenInclude(p => p.MemberLicenses).ThenInclude(l => l.LicenseType)
            .Include(a => a.Profile).ThenInclude(p => p.MemberAircrafts).ThenInclude(x => x.AircraftType)
            .Include(a => a.Profile).ThenInclude(p => p.MemberClubAffiliations).ThenInclude(c => c.Club)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .Include(a => a.Application).ThenInclude(app => app!.Proposer)
            .Include(a => a.Application).ThenInclude(app => app!.Seconder)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);

    private async Task<MemberProfileDto> MapAsync(MAccount account, CancellationToken cancellationToken)
    {
        var profile = account.Profile;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = AgeYears(profile.DateOfBirth, today);
        var years = AgeYears(account.JoinedDate ?? account.StartDate, today) ?? 0;
        var arrears = await _db.Arrearses.AsNoTracking()
            .Where(a => a.AccountId == account.AccountId && a.Status == "OPEN")
            .SumAsync(a => (decimal?)a.Amount, cancellationToken) ?? 0m;
        var inGoodStanding = account.IsActive
            && account.CurrentMemberStatus.IsActiveStatus
            && !account.CurrentMemberStatus.IsTerminal
            && arrears <= 0;
        var code = account.MembershipType.Code ?? "";
        var classAllowsVote = account.MembershipType.CanVote && VotingCodes.Contains(code) && !NonVotingCodes.Contains(code);
        var eligibleSeniorLife = years >= 50;
        var eligibleSenior = age >= 55 && years >= 25;
        var recommendedCode = eligibleSeniorLife ? "SENIOR_LIFE" : eligibleSenior ? "SENIOR" : null;
        MembershipType? recommended = null;
        if (recommendedCode is not null && !code.Equals(recommendedCode, StringComparison.OrdinalIgnoreCase))
            recommended = await _db.MembershipTypes.AsNoTracking().FirstOrDefaultAsync(t => t.Code == recommendedCode, cancellationToken);

        var docIds = profile.MemberLicenses.Where(l => l.LicenseDocumentId.HasValue).Select(l => l.LicenseDocumentId!.Value).Distinct().ToList();
        var docs = docIds.Count == 0
            ? new Dictionary<long, AplicationDocument>()
            : await _db.ApplicationDocuments.AsNoTracking()
                .Where(d => docIds.Contains(d.ApplicationDocumentId))
                .ToDictionaryAsync(d => d.ApplicationDocumentId, cancellationToken);

        var aviation = profile.MemberAviationDetails.OrderByDescending(x => x.MemberAviationDetailId).FirstOrDefault();

        return new MemberProfileDto
        {
            AccountId = account.AccountId,
            ProfileId = profile.ProfileId,
            ApplicationId = account.ApplicationId,
            MembershipNo = account.MembershipNo ?? "",
            FullName = FullName(profile),
            Status = account.CurrentMemberStatus.Name,
            StatusCode = account.CurrentMemberStatus.Code,
            IsActive = account.IsActive,
            JoinedDate = account.JoinedDate,
            StartDate = account.StartDate,
            OutstandingArrears = arrears,
            Identity = new MemberIdentityDto
            {
                Title = profile.Title,
                FirstName = profile.FirstName,
                MiddleName = profile.MiddleName,
                LastName = profile.LastName,
                PhotoUrl = profile.PhotoUrl,
                IdPassportNo = profile.IdPassportNo,
                Nationality = profile.Nationality?.CountryName,
                DateOfBirth = profile.DateOfBirth,
                PlaceOfBirth = profile.PlaceOfBirth,
                AgeYears = age,
                BloodGroup = profile.BloodGroup?.Code ?? profile.BloodGroup?.Name,
                Gender = profile.Gender?.Code ?? profile.Gender?.Name,
                MaritalStatus = profile.MaritalStatus?.Code ?? profile.MaritalStatus?.Name,
                Occupation = profile.Occupation,
                Company = profile.Company,
                Role = profile.Role
            },
            Contact = new MemberContactDto
            {
                PostalAddress = profile.PostalAddress,
                City = profile.City,
                StateCountry = profile.StateCountry,
                PostalCode = profile.PostalCode,
                Country = profile.Country?.CountryName,
                CountryOfResidence = profile.CountryOfResidence?.CountryName,
                Email = profile.Email,
                AltEmail = profile.AltEmail,
                TelIntlPrefix = profile.TelIntlPrefix,
                Mobile = profile.Mobile,
                TelOther = profile.TelOther
            },
            Spouses = profile.MDependants
                .Where(d => string.Equals(d.RelationshipType?.Code, "SPOUSE", StringComparison.OrdinalIgnoreCase))
                .Select(d => new MemberKinDto { DependantId = d.DependantId, Name = d.DependantName, Phone = d.Telephone, Email = d.Email })
                .ToList(),
            Children = profile.MDependants
                .Where(d => string.Equals(d.RelationshipType?.Code, "CHILD", StringComparison.OrdinalIgnoreCase))
                .Select(d =>
                {
                    var childAge = AgeYears(d.DependantDob, today);
                    return new MemberChildDto
                    {
                        DependantId = d.DependantId,
                        Name = d.DependantName,
                        DateOfBirth = d.DependantDob,
                        AgeYears = childAge,
                        RequiresOwnMembership = childAge >= 21,
                        Note = childAge >= 21
                            ? "Turned 21 — must take out a separate membership."
                            : childAge >= 18
                                ? "Independent membership is required at 21."
                                : null
                    };
                })
                .ToList(),
            EmergencyContacts = profile.MemberEmergencyContacts.Select(e => new MemberEmergencyDto
            {
                MemberEmergencyContactId = e.MemberEmergencyContactId,
                Name = e.ContactName,
                Phone = e.Telephone,
                Email = e.Email,
                IsPrimary = e.IsPrimaryFlag
            }).ToList(),
            Aviation = new MemberAviationDto
            {
                IsAffiliated = aviation?.IsAviationAffiliated ?? false,
                AviationRole = aviation?.AviationRole,
                HoldsLicense = aviation?.HoldsPilotLicenceFlag ?? profile.MemberLicenses.Any(),
                OwnsAircraft = aviation?.OwnsAircraftFlag ?? profile.MemberAircrafts.Any(),
                Licenses = profile.MemberLicenses.Select(l =>
                {
                    docs.TryGetValue(l.LicenseDocumentId ?? 0, out var doc);
                    return new MemberLicenseEditDto
                    {
                        MemberLicenseId = l.MemberLicenseId,
                        LicenseType = l.LicenseType?.Name,
                        LicenseNumber = l.LicenseNumber,
                        Issuer = l.Issuer,
                        CopyFileName = doc?.FileName,
                        CopyFileUrl = doc?.FileUrl
                    };
                }).ToList(),
                Aircraft = profile.MemberAircrafts.Select(a => new MemberAircraftEditDto
                {
                    MemberAircraftId = a.MemberAircraftId,
                    AircraftType = a.AircraftType?.Name,
                    CountryOfRegistration = a.CountryOfRegistration,
                    RegistrationNumber = a.RegistrationNumber,
                    HangarLocation = a.HangarLocation
                }).ToList()
            },
            Clubs = new MemberClubsDto
            {
                MemberOfOtherClub = profile.MemberClubAffiliations.Any(),
                OtherClubs = profile.MemberClubAffiliations
                    .Select(c => new MemberClubNameDto { Name = c.Club?.ClubName ?? "" })
                    .Where(c => !string.IsNullOrWhiteSpace(c.Name))
                    .ToList()
            },
            Consent = new MemberConsentDto
            {
                PrivacyPolicyAccepted = profile.PrivacyPolicyAcceptedAt is not null,
                DeclarationAccepted = profile.DataConsentGiven,
                DeclarationName = FullName(profile),
                DeclarationDate = profile.PrivacyPolicyAcceptedAt is DateTime accepted
                    ? DateOnly.FromDateTime(accepted)
                    : null
            },
            Governance = new MemberGovernanceDto
            {
                MembershipTypeId = account.MembershipTypeId,
                MembershipTypeCode = account.MembershipType.Code,
                MembershipTypeName = account.MembershipType.Name,
                ClassAllowsVote = classAllowsVote,
                InGoodStanding = inGoodStanding,
                EligibleToVote = classAllowsVote && inGoodStanding,
                VotingReason = classAllowsVote
                    ? inGoodStanding
                        ? "Full, Country, Overseas or Life class in good standing — eligible to vote."
                        : "Class can vote, but the member is not in good standing (inactive or arrears)."
                    : "Temporary and Honorary classes do not carry voting rights.",
                ContinuousMembershipYears = years,
                EligibleForSenior = eligibleSenior,
                EligibleForSeniorLife = eligibleSeniorLife,
                SubscriptionDiscountPercent = eligibleSenior || eligibleSeniorLife ? 50 : 0,
                RecommendedMembershipTypeCode = recommended?.Code,
                RecommendedMembershipTypeName = recommended?.Name,
                SeniorityReason = eligibleSeniorLife
                    ? "50 or more years of continuous membership — Senior Life."
                    : eligibleSenior
                        ? "Age 55+ with 25 or more years of continuous membership — Senior (50% subscription)."
                        : $"Age {age?.ToString() ?? "unknown"}; {years} continuous membership year(s).",
                Proposer = LinkOf(account.Application?.Proposer),
                Seconder = LinkOf(account.Application?.Seconder)
            }
        };
    }

    private async Task<long?> OptionalGenderAsync(string? value, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(value) ? null : (await LookupResolver.ResolveGenderAsync(_db, value, ct))?.GenderId;
    private async Task<long?> OptionalBloodAsync(string? value, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(value) ? null : (await LookupResolver.ResolveBloodGroupAsync(_db, value, ct))?.BloodGroupId;
    private async Task<long?> OptionalMaritalAsync(string? value, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(value) ? null : (await LookupResolver.ResolveMaritalStatusAsync(_db, value, ct))?.MaritalStatusId;
    private async Task<long?> OptionalCountryAsync(string? value, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(value) ? null : (await LookupResolver.ResolveCountryAsync(_db, value, ct))?.CountryId;

    private static MemberLinkDto? LinkOf(MProfile? profile) =>
        profile is null ? null : new MemberLinkDto { ProfileId = profile.ProfileId, FullName = FullName(profile), MembershipNo = profile.MembershipNo };

    private static string FullName(MProfile p) =>
        string.Join(" ", new[] { p.Title, p.FirstName, p.MiddleName, p.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));

    private static int? AgeYears(DateOnly? from, DateOnly today)
    {
        if (from is null) return null;
        var years = today.Year - from.Value.Year;
        if (today < from.Value.AddYears(years)) years--;
        return Math.Max(years, 0);
    }

    private static MDependant MakeDependant(long profileId, long relationshipTypeId, string name, DateOnly? dob, string? phone, string? email, long? actor, DateTime now) =>
        new()
        {
            ProfileId = profileId,
            RelationshipTypeId = relationshipTypeId,
            DependantName = name.Trim(),
            DependantDob = dob,
            Telephone = EmptyToNull(phone),
            Email = EmptyToNull(email),
            IsBelow18Flag = AgeYears(dob, DateOnly.FromDateTime(now)) < 18,
            IsActive = true,
            CreatedAt = now,
            CreatedByUserId = actor
        };

    private static string Snapshot(MAccount account) =>
        JsonSerializer.Serialize(new
        {
            account.MembershipNo,
            account.MembershipTypeId,
            account.Profile.FirstName,
            account.Profile.LastName,
            account.Profile.Email,
            account.Profile.Mobile,
            account.Profile.IdPassportNo,
            account.Profile.DateOfBirth
        }, JsonOptions);

    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string Trim(string value) => value.Length <= 400 ? value : value[..400] + "…";
}
