using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.MembershipApplication;
using ClubManagement.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.MembershipApplication;

public interface IProfileService
{
    Task<IReadOnlyList<ProfileListItemDto>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<ProfileDetailDto?> GetByIdAsync(long profileId, CancellationToken cancellationToken = default);
    Task<ProfileDetailDto> CreateAsync(CreateProfileRequest request, CancellationToken cancellationToken = default);
    Task<ProfileDetailDto?> UpdateAsync(long profileId, UpdateProfileRequest request, CancellationToken cancellationToken = default);
}

public class ProfileService : IProfileService
{
    private readonly ApplicationModuleDbContext _dbContext;

    public ProfileService(ApplicationModuleDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<ProfileListItemDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _dbContext.Profiles
            .AsNoTracking()
            .OrderBy(x => x.FirstName)
            .ThenBy(x => x.LastName)
            .Select(x => new ProfileListItemDto
            {
                ProfileId = x.ProfileId,
                MembershipNo = x.MembershipNo,
                FullName = string.Join(" ", new[] { x.Title, x.FirstName, x.MiddleName, x.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
                Email = x.Email,
                Mobile = x.Mobile,
                Occupation = x.Occupation,
                IsActive = x.IsActive
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<ProfileDetailDto?> GetByIdAsync(long profileId, CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.Profiles
            .AsNoTracking()
            .Include(x => x.Gender)
            .Include(x => x.BloodGroup)
            .Include(x => x.MaritalStatus)
            .Include(x => x.Nationality)
            .Include(x => x.CountryOfResidence)
            .Include(x => x.Country)
            .FirstOrDefaultAsync(x => x.ProfileId == profileId, cancellationToken);
        return entity is null ? null : Map(entity);
    }

    public async Task<ProfileDetailDto> CreateAsync(CreateProfileRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new MProfile
        {
            AccountTypeId = request.AccountTypeId,
            MembershipNo = request.MembershipNo,
            Title = request.Title,
            FirstName = request.FirstName,
            MiddleName = request.MiddleName,
            LastName = request.LastName,
            GenderId = (await LookupResolver.ResolveGenderAsync(_dbContext, request.GenderName, cancellationToken))?.GenderId
                       ?? request.GenderId,
            MaritalStatusId = (await LookupResolver.ResolveMaritalStatusAsync(_dbContext, request.MaritalStatusName, cancellationToken))?.MaritalStatusId
                       ?? request.MaritalStatusId,
            BloodGroupId = (await LookupResolver.ResolveBloodGroupAsync(_dbContext, request.BloodGroupName, cancellationToken))?.BloodGroupId
                       ?? request.BloodGroupId,
            DateOfBirth = request.DateOfBirth,
            PlaceOfBirth = request.PlaceOfBirth,
            NationalityId = (await LookupResolver.ResolveCountryAsync(_dbContext, request.NationalityName, cancellationToken))?.CountryId
                       ?? request.NationalityId,
            CountryOfResidenceId = (await LookupResolver.ResolveCountryAsync(_dbContext, request.CountryOfResidenceName, cancellationToken))?.CountryId
                       ?? request.CountryOfResidenceId,
            IdPassportNo = request.IdPassportNo,
            Occupation = request.Occupation,
            Company = request.Company,
            Role = request.Role,
            PostalAddress = request.PostalAddress,
            City = request.City,
            StateCountry = request.StateCountry,
            PostalCode = request.PostalCode,
            CountryId = (await LookupResolver.ResolveCountryAsync(_dbContext, request.CountryName, cancellationToken))?.CountryId
                       ?? request.CountryId,
            Email = request.Email,
            AltEmail = request.AltEmail,
            TelIntlPrefix = request.TelIntlPrefix,
            Mobile = request.Mobile,
            TelOther = request.TelOther,
            PhotoUrl = request.PhotoUrl,
            DataConsentGiven = request.DataConsentGiven,
            PrivacyPolicyAcceptedAt = request.PrivacyPolicyAcceptedAt,
            IsActive = request.IsActive,
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = request.CreatedByUserId
        };

        _dbContext.Profiles.Add(entity);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var created = await GetByIdAsync(entity.ProfileId, cancellationToken)
            ?? throw new InvalidOperationException("Profile could not be reloaded after creation.");
        return created;
    }

    public async Task<ProfileDetailDto?> UpdateAsync(long profileId, UpdateProfileRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.Profiles.FirstOrDefaultAsync(x => x.ProfileId == profileId, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        entity.AccountTypeId = request.AccountTypeId;
        entity.MembershipNo = request.MembershipNo;
        entity.Title = request.Title;
        entity.FirstName = request.FirstName;
        entity.MiddleName = request.MiddleName;
        entity.LastName = request.LastName;
        entity.GenderId = (await LookupResolver.ResolveGenderAsync(_dbContext, request.GenderName, cancellationToken))?.GenderId
                       ?? request.GenderId;
        entity.MaritalStatusId = (await LookupResolver.ResolveMaritalStatusAsync(_dbContext, request.MaritalStatusName, cancellationToken))?.MaritalStatusId
                       ?? request.MaritalStatusId;
        entity.BloodGroupId = (await LookupResolver.ResolveBloodGroupAsync(_dbContext, request.BloodGroupName, cancellationToken))?.BloodGroupId
                       ?? request.BloodGroupId;
        entity.DateOfBirth = request.DateOfBirth;
        entity.PlaceOfBirth = request.PlaceOfBirth;
        entity.NationalityId = (await LookupResolver.ResolveCountryAsync(_dbContext, request.NationalityName, cancellationToken))?.CountryId
                       ?? request.NationalityId;
        entity.CountryOfResidenceId = (await LookupResolver.ResolveCountryAsync(_dbContext, request.CountryOfResidenceName, cancellationToken))?.CountryId
                       ?? request.CountryOfResidenceId;
        entity.IdPassportNo = request.IdPassportNo;
        entity.Occupation = request.Occupation;
        entity.Company = request.Company;
        entity.Role = request.Role;
        entity.PostalAddress = request.PostalAddress;
        entity.City = request.City;
        entity.StateCountry = request.StateCountry;
        entity.PostalCode = request.PostalCode;
        entity.CountryId = (await LookupResolver.ResolveCountryAsync(_dbContext, request.CountryName, cancellationToken))?.CountryId
                       ?? request.CountryId;
        entity.Email = request.Email;
        entity.AltEmail = request.AltEmail;
        entity.TelIntlPrefix = request.TelIntlPrefix;
        entity.Mobile = request.Mobile;
        entity.TelOther = request.TelOther;
        entity.PhotoUrl = request.PhotoUrl;
        entity.DataConsentGiven = request.DataConsentGiven;
        entity.PrivacyPolicyAcceptedAt = request.PrivacyPolicyAcceptedAt;
        entity.IsActive = request.IsActive;
        entity.IsDeleted = request.IsDeleted;
        entity.UpdatedByUserId = request.UpdatedByUserId;

        await _dbContext.SaveChangesAsync(cancellationToken);

        return await GetByIdAsync(profileId, cancellationToken);
    }

    private static ProfileDetailDto Map(MProfile entity)
    {
        return new ProfileDetailDto
        {
            ProfileId = entity.ProfileId,
            AccountTypeId = entity.AccountTypeId,
            MembershipNo = entity.MembershipNo,
            Title = entity.Title,
            FirstName = entity.FirstName,
            MiddleName = entity.MiddleName,
            LastName = entity.LastName,
            GenderId = entity.GenderId,
            GenderName = entity.Gender?.Name,
            MaritalStatusId = entity.MaritalStatusId,
            MaritalStatusName = entity.MaritalStatus?.Name,
            BloodGroupId = entity.BloodGroupId,
            BloodGroupName = entity.BloodGroup?.Name,
            DateOfBirth = entity.DateOfBirth,
            PlaceOfBirth = entity.PlaceOfBirth,
            NationalityId = entity.NationalityId,
            NationalityName = entity.Nationality?.CountryName,
            CountryOfResidenceId = entity.CountryOfResidenceId,
            CountryOfResidenceName = entity.CountryOfResidence?.CountryName,
            IdPassportNo = entity.IdPassportNo,
            Occupation = entity.Occupation,
            Company = entity.Company,
            Role = entity.Role,
            PostalAddress = entity.PostalAddress,
            City = entity.City,
            StateCountry = entity.StateCountry,
            PostalCode = entity.PostalCode,
            CountryId = entity.CountryId,
            CountryName = entity.Country?.CountryName,
            Email = entity.Email,
            AltEmail = entity.AltEmail,
            TelIntlPrefix = entity.TelIntlPrefix,
            Mobile = entity.Mobile,
            TelOther = entity.TelOther,
            PhotoUrl = entity.PhotoUrl,
            DataConsentGiven = entity.DataConsentGiven,
            PrivacyPolicyAcceptedAt = entity.PrivacyPolicyAcceptedAt,
            IsActive = entity.IsActive,
            IsDeleted = entity.IsDeleted,
            CreatedAt = entity.CreatedAt,
            CreatedByUserId = entity.CreatedByUserId,
            UpdatedByUserId = entity.UpdatedByUserId
        };
    }
}
