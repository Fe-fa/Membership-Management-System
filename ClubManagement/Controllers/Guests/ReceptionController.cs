using ClubManagement.Auth;
using ClubManagement.DTOs.Common;
using ClubManagement.Services.Guests;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Guests;

[ApiController]
[Route("api/reception")]
[Authorize(Roles = "ADMIN,GENERAL_MANAGER,CHAIRMAN,RECEPTIONIST")]
public class ReceptionController : ControllerBase
{
    private readonly IGuestService _guests;
    public ReceptionController(IGuestService guests) => _guests = guests;

    [HttpGet("members")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<ActionResult<IReadOnlyList<ReceptionMemberDto>>> Members(CancellationToken cancellationToken) =>
        Ok(await _guests.ListActiveHostsAsync(cancellationToken));

    [HttpGet("guests")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<ActionResult<IReadOnlyList<GuestLookupDto>>> Search(
        [FromQuery] string? name,
        [FromQuery] string? phone,
        [FromQuery] string? visitSlipCode,
        CancellationToken cancellationToken) =>
        Ok(await _guests.SearchGuestsAsync(name, phone, visitSlipCode, cancellationToken));

    [HttpPost("guests")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<ActionResult<GuestLookupDto>> Upsert([FromBody] UpsertGuestRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _guests.UpsertGuestAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("visits")]
    public async Task<ActionResult<PagedResult<ReceptionVisitDto>>> Visits(
        [FromQuery] PagedRequest paging,
        CancellationToken cancellationToken) =>
        Ok(await _guests.ListReceptionVisitsAsync(paging, cancellationToken));

    [HttpPost("visits")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<ActionResult<ReceptionVisitDto>> SignIn([FromBody] ReceptionVisitRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _guests.ReceptionSignInAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("visits/{visitId:long}/sign-out")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<ActionResult<ReceptionVisitDto>> SignOut(long visitId, CancellationToken cancellationToken)
    {
        try { return Ok(await _guests.ReceptionSignOutAsync(visitId, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}

[ApiController]
[Route("api/guests")]
public class GuestRegistrationController : ControllerBase
{
    private readonly IGuestService _guests;
    public GuestRegistrationController(IGuestService guests) => _guests = guests;

    [AllowAnonymous]
    [HttpPost("eligibility")]
    public async Task<ActionResult<GuestEligibilityDto>> Eligibility([FromBody] GuestEligibilityRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _guests.CheckRegistrationEligibilityAsync(request, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
