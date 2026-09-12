using ClubManagement.Auth;
using ClubManagement.DTOs.Common;
using ClubManagement.Services.Finance;
using ClubManagement.Services.MembershipApplication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Finance;

[ApiController]
[Route("api/finance")]
[Authorize]
public class FinanceController : ControllerBase
{
    private readonly IFinanceService _finance;
    private readonly IManagerStageService _managerStage;

    public FinanceController(IFinanceService finance, IManagerStageService managerStage)
    {
        _finance = finance;
        _managerStage = managerStage;
    }

    [AllowAnonymous]
    [HttpGet("quote")]
    public async Task<ActionResult<FeeQuoteDto>> Quote([FromQuery] long membershipTypeId, [FromQuery] DateOnly dateOfBirth, [FromQuery] DateOnly? asOf, CancellationToken cancellationToken)
    {
        try { return Ok(await _finance.QuoteAsync(membershipTypeId, dateOfBirth, asOf ?? DateOnly.FromDateTime(DateTime.UtcNow), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("summary")]
    public async Task<ActionResult<FinanceDeskSummaryDto>> Summary([FromQuery] int? year, CancellationToken cancellationToken) =>
        Ok(await _finance.GetDeskSummaryAsync(year ?? DateTime.UtcNow.Year, cancellationToken));

    [HttpGet("next-receipt")]
    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    public async Task<ActionResult<object>> NextReceipt(CancellationToken cancellationToken) =>
        Ok(new { receiptNumber = await _finance.PeekNextReceiptNumberAsync(cancellationToken) });

    [HttpGet("payments")]
    public async Task<ActionResult<PagedResult<PaymentRowDto>>> Payments(
        [FromQuery] PagedRequest paging,
        [FromQuery] long? accountId,
        [FromQuery] string? status,
        [FromQuery] string? method,
        [FromQuery] string? feeType,
        [FromQuery] string? search,
        [FromQuery] int? year,
        [FromQuery] string? membershipType,
        CancellationToken cancellationToken) =>
        Ok(await _finance.ListPaymentsAsync(
            new PaymentListFilter(accountId, status, method, feeType, search, year, membershipType),
            paging,
            cancellationToken));

    [Authorize(Roles = "GENERAL_MANAGER,TREASURER,CHAIRMAN,APPLICANT,MEMBER")]
    [HttpPost("payments")]
    public async Task<ActionResult<PaymentRowDto>> Record([FromBody] RecordPaymentRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _finance.RecordPaymentAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost("payments/{transactionId:long}/approve")]
    public async Task<ActionResult<PaymentRowDto>> Approve(
        long transactionId,
        [FromBody] ApprovePaymentRequest? request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _finance.ApprovePaymentAsync(transactionId, User.UserId(), cancellationToken, request)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost("payments/{transactionId:long}/reject")]
    public async Task<ActionResult<PaymentRowDto>> Reject(
        long transactionId,
        [FromBody] RejectPaymentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var row = await _finance.RejectPaymentAsync(transactionId, request, User.UserId(), cancellationToken);
            try
            {
                if (row.ProfileId is long profileId)
                {
                    await _managerStage.NotifyApplicantPaymentRejectedAsync(
                        profileId,
                        row.ApplicationId,
                        row.FeeType ?? row.FeeTypeCode ?? "Fee",
                        request.Reason,
                        cancellationToken);
                }
            }
            catch
            {
                /* rejection must succeed even if notification/SMTP fails */
            }
            return Ok(row);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost("payments/{transactionId:long}/receipt")]
    public async Task<ActionResult<PaymentRowDto>> IssueReceipt(long transactionId, CancellationToken cancellationToken)
    {
        try { return Ok(await _finance.EnsureReceiptAsync(transactionId, null, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("payments/{transactionId:long}/receipt")]
    public async Task<ActionResult<MembershipReceiptDto>> GetReceipt(long transactionId, CancellationToken cancellationToken)
    {
        try
        {
            long? requiredProfileId = null;
            if (!User.IsInRole("ADMIN")
                && !User.IsInRole("GENERAL_MANAGER")
                && !User.IsInRole("TREASURER")
                && !User.IsInRole("CHAIRMAN"))
            {
                requiredProfileId = User.ProfileId();
            }
            return Ok(await _finance.GetMembershipReceiptAsync(transactionId, requiredProfileId, cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("subscriptions")]
    public async Task<ActionResult<PagedResult<SubscriptionRowDto>>> Subscriptions(
        [FromQuery] PagedRequest paging,
        [FromQuery] int? year,
        [FromQuery] string? search,
        [FromQuery] bool? arrearsOnly,
        [FromQuery] string? membershipType,
        CancellationToken cancellationToken) =>
        Ok(await _finance.ListSubscriptionsAsync(
            new SubscriptionListFilter(year, search, arrearsOnly == true, membershipType),
            paging,
            cancellationToken));

    [HttpGet("settlement/members")]
    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    public async Task<ActionResult<IReadOnlyList<SettlementMemberHitDto>>> SettlementMembers(
        [FromQuery] string? search,
        [FromQuery] int? year,
        CancellationToken cancellationToken) =>
        Ok(await _finance.SearchSettlementMembersAsync(search, year, cancellationToken));

    [HttpGet("settlement/context/{accountId:long}")]
    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    public async Task<ActionResult<SettlementContextDto>> SettlementContext(
        long accountId,
        [FromQuery] int? year,
        [FromQuery] long? subscriptionId,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.GetSettlementContextAsync(accountId, year, subscriptionId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("settlement")]
    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    public async Task<ActionResult<DirectSettlementResultDto>> DirectSettlement(
        [FromBody] DirectSettlementRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.DirectSettleAsync(request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN,ADMIN")]
    [HttpPost("posting/{year:int}")]
    public async Task<ActionResult<object>> Posting(int year, CancellationToken cancellationToken)
    {
        var count = await _finance.RunPostingAsync(year, User.UserId(), cancellationToken);
        return Ok(new { updated = count });
    }

    /// <summary>
    /// Manually run the annual subscription lifecycle for the current year
    /// (1 Jan generate → after 28 Feb POSTED → after 30 Apr REMOVED).
    /// </summary>
    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN,ADMIN")]
    [HttpPost("subscription-lifecycle")]
    public async Task<ActionResult<SubscriptionLifecycleResultDto>> SubscriptionLifecycle(CancellationToken cancellationToken) =>
        Ok(await _finance.EnforceSubscriptionLifecycleAsync(cancellationToken));
}
