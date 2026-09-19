using ClubManagement.Auth;
using ClubManagement.Services.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Settings;

[ApiController]
[Route("api/apply")]
public class ApplyController : ControllerBase
{
    private readonly IClubSetupService _setup;
    private readonly ITenantContext _tenant;

    public ApplyController(IClubSetupService setup, ITenantContext tenant)
    {
        _setup = setup;
        _tenant = tenant;
    }

    [HttpGet("{slug}")]
    [AllowAnonymous]
    public async Task<ActionResult<ApplyCompanyContextDto>> BySlug(string slug, CancellationToken cancellationToken)
    {
        var context = await _setup.GetApplyContextBySlugAsync(slug, cancellationToken);
        return context is null
            ? NotFound(new { message = "That company link is invalid or no longer active." })
            : Ok(context);
    }

    [HttpGet("designations")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<ClubSetupDesignationDto>>> Designations(CancellationToken cancellationToken)
    {
        if (!_tenant.IsResolved) return BadRequest(new { message = "Company context is missing." });
        return Ok(await _setup.ListApplicantDesignationsAsync(_tenant.TenantId!.Value, cancellationToken));
    }
}
