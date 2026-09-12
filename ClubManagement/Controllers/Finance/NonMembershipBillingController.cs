using ClubManagement.Auth;
using ClubManagement.DTOs.Common;
using ClubManagement.Services.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Finance;

[ApiController]
[Route("api/finance/non-membership")]
[Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
public class NonMembershipBillingController : ControllerBase
{
    private readonly INonMembershipBillingService _billing;

    public NonMembershipBillingController(INonMembershipBillingService billing) => _billing = billing;

    [HttpGet("summary")]
    public async Task<ActionResult<NmRevenueSummaryDto>> Summary(
        [FromQuery] string? period,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken cancellationToken) =>
        Ok(await _billing.GetSummaryAsync(period, from, to, cancellationToken));

    [HttpGet("accommodation")]
    public async Task<ActionResult<PagedResult<NmAccommodationRowDto>>> ListAccommodation(
        [FromQuery] PagedRequest paging,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] string? status,
        [FromQuery] string? paymentMethod,
        [FromQuery] string? search,
        CancellationToken cancellationToken) =>
        Ok(await _billing.ListAccommodationAsync(new NmListFilter(from, to, status, paymentMethod, search), paging, cancellationToken));

    [HttpPost("accommodation")]
    public async Task<ActionResult<NmAccommodationRowDto>> CreateAccommodation(
        [FromBody] NmAccommodationCreateRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _billing.CreateAccommodationAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("accommodation/{id:long}/pay")]
    public async Task<ActionResult<NmAccommodationRowDto>> PayAccommodation(
        long id, [FromBody] NmPayRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _billing.PayAccommodationAsync(id, request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("accommodation/{id:long}/cancel")]
    public async Task<ActionResult<NmAccommodationRowDto>> CancelAccommodation(long id, CancellationToken cancellationToken)
    {
        try { return Ok(await _billing.CancelAccommodationAsync(id, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("corkage")]
    public async Task<ActionResult<PagedResult<NmCorkageRowDto>>> ListCorkage(
        [FromQuery] PagedRequest paging,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] string? status,
        [FromQuery] string? paymentMethod,
        [FromQuery] string? search,
        CancellationToken cancellationToken) =>
        Ok(await _billing.ListCorkageAsync(new NmListFilter(from, to, status, paymentMethod, search), paging, cancellationToken));

    [HttpPost("corkage")]
    public async Task<ActionResult<NmCorkageRowDto>> CreateCorkage(
        [FromBody] NmCorkageCreateRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _billing.CreateCorkageAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("corkage/{id:long}/pay")]
    public async Task<ActionResult<NmCorkageRowDto>> PayCorkage(
        long id, [FromBody] NmPayRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _billing.PayCorkageAsync(id, request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("custom")]
    public async Task<ActionResult<PagedResult<NmCustomRowDto>>> ListCustom(
        [FromQuery] PagedRequest paging,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] string? status,
        [FromQuery] string? paymentMethod,
        [FromQuery] string? search,
        CancellationToken cancellationToken) =>
        Ok(await _billing.ListCustomAsync(new NmListFilter(from, to, status, paymentMethod, search), paging, cancellationToken));

    [HttpPost("custom")]
    public async Task<ActionResult<NmCustomRowDto>> CreateCustom(
        [FromBody] NmCustomCreateRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _billing.CreateCustomAsync(request, User.UserId(), User.Identity?.Name, cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("custom/{id:long}/pay")]
    public async Task<ActionResult<NmCustomRowDto>> PayCustom(
        long id, [FromBody] NmPayRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _billing.PayCustomAsync(id, request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("receipt/{kind}/{id:long}")]
    public async Task<ActionResult<NmReceiptDto>> Receipt(string kind, long id, CancellationToken cancellationToken)
    {
        try { return Ok(await _billing.GetReceiptAsync(kind, id, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
