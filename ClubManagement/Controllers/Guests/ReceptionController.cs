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
    public async Task<ActionResult<IReadOnlyList<ReceptionMemberDto>>> Members(
        [FromQuery] string? search,
        CancellationToken cancellationToken) =>
        Ok(await _guests.ListActiveHostsAsync(search, cancellationToken));

    [HttpGet("members/{profileId:long}/visits")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<ActionResult<IReadOnlyList<ReceptionVisitDto>>> HostVisits(
        long profileId,
        CancellationToken cancellationToken) =>
        Ok(await _guests.ListHostVisitsAsync(profileId, cancellationToken));

    [HttpPost("register")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<ActionResult<ReceptionVisitDto>> Register(
        [FromBody] RegisterGuestVisitRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _guests.RegisterGuestVisitAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

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

    [HttpGet("visits/lookup")]
    public async Task<ActionResult<IReadOnlyList<ReceptionVisitDto>>> LookupVisits(
        [FromQuery] string? name,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _guests.LookupGuestVisitsAsync(name, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("visits/{visitId:long}")]
    public async Task<ActionResult<ReceptionVisitDto>> Visit(long visitId, CancellationToken cancellationToken)
    {
        var visit = await _guests.GetReceptionVisitAsync(visitId, cancellationToken);
        if (visit is null) return NotFound();
        if (!User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN"))
            visit = visit with { Signature = null };
        return Ok(visit);
    }

    [HttpGet("visits")]
    public async Task<ActionResult<PagedResult<ReceptionVisitDto>>> Visits(
        [FromQuery] PagedRequest paging,
        [FromQuery] bool currentOnly,
        CancellationToken cancellationToken)
    {
        if (!currentOnly && !User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN"))
            return Forbid();
        return Ok(await _guests.ListReceptionVisitsAsync(paging, currentOnly, cancellationToken));
    }

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

    [HttpGet("arrival-alerts")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<ActionResult<IReadOnlyList<GuestArrivalAlertDto>>> ArrivalAlerts(CancellationToken cancellationToken) =>
        Ok(await _guests.ListPendingArrivalAlertsAsync(cancellationToken));

    [HttpPost("arrival-alerts/{alertId:long}/acknowledge")]
    [Authorize(Roles = "RECEPTIONIST")]
    public async Task<IActionResult> AcknowledgeArrivalAlert(long alertId, CancellationToken cancellationToken)
    {
        try
        {
            await _guests.AcknowledgeArrivalAlertAsync(alertId, User.UserId(), cancellationToken);
            return NoContent();
        }
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

    [AllowAnonymous]
    [HttpPost("parent-eligibility")]
    public async Task<ActionResult<ParentApplicantEligibilityDto>> ParentEligibility(
        [FromBody] ParentApplicantRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _guests.CheckParentApplicantAsync(request, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
