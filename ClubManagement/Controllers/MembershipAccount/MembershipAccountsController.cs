using ClubManagement.Auth;
using ClubManagement.DTOs.Common;
using ClubManagement.DTOs.MembershipAccount;
using ClubManagement.Services.MembershipAccount;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.MembershipAccount;

[ApiController]
[Route("api/membership-accounts")]
[Authorize]
public class MembershipAccountsController : ControllerBase
{
    private readonly IMemberLifecycleService _members;
    private readonly IMemberProfileService _profiles;

    public MembershipAccountsController(IMemberLifecycleService members, IMemberProfileService profiles)
    {
        _members = members;
        _profiles = profiles;
    }

    [HttpGet("{accountId:long}")]
    public async Task<ActionResult<MemberProfileDto>> Get(long accountId, CancellationToken cancellationToken)
    {
        var profile = await _profiles.GetAsync(accountId, cancellationToken);
        return profile is null ? NotFound() : Ok(profile);
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,CHAIRMAN,TREASURER,COMMITTEE_MEMBER")]
    [HttpPut("{accountId:long}")]
    public async Task<ActionResult<MemberProfileDto>> Update(long accountId, [FromBody] UpdateMemberProfileRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var updated = await _profiles.UpdateAsync(accountId, request, User.UserId(), cancellationToken);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{accountId:long}/audit")]
    public async Task<ActionResult<IReadOnlyList<MemberAuditEntryDto>>> Audit(long accountId, CancellationToken cancellationToken)
    {
        var account = await _profiles.GetAsync(accountId, cancellationToken);
        if (account is null) return NotFound();
        return Ok(await _profiles.GetAuditAsync(accountId, cancellationToken));
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<MemberListItemDto>>> Search(
        [FromQuery] PagedRequest paging,
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] string? type,
        CancellationToken cancellationToken) =>
        Ok(await _members.SearchAsync(search, status, type, paging, cancellationToken));

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN")]
    [HttpPost("register-existing")]
    public async Task<ActionResult<RegisterExistingMemberResult>> Register([FromBody] RegisterExistingMemberRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var created = await _members.RegisterExistingAsync(request, User.UserId(), cancellationToken);
            return Created(string.Empty, created);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN")]
    [HttpPost("{accountId:long}/portal-invite")]
    public async Task<ActionResult<RegisterExistingMemberResult>> PortalInvite(long accountId, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _members.IssuePortalInviteAsync(accountId, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN,COMMITTEE_MEMBER")]
    [HttpPost("{accountId:long}/status")]
    public async Task<ActionResult<MemberListItemDto>> ChangeStatus(long accountId, [FromBody] ChangeMemberStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await _members.ChangeStatusAsync(accountId, request, User.UserId(), cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN,COMMITTEE_MEMBER")]
    [HttpPost("{accountId:long}/deactivate")]
    public async Task<ActionResult<MemberListItemDto>> Deactivate(long accountId, CancellationToken cancellationToken)
    {
        var result = await _members.DeactivateAsync(accountId, "Deactivated from member desk", User.UserId(), cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN,ADMIN")]
    [HttpDelete("{accountId:long}")]
    public async Task<IActionResult> Delete(long accountId, CancellationToken cancellationToken)
    {
        var removed = await _members.SoftDeleteAsync(accountId, User.UserId(), cancellationToken);
        return removed ? NoContent() : NotFound();
    }

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN")]
    [HttpPost("{accountId:long}/type")]
    public async Task<ActionResult<MemberListItemDto>> ChangeType(long accountId, [FromBody] ChangeMemberTypeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _members.ChangeTypeAsync(accountId, request, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "CHAIRMAN,ADMIN")]
    [HttpPost("/api/applications/{applicationId:long}/elect")]
    public async Task<ActionResult<MemberListItemDto>> Elect(long applicationId, [FromBody] ElectRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var elected = await _members.ElectFromApplicationAsync(
                applicationId,
                User.UserId(),
                request.DateElected,
                request.MembershipNumber,
                request.ElectedMembershipType,
                cancellationToken);
            return elected is null ? NotFound() : Ok(elected);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}

public record ElectRequest(DateOnly DateElected, string MembershipNumber, string ElectedMembershipType);
