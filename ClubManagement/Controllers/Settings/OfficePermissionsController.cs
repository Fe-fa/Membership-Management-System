using ClubManagement.Auth;
using ClubManagement.DTOs.Settings;
using ClubManagement.Services.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Settings;

[ApiController]
[Route("api/settings/office-permissions")]
[Authorize]
public class OfficePermissionsController : ControllerBase
{
    private readonly IOfficePermissionService _permissions;

    public OfficePermissionsController(IOfficePermissionService permissions) => _permissions = permissions;

    private bool CanManage() => User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN");

    [HttpGet]
    public async Task<ActionResult<OfficePermissionMatrixDto>> Get(CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _permissions.GetMatrixAsync(cancellationToken));
    }

    /// <summary>Any authenticated staff can read their effective matrix for dashboard card filtering.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<OfficePermissionMatrixDto>> GetForMe(CancellationToken cancellationToken)
    {
        if (!User.HasAnyRole(
                "ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "TREASURER", "COMMITTEE_MEMBER", "RECEPTIONIST", "MEMBER"))
            return Forbid();
        return Ok(await _permissions.GetMatrixAsync(cancellationToken));
    }

    [HttpPut]
    public async Task<ActionResult<OfficePermissionMatrixDto>> Save(
        [FromBody] SaveOfficePermissionMatrixRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            return Ok(await _permissions.SaveMatrixAsync(request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
