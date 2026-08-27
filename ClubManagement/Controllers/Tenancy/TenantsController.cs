using ClubManagement.Auth;
using ClubManagement.DTOs.Tenancy;
using ClubManagement.Data.MembershipApplication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Controllers.Tenancy;

[ApiController]
[Route("api/tenants")]
public class TenantsController : ControllerBase
{
    private readonly ApplicationModuleDbContext _db;
    private readonly ITenantContext _tenant;

    public TenantsController(ApplicationModuleDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    /// <summary>Public branding for the current tenant (from X-Tenant-Code or JWT).</summary>
    [HttpGet("current")]
    [AllowAnonymous]
    public async Task<ActionResult<TenantPublicDto>> Current(CancellationToken cancellationToken)
    {
        var code = (_tenant.TenantCode ?? TenantResolutionMiddleware.DefaultTenantCode).Trim().ToUpperInvariant();
        var row = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.IsActive && t.Code == code, cancellationToken)
            ?? await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
                .FirstOrDefaultAsync(t => t.IsActive && t.Code == TenantResolutionMiddleware.DefaultTenantCode, cancellationToken);

        if (row is null) return NotFound();
        return Ok(new TenantPublicDto(
            row.TenantId,
            row.Code,
            row.Name,
            row.ShortName,
            row.ContactEmail,
            row.ContactPhone,
            row.AddressLine));
    }
}
