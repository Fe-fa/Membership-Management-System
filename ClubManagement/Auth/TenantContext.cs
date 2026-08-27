using System.Security.Claims;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Auth;

public interface ITenantContext
{
    long? TenantId { get; }
    string? TenantCode { get; }
    bool IsResolved { get; }
    void Set(long tenantId, string code);
}

public sealed class TenantContext : ITenantContext
{
    public long? TenantId { get; private set; }
    public string? TenantCode { get; private set; }
    public bool IsResolved => TenantId.HasValue && TenantId.Value > 0;

    public void Set(long tenantId, string code)
    {
        TenantId = tenantId;
        TenantCode = code;
    }
}

/// <summary>
/// Resolves the current tenant from JWT (authenticated) or <c>X-Tenant-Code</c> (anonymous / login).
/// Defaults to ACEA so existing single-club deployments keep working.
/// </summary>
public sealed class TenantResolutionMiddleware
{
    public const string HeaderName = "X-Tenant-Code";
    public const string DefaultTenantCode = "ACEA";

    private readonly RequestDelegate _next;

    public TenantResolutionMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext http, ITenantContext tenant, ApplicationModuleDbContext db)
    {
        var code = http.User.FindFirstValue("tenantCode")
            ?? http.Request.Headers[HeaderName].FirstOrDefault()
            ?? DefaultTenantCode;
        code = code.Trim().ToUpperInvariant();

        var claimId = http.User.FindFirstValue("tenantId");
        if (long.TryParse(claimId, out var fromJwt) && fromJwt > 0)
        {
            tenant.Set(fromJwt, code);
            await _next(http);
            return;
        }

        var row = await db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.IsActive && t.Code == code, http.RequestAborted);
        if (row is null && !string.Equals(code, DefaultTenantCode, StringComparison.OrdinalIgnoreCase))
        {
            row = await db.Tenants.AsNoTracking().IgnoreQueryFilters()
                .FirstOrDefaultAsync(t => t.IsActive && t.Code == DefaultTenantCode, http.RequestAborted);
        }

        if (row is not null)
            tenant.Set(row.TenantId, row.Code);

        await _next(http);
    }
}

public static class TenantClaims
{
    public static long? TenantId(this ClaimsPrincipal user)
    {
        var raw = user.FindFirstValue("tenantId");
        return long.TryParse(raw, out var id) ? id : null;
    }

    public static string? TenantCode(this ClaimsPrincipal user) => user.FindFirstValue("tenantCode");
}
