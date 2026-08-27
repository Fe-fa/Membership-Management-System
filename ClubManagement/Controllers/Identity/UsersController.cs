using ClubManagement.Auth;
using ClubManagement.DTOs.Identity;
using ClubManagement.Services.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Identity;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly IUserManagementService _users;
    public UsersController(IUserManagementService users) => _users = users;

    private bool CanManage() => User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN");

    [HttpGet]
    public async Task<ActionResult<UserListResponse>> List(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] string? role,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken cancellationToken = default)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _users.ListAsync(search, status, role, page, pageSize, cancellationToken));
    }

    [HttpGet("roles")]
    public async Task<ActionResult<IReadOnlyList<RoleOptionDto>>> Roles(CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _users.AssignableRolesAsync(cancellationToken));
    }

    [HttpGet("{userAccountId:long}")]
    public async Task<ActionResult<UserDetailDto>> Get(long userAccountId, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        var result = await _users.GetAsync(userAccountId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<CreateStaffUserResponse>> Create([FromBody] CreateStaffUserRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            var created = await _users.CreateAsync(request, User.UserId(), cancellationToken);
            return Ok(created);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("{userAccountId:long}")]
    public async Task<ActionResult<UserDetailDto>> Update(long userAccountId, [FromBody] UpdateUserRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            var result = await _users.UpdateAsync(userAccountId, request, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("{userAccountId:long}/role")]
    public async Task<ActionResult<UserDetailDto>> AssignRole(long userAccountId, [FromBody] AssignRolesRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            var codes = (request.RoleCodes ?? [])
                .Concat(string.IsNullOrWhiteSpace(request.RoleCode) ? [] : [request.RoleCode!])
                .ToList();
            var result = await _users.AssignRolesAsync(userAccountId, codes, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("{userAccountId:long}/roles")]
    public async Task<ActionResult<UserDetailDto>> AssignRoles(long userAccountId, [FromBody] AssignRolesRequest request, CancellationToken cancellationToken)
        => await AssignRole(userAccountId, request, cancellationToken);

    [HttpPut("{userAccountId:long}/status")]
    public async Task<ActionResult<UserDetailDto>> Status(long userAccountId, [FromBody] ChangeAccountStatusRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            var result = await _users.ChangeStatusAsync(userAccountId, request.Status, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{userAccountId:long}/password")]
    public async Task<ActionResult<UserDetailDto>> SetPassword(long userAccountId, [FromBody] SetUserPasswordRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            var result = await _users.SetPasswordAsync(userAccountId, request.Password, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{userAccountId:long}/reset-link")]
    public async Task<ActionResult<InviteResult>> ResetLink(long userAccountId, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            var result = await _users.SendResetLinkAsync(userAccountId, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpDelete("{userAccountId:long}")]
    public async Task<IActionResult> Delete(long userAccountId, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            await _users.DeleteAsync(userAccountId, User.UserId(), cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
