using System.Net.Mail;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Finance;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Finance;

public record CorporateCompanyDto(
    long CorporateCompanyId,
    string Code,
    string Name,
    string Email,
    string? Phone,
    string? KraPin,
    bool IsActive);

public record SaveCorporateCompanyRequest(
    string Code,
    string Name,
    string Email,
    string? Phone,
    string? KraPin);

public interface ICorporateCompanyService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<CorporateCompanyDto>> ListAsync(bool activeOnly, CancellationToken cancellationToken);
    Task<CorporateCompanyDto> CreateAsync(SaveCorporateCompanyRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<CorporateCompanyDto> UpdateAsync(long companyId, SaveCorporateCompanyRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<CorporateCompanyDto> SetActiveAsync(long companyId, bool active, long? actorUserId, CancellationToken cancellationToken);
}

public class CorporateCompanyService : ICorporateCompanyService
{
    private readonly ApplicationModuleDbContext _db;
    private static int _schemaReady;

    public CorporateCompanyService(ApplicationModuleDbContext db) => _db = db;

    public async Task<IReadOnlyList<CorporateCompanyDto>> ListAsync(bool activeOnly, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var query = _db.CorporateCompanies.AsNoTracking();
        if (activeOnly) query = query.Where(c => c.IsActive);
        var rows = await query
            .OrderBy(c => c.Name)
            .ThenBy(c => c.Code)
            .ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
    }

    public async Task<CorporateCompanyDto> CreateAsync(
        SaveCorporateCompanyRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var draft = Validate(request);
        var taken = await _db.CorporateCompanies.AnyAsync(
            c => c.Code == draft.Code, cancellationToken);
        if (taken)
            throw new InvalidOperationException($"Company code {draft.Code} is already in use.");

        var row = new CorporateCompany
        {
            Code = draft.Code,
            Name = draft.Name,
            Email = draft.Email,
            Phone = draft.Phone,
            KraPin = draft.KraPin,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.CorporateCompanies.Add(row);
        await _db.SaveChangesAsync(cancellationToken);
        return Map(row);
    }

    public async Task<CorporateCompanyDto> UpdateAsync(
        long companyId,
        SaveCorporateCompanyRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var row = await _db.CorporateCompanies.FirstOrDefaultAsync(c => c.CorporateCompanyId == companyId, cancellationToken)
            ?? throw new InvalidOperationException("Corporate company was not found.");
        var draft = Validate(request);
        var taken = await _db.CorporateCompanies.AnyAsync(
            c => c.Code == draft.Code && c.CorporateCompanyId != companyId, cancellationToken);
        if (taken)
            throw new InvalidOperationException($"Company code {draft.Code} is already in use.");

        row.Code = draft.Code;
        row.Name = draft.Name;
        row.Email = draft.Email;
        row.Phone = draft.Phone;
        row.KraPin = draft.KraPin;
        row.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return Map(row);
    }

    public async Task<CorporateCompanyDto> SetActiveAsync(
        long companyId,
        bool active,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var row = await _db.CorporateCompanies.FirstOrDefaultAsync(c => c.CorporateCompanyId == companyId, cancellationToken)
            ?? throw new InvalidOperationException("Corporate company was not found.");
        row.IsActive = active;
        row.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return Map(row);
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        if (Volatile.Read(ref _schemaReady) == 1) return;
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Corporate_company', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Corporate_company (
        corporate_company_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Corporate_company PRIMARY KEY,
        tenant_id BIGINT NOT NULL CONSTRAINT DF_Corporate_company_tenant DEFAULT (1),
        code NVARCHAR(40) NOT NULL,
        name NVARCHAR(200) NOT NULL,
        email NVARCHAR(200) NOT NULL,
        phone NVARCHAR(40) NULL,
        kra_pin NVARCHAR(20) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_Corporate_company_active DEFAULT (1),
        created_at DATETIME2 NOT NULL,
        created_by_user_id BIGINT NULL,
        updated_by_user_id BIGINT NULL
    );
END
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_Corporate_company_tenant_code' AND object_id = OBJECT_ID(N'dbo.Corporate_company'))
    CREATE UNIQUE INDEX UX_Corporate_company_tenant_code ON dbo.Corporate_company(tenant_id, code);
IF COL_LENGTH(N'dbo.MAccount', N'invoice_to') IS NULL
    ALTER TABLE dbo.MAccount ADD invoice_to NVARCHAR(20) NOT NULL CONSTRAINT DF_MAccount_invoice_to DEFAULT (N'INDIVIDUAL');
IF COL_LENGTH(N'dbo.MAccount', N'corporate_company_id') IS NULL
    ALTER TABLE dbo.MAccount ADD corporate_company_id BIGINT NULL;", cancellationToken);
        Volatile.Write(ref _schemaReady, 1);
    }

    private static CorporateCompany Validate(SaveCorporateCompanyRequest request)
    {
        var code = (request.Code ?? "").Trim().ToUpperInvariant();
        if (code.Length < 2 || code.Length > 40 || !code.All(c => char.IsLetterOrDigit(c) || c == '-'))
            throw new InvalidOperationException("Company code must be 2–40 letters, numbers, or hyphens.");
        var name = (request.Name ?? "").Trim();
        if (name.Length < 2)
            throw new InvalidOperationException("Company name is required.");
        var email = (request.Email ?? "").Trim();
        if (!IsEmail(email))
            throw new InvalidOperationException("Enter a valid corporate billing email.");
        var phone = NullIfBlank(request.Phone);
        if (phone is { Length: > 40 })
            throw new InvalidOperationException("Phone number must be 40 characters or fewer.");
        var pin = NullIfBlank(request.KraPin)?.ToUpperInvariant();
        if (pin is not null && (pin.Length < 8 || pin.Length > 20))
            throw new InvalidOperationException("KRA PIN must be between 8 and 20 characters.");
        return new CorporateCompany
        {
            Code = code,
            Name = name,
            Email = email,
            Phone = phone,
            KraPin = pin
        };
    }

    private static bool IsEmail(string value)
    {
        try { return new MailAddress(value).Address.Equals(value, StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }

    private static string? NullIfBlank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static CorporateCompanyDto Map(CorporateCompany row) =>
        new(row.CorporateCompanyId, row.Code, row.Name, row.Email, row.Phone, row.KraPin, row.IsActive);
}
