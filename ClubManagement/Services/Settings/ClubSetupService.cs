using System.Text.RegularExpressions;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Settings;

public record ClubSetupCountryDto(long Id, string CountryCode, string CountryName, string? CurrencyDescription);
public record ClubSetupCompanyDto(
    long Id,
    string? LogoUrl,
    string CompanyCode,
    string CompanyName,
    string? Slug,
    string? PayrollName,
    string? PostalAddress,
    string? PhysicalLocation,
    string? Town,
    string? PinNumber,
    long? CountryId,
    string? CountryName,
    string? CurrencyDescription);

public record ApplyCompanyContextDto(
    long CompanyId,
    string CompanyCode,
    string Slug,
    string CompanyName,
    string? LogoUrl,
    IReadOnlyList<ClubSetupCountryDto> Countries,
    IReadOnlyList<ClubSetupDesignationDto> Designations);
public record ClubSetupDesignationDto(
    long Id,
    string DesignationCode,
    string Description,
    bool IsActive,
    long? CompanyId,
    string? CompanyName,
    bool IsGlobal,
    bool IsProtected);

public record ClubSetupCountryRequest(string? CountryCode, string? CountryName, string? CurrencyDescription);
public record ClubSetupCompanyRequest(
    string? LogoUrl,
    string? CompanyCode,
    string? CompanyName,
    string? Slug,
    string? PayrollName,
    string? PostalAddress,
    string? PhysicalLocation,
    string? Town,
    string? PinNumber,
    long? CountryId);
public record ClubSetupDesignationRequest(string? DesignationCode, string? Description, bool? IsActive, long? CompanyId);

public interface IClubSetupService
{
    Task<IReadOnlyList<ClubSetupCountryDto>> ListCountriesAsync(CancellationToken cancellationToken);
    Task<ClubSetupCountryDto> SaveCountryAsync(long? id, ClubSetupCountryRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ClubSetupCompanyDto>> ListCompaniesAsync(CancellationToken cancellationToken);
    Task<ClubSetupCompanyDto> SaveCompanyAsync(long? id, ClubSetupCompanyRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task DeleteCompanyAsync(long id, CancellationToken cancellationToken);
    Task<IReadOnlyList<ClubSetupDesignationDto>> ListDesignationsAsync(CancellationToken cancellationToken);
    Task<ClubSetupDesignationDto> SaveDesignationAsync(long? id, ClubSetupDesignationRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task DeleteDesignationAsync(long id, CancellationToken cancellationToken);
    Task<ApplyCompanyContextDto?> GetApplyContextBySlugAsync(string slug, CancellationToken cancellationToken);
    Task<IReadOnlyList<ClubSetupDesignationDto>> ListApplicantDesignationsAsync(long companyId, CancellationToken cancellationToken);
}

public class ClubSetupService : IClubSetupService
{
    private static readonly HashSet<string> ProtectedRoleCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        "ADMIN", "APPLICANT", "MEMBER", "GENERAL_MANAGER", "TREASURER",
        "COMMITTEE_MEMBER", "CHAIRMAN", "RECEPTIONIST"
    };

    private readonly ApplicationModuleDbContext _db;
    private readonly ILookupAdminService _lookups;

    public ClubSetupService(ApplicationModuleDbContext db, ILookupAdminService lookups)
    {
        _db = db;
        _lookups = lookups;
    }

    public async Task<IReadOnlyList<ClubSetupCountryDto>> ListCountriesAsync(CancellationToken cancellationToken)
    {
        var rows = await _lookups.ListRowsAsync("countries", cancellationToken);
        return rows
            .OrderBy(x => x.Name)
            .Select(x => new ClubSetupCountryDto(x.Id, x.Code, x.Name, x.Description))
            .ToList();
    }

    public async Task<ClubSetupCountryDto> SaveCountryAsync(
        long? id,
        ClubSetupCountryRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var payload = new LookupUpsertRequest(
            request.CountryCode,
            request.CountryName,
            request.CurrencyDescription,
            null,
            true,
            null,
            null,
            null,
            null,
            null);
        var saved = id is > 0
            ? await _lookups.UpdateAsync("countries", id.Value, payload, actorUserId, cancellationToken)
            : await _lookups.CreateAsync("countries", payload, actorUserId, cancellationToken);
        return new ClubSetupCountryDto(saved.Id, saved.Code, saved.Name, saved.Description);
    }

    public async Task<IReadOnlyList<ClubSetupCompanyDto>> ListCompaniesAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .Where(t => t.IsActive)
            .OrderBy(t => t.Name)
            .ToListAsync(cancellationToken);
        var countries = await _db.Countries.AsNoTracking().ToDictionaryAsync(c => c.CountryId, cancellationToken);
        return rows.Select(t => ToCompany(t, countries)).ToList();
    }

    public async Task<ClubSetupCompanyDto> SaveCompanyAsync(
        long? id,
        ClubSetupCompanyRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var code = (request.CompanyCode ?? "").Trim().ToUpperInvariant();
        var name = (request.CompanyName ?? "").Trim();
        if (string.IsNullOrWhiteSpace(code)) throw new InvalidOperationException("Company code is required.");
        if (string.IsNullOrWhiteSpace(name)) throw new InvalidOperationException("Company name is required.");

        var taken = await _db.Tenants.IgnoreQueryFilters()
            .AnyAsync(t => t.Code == code && t.TenantId != (id ?? 0), cancellationToken);
        if (taken) throw new InvalidOperationException($"Company code '{code}' already exists.");

        Tenant entity;
        if (id is > 0)
        {
            entity = await _db.Tenants.IgnoreQueryFilters()
                .FirstOrDefaultAsync(t => t.TenantId == id.Value, cancellationToken)
                ?? throw new KeyNotFoundException("Company was not found.");
        }
        else
        {
            entity = new Tenant { CreatedAt = DateTime.UtcNow, IsActive = true };
            _db.Tenants.Add(entity);
        }

        var slug = NormalizeSlug(request.Slug) ?? NormalizeSlug(name) ?? code.ToLowerInvariant();
        var slugTaken = await _db.Tenants.IgnoreQueryFilters()
            .AnyAsync(t => t.Slug == slug && t.TenantId != (id ?? 0), cancellationToken);
        if (slugTaken) throw new InvalidOperationException($"Company slug '{slug}' already exists.");

        entity.Code = code;
        entity.Name = name;
        entity.Slug = slug;
        entity.ShortName = BlankToNull(request.PayrollName);
        entity.AddressLine = BlankToNull(request.PostalAddress);
        entity.PhysicalLocation = BlankToNull(request.PhysicalLocation);
        entity.Town = BlankToNull(request.Town);
        entity.PinNumber = BlankToNull(request.PinNumber);
        entity.CountryId = request.CountryId is > 0 ? request.CountryId : null;
        entity.LogoUrl = string.IsNullOrWhiteSpace(request.LogoUrl) ? entity.LogoUrl : request.LogoUrl.Trim();
        entity.IsActive = true;
        await _db.SaveChangesAsync(cancellationToken);
        var countries = await _db.Countries.AsNoTracking().ToDictionaryAsync(c => c.CountryId, cancellationToken);
        return ToCompany(entity, countries);
    }

    public async Task DeleteCompanyAsync(long id, CancellationToken cancellationToken)
    {
        var entity = await _db.Tenants.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TenantId == id, cancellationToken)
            ?? throw new KeyNotFoundException("Company was not found.");
        if (string.Equals(entity.Code, "ACEA", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The primary club company cannot be removed.");
        entity.IsActive = false;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static ClubSetupCompanyDto ToCompany(Tenant tenant, IReadOnlyDictionary<long, Country> countries)
    {
        countries.TryGetValue(tenant.CountryId ?? 0, out var country);
        return new(
            tenant.TenantId,
            tenant.LogoUrl,
            tenant.Code,
            tenant.Name,
            tenant.Slug,
            tenant.ShortName,
            tenant.AddressLine,
            tenant.PhysicalLocation,
            tenant.Town,
            tenant.PinNumber,
            tenant.CountryId,
            country?.CountryName,
            country?.Description);
    }

    public async Task<IReadOnlyList<ClubSetupDesignationDto>> ListDesignationsAsync(CancellationToken cancellationToken)
    {
        var companies = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .ToDictionaryAsync(t => t.TenantId, cancellationToken);
        var roles = await _db.SystemRoles.AsNoTracking()
            .OrderBy(r => r.TenantId.HasValue)
            .ThenBy(r => r.SortOrder)
            .ThenBy(r => r.Code)
            .ToListAsync(cancellationToken);
        return roles.Select(r => ToDesignation(r, companies)).ToList();
    }

    public async Task<ClubSetupDesignationDto> SaveDesignationAsync(
        long? id,
        ClubSetupDesignationRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var code = (request.DesignationCode ?? "").Trim().ToUpperInvariant();
        var description = (request.Description ?? "").Trim();
        if (string.IsNullOrWhiteSpace(code)) throw new InvalidOperationException("Designation code is required.");
        if (string.IsNullOrWhiteSpace(description)) throw new InvalidOperationException("Designation description is required.");

        long? companyId = request.CompanyId is > 0 ? request.CompanyId : null;
        if (companyId is long cid)
        {
            var companyExists = await _db.Tenants.IgnoreQueryFilters()
                .AnyAsync(t => t.TenantId == cid && t.IsActive, cancellationToken);
            if (!companyExists) throw new InvalidOperationException("Company was not found.");
        }

        var taken = await _db.SystemRoles.AnyAsync(
            r => r.Code == code && r.SystemRoleId != (id ?? 0) && r.TenantId == companyId,
            cancellationToken);
        if (taken) throw new InvalidOperationException($"Designation code '{code}' already exists for that company scope.");

        SystemRole entity;
        if (id is > 0)
        {
            entity = await _db.SystemRoles.FirstOrDefaultAsync(r => r.SystemRoleId == id.Value, cancellationToken)
                ?? throw new KeyNotFoundException("Designation was not found.");
            if (ProtectedRoleCodes.Contains(entity.Code) && entity.Code != code)
                throw new InvalidOperationException("Built-in designation codes cannot be renamed.");
            if (ProtectedRoleCodes.Contains(entity.Code) && companyId is not null)
                throw new InvalidOperationException("Built-in designations stay global.");
        }
        else
        {
            entity = new SystemRole { CreatedAt = DateTime.UtcNow, SortOrder = 100 };
            _db.SystemRoles.Add(entity);
        }

        entity.Code = code;
        entity.Name = description;
        entity.Description = description;
        entity.TenantId = companyId;
        entity.IsActive = request.IsActive ?? entity.IsActive;
        if (id is null or <= 0) entity.IsActive = request.IsActive ?? true;
        entity.UpdatedByUserId = actorUserId;
        if (id is null or <= 0) entity.CreatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);

        var companies = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .ToDictionaryAsync(t => t.TenantId, cancellationToken);
        return ToDesignation(entity, companies);
    }

    public async Task DeleteDesignationAsync(long id, CancellationToken cancellationToken)
    {
        var entity = await _db.SystemRoles
            .Include(r => r.UserRoles)
            .FirstOrDefaultAsync(r => r.SystemRoleId == id, cancellationToken)
            ?? throw new KeyNotFoundException("Designation was not found.");
        if (ProtectedRoleCodes.Contains(entity.Code) || entity.UserRoles.Count > 0)
        {
            entity.IsActive = false;
            await _db.SaveChangesAsync(cancellationToken);
            return;
        }

        _db.SystemRoles.Remove(entity);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static ClubSetupDesignationDto ToDesignation(SystemRole role, IReadOnlyDictionary<long, Tenant> companies)
    {
        companies.TryGetValue(role.TenantId ?? 0, out var company);
        return new ClubSetupDesignationDto(
            role.SystemRoleId,
            role.Code,
            role.Name,
            role.IsActive,
            role.TenantId,
            company?.Name,
            role.TenantId is null,
            ProtectedRoleCodes.Contains(role.Code));
    }

    public async Task<ApplyCompanyContextDto?> GetApplyContextBySlugAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = NormalizeSlug(slug);
        if (normalized is null) return null;
        var company = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .FirstOrDefaultAsync(t =>
                t.IsActive && (
                    (t.Slug != null && t.Slug.ToLower() == normalized) ||
                    t.Code.ToLower() == normalized),
                cancellationToken);
        if (company is null) return null;

        var countries = await ListCountriesAsync(cancellationToken);
        var designations = await ListApplicantDesignationsAsync(company.TenantId, cancellationToken);
        return new ApplyCompanyContextDto(
            company.TenantId,
            company.Code,
            company.Slug ?? normalized,
            company.Name,
            company.LogoUrl,
            countries,
            designations);
    }

    public async Task<IReadOnlyList<ClubSetupDesignationDto>> ListApplicantDesignationsAsync(
        long companyId,
        CancellationToken cancellationToken)
    {
        var companies = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .ToDictionaryAsync(t => t.TenantId, cancellationToken);
        var protectedCodes = ProtectedRoleCodes.ToArray();
        var roles = await _db.SystemRoles.AsNoTracking()
            .Where(r =>
                r.IsActive &&
                !protectedCodes.Contains(r.Code) &&
                (r.TenantId == null || r.TenantId == companyId))
            .OrderBy(r => r.SortOrder)
            .ThenBy(r => r.Name)
            .ToListAsync(cancellationToken);
        return roles.Select(r => ToDesignation(r, companies)).ToList();
    }

    private static string? NormalizeSlug(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var slug = Regex.Replace(value.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrWhiteSpace(slug) ? null : slug;
    }

    private static string? BlankToNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
