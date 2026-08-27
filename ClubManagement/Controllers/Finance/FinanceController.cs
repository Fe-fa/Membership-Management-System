using ClubManagement.Auth;
using ClubManagement.Services.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Finance;

[ApiController]
[Route("api/finance")]
[Authorize]
public class FinanceController : ControllerBase
{
    private readonly IFinanceService _finance;
    public FinanceController(IFinanceService finance) => _finance = finance;

    [AllowAnonymous]
    [HttpGet("quote")]
    public async Task<ActionResult<FeeQuoteDto>> Quote([FromQuery] long membershipTypeId, [FromQuery] DateOnly dateOfBirth, [FromQuery] DateOnly? asOf, CancellationToken cancellationToken)
    {
        try { return Ok(await _finance.QuoteAsync(membershipTypeId, dateOfBirth, asOf ?? DateOnly.FromDateTime(DateTime.UtcNow), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("payments")]
    public async Task<ActionResult<IReadOnlyList<PaymentRowDto>>> Payments([FromQuery] long? accountId, CancellationToken cancellationToken) =>
        Ok(await _finance.ListPaymentsAsync(accountId, cancellationToken));

    [Authorize(Roles = "GENERAL_MANAGER,TREASURER,CHAIRMAN,APPLICANT,MEMBER")]
    [HttpPost("payments")]
    public async Task<ActionResult<PaymentRowDto>> Record([FromBody] RecordPaymentRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _finance.RecordPaymentAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("subscriptions")]
    public async Task<ActionResult<IReadOnlyList<SubscriptionRowDto>>> Subscriptions([FromQuery] int? year, CancellationToken cancellationToken) =>
        Ok(await _finance.ListSubscriptionsAsync(year, cancellationToken));

    [Authorize(Roles = "TREASURER,GENERAL_MANAGER,CHAIRMAN")]
    [HttpPost("posting/{year:int}")]
    public async Task<ActionResult<object>> Posting(int year, CancellationToken cancellationToken)
    {
        var count = await _finance.RunPostingAsync(year, User.UserId(), cancellationToken);
        return Ok(new { updated = count });
    }
}
