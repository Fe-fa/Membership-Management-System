using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Lookups;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace ClubManagement.Services.MembershipApplication;


public static class LookupResolver
{
    public static string NormalizeCode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var code = value.Trim().ToUpperInvariant().Replace(' ', '_');
        code = Regex.Replace(code, "[^A-Z0-9_]", "_");
        return code.Length > 50 ? code[..50] : code;
    }

    public static async Task<Gender?> ResolveGenderAsync(ApplicationModuleDbContext db, string? value, CancellationToken ct = default)
        => await ResolveCodeTableAsync(
            db, db.Genders, value, "UNSPECIFIED", "Unspecified",
            g => g.Code, g => g.Name,
            (c, n) => new Gender { Code = c, Name = n, SortOrder = 0, IsActive = true, CreatedAt = DateTime.UtcNow },
            ct);

    public static async Task<BloodGroup?> ResolveBloodGroupAsync(ApplicationModuleDbContext db, string? value, CancellationToken ct = default)
        => await ResolveCodeTableAsync(
            db, db.BloodGroups, value, "UNKNOWN", "Unknown",
            b => b.Code, b => b.Name,
            (c, n) => new BloodGroup { Code = c, Name = n, SortOrder = 0, IsActive = true, CreatedAt = DateTime.UtcNow },
            ct);

    public static async Task<MaritalStatus?> ResolveMaritalStatusAsync(ApplicationModuleDbContext db, string? value, CancellationToken ct = default)
        => await ResolveCodeTableAsync(
            db, db.MaritalStatuses, value, "OTHER", "Other",
            m => m.Code, m => m.Name,
            (c, n) => new MaritalStatus { Code = c, Name = n, SortOrder = 0, IsActive = true, CreatedAt = DateTime.UtcNow },
            ct);

    public static async Task<LicenseType?> ResolveLicenseTypeAsync(ApplicationModuleDbContext db, string? value, CancellationToken ct = default)
        => await ResolveCodeTableAsync(
            db, db.LicenseTypes, value, "OTHER", "Other",
            l => l.Code, l => l.Name,
            (c, n) => new LicenseType { Code = c, Name = n, IsActive = true, CreatedAt = DateTime.UtcNow },
            ct);

    public static async Task<AircraftType?> ResolveAircraftTypeAsync(ApplicationModuleDbContext db, string? value, CancellationToken ct = default)
        => await ResolveCodeTableAsync(
            db, db.AircraftTypes, value, "OTHER", "Other",
            a => a.Code, a => a.Name,
            (c, n) => new AircraftType { Code = c, Name = n, SortOrder = 0, IsActive = true, CreatedAt = DateTime.UtcNow },
            ct);

    public static async Task<AffiliationType?> ResolveAffiliationTypeAsync(ApplicationModuleDbContext db, string? value, CancellationToken ct = default)
        => await ResolveCodeTableAsync(
            db, db.AffiliationTypes, value, "MEMBER", "Member",
            a => a.Code, a => a.Name,
            (c, n) => new AffiliationType { Code = c, Name = n, SortOrder = 0, IsActive = true, CreatedAt = DateTime.UtcNow },
            ct);

    public static async Task<RelationshipType?> ResolveRelationshipTypeAsync(ApplicationModuleDbContext db, string? value, CancellationToken ct = default)
        => await ResolveCodeTableAsync(
            db, db.RelationshipTypes, value, "OTHER", "Other",
            r => r.Code, r => r.Name,
            (c, n) => new RelationshipType { Code = c, Name = n, SortOrder = 0, IsActive = true, CreatedAt = DateTime.UtcNow },
            ct);


    public static async Task<Country?> ResolveCountryAsync(ApplicationModuleDbContext db, string? value, CancellationToken ct = default)
    {
        var raw = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        if (raw is null) return null;

        var rows = await db.Countries.AsNoTracking().ToListAsync(ct);

        var nameHit = rows.FirstOrDefault(c => string.Equals(c.CountryName, raw, StringComparison.OrdinalIgnoreCase));
        if (nameHit is not null) return nameHit;

        var norm = NormalizeCode(raw);
        if (Regex.IsMatch(norm, "^[A-Z]{2}$"))
        {
            var codeHit = rows.FirstOrDefault(c => string.Equals(c.CountryCode, norm, StringComparison.OrdinalIgnoreCase));
            if (codeHit is not null) return codeHit;
        }

        var baseCode = norm.Length >= 2 ? norm[..2] : "XX";
        var code = baseCode;
        var suffix = 1;
        while (rows.Any(c => string.Equals(c.CountryCode, code, StringComparison.OrdinalIgnoreCase)))
            code = $"{baseCode}{suffix++}";

        var created = new Country { CountryCode = code, CountryName = raw, SortOrder = 0, IsActive = true, CreatedAt = DateTime.UtcNow };
        db.Countries.Add(created);
        await db.SaveChangesAsync(ct);
        return created;
    }


    public static async Task<Club?> ResolveClubAsync(ApplicationModuleDbContext db, string clubName, CancellationToken ct = default)
    {
        clubName = clubName.Trim();
        var rows = await db.Clubs.AsNoTracking().ToListAsync(ct);
        var hit = rows.FirstOrDefault(c => string.Equals(c.ClubName, clubName, StringComparison.OrdinalIgnoreCase));
        if (hit is not null) return hit;

        var clubType = await ResolveCodeTableAsync(
            db, db.ClubTypes, "OTHER", "OTHER", "Other",
            c => c.Code, c => c.Name,
            (c, n) => new ClubType { Code = c, Name = n, SortOrder = 0, IsActive = true, CreatedAt = DateTime.UtcNow },
            ct);

        var created = new Club
        {
            ClubName = clubName,
            ClubTypeId = clubType!.ClubTypeId,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Clubs.Add(created);
        await db.SaveChangesAsync(ct);
        return created;
    }

    private static async Task<T?> ResolveCodeTableAsync<T>(
        ApplicationModuleDbContext db,
        DbSet<T> set,
        string? value,
        string defaultCode,
        string defaultName,
        Func<T, string> codeSelector,
        Func<T, string> nameSelector,
        Func<string, string, T> factory,
        CancellationToken ct) where T : class
    {
        var raw = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        var code = NormalizeCode(raw);
        if (code.Length == 0) code = defaultCode;
        var name = raw ?? defaultName;

        var rows = await set.AsNoTracking().ToListAsync(ct);
        var hit = rows.FirstOrDefault(r =>
            string.Equals(codeSelector(r), code, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(nameSelector(r), name, StringComparison.OrdinalIgnoreCase));
        if (hit is not null) return hit;

        var created = factory(code, name);
        set.Add(created);
        await db.SaveChangesAsync(ct); 
        return created;
    }
}