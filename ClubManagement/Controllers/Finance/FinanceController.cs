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
    [HttpPost("payments/{transactionId:long}/refund")]
    public async Task<ActionResult<PaymentRowDto>> Refund(
        long transactionId,
        [FromBody] RefundPaymentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var row = await _finance.RefundPaymentAsync(transactionId, request, User.UserId(), cancellationToken);
            try
            {
                if (row.ProfileId is long profileId)
                {
                    await _managerStage.NotifyApplicantPaymentRejectedAsync(
                        profileId,
                        row.ApplicationId,
                        row.FeeType ?? row.FeeTypeCode ?? "Fee",
                        $"Refunded: {request.Reason}",
                        cancellationToken);
                }
                if (row.ApplicationId is long applicationId)
                    await _managerStage.OnApplicantPrerequisitesChangedAsync(applicationId, cancellationToken);
            }
            catch
            {
                /* refund must succeed even if notification/SMTP fails */
            }
            return Ok(row);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost("payments/{transactionId:long}/reverse")]
    public async Task<ActionResult<PaymentRowDto>> Reverse(
        long transactionId,
        [FromBody] ReversePaymentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.ReversePaymentAsync(transactionId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    public record BulkInvoiceRequest(
        int? Year = null,
        long[]? AccountIds = null,
        bool SendEmail = true,
        bool PublishToMember = true,
        Dictionary<string, string>? InvoiceHtmlByAccountId = null);
    public record BulkInvoiceResultDto(
        int Issued,
        int Year,
        int Emailed = 0,
        int Published = 0,
        int SkippedNoEmail = 0);

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpGet("invoices/stats")]
    public async Task<ActionResult<InvoiceRunStatsDto>> InvoiceStats(
        [FromQuery] int? year,
        [FromQuery] string? membershipType,
        CancellationToken cancellationToken) =>
        Ok(await _finance.GetInvoiceRunStatsAsync(year ?? DateTime.UtcNow.Year, membershipType, cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpGet("invoices/queue")]
    public async Task<ActionResult<PagedResult<InvoiceQueueRowDto>>> InvoiceQueue(
        [FromQuery] PagedRequest paging,
        [FromQuery] int? year,
        [FromQuery] string? search,
        [FromQuery] string? membershipType,
        CancellationToken cancellationToken) =>
        Ok(await _finance.ListInvoiceQueueAsync(
            new SubscriptionListFilter(year, search, ArrearsOnly: true, membershipType),
            paging,
            cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpGet("invoices/roster")]
    public async Task<ActionResult<PagedResult<InvoiceRosterRowDto>>> InvoiceRoster(
        [FromQuery] PagedRequest paging,
        [FromQuery] int? year,
        [FromQuery] string? search,
        [FromQuery] string? membershipType,
        [FromQuery] bool? received,
        CancellationToken cancellationToken) =>
        Ok(await _finance.ListInvoiceRosterAsync(
            new SubscriptionListFilter(year, search, ArrearsOnly: true, membershipType),
            paging,
            received,
            cancellationToken));

    [Authorize]
    [HttpGet("invoice-setup")]
    [HttpGet("payment-setup")]
    public async Task<ActionResult<PaymentSetupDto>> GetInvoiceSetup(CancellationToken cancellationToken) =>
        Ok(await _finance.GetInvoiceSetupAsync(cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPut("invoice-setup")]
    [HttpPut("payment-setup")]
    public async Task<ActionResult<PaymentSetupDto>> SaveInvoiceSetup(
        [FromBody] PaymentSetupDto? setup,
        CancellationToken cancellationToken) =>
        Ok(await _finance.SaveInvoiceSetupAsync(setup ?? new PaymentSetupDto(), User.UserId(), cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost("invoices/bulk")]
    [RequestSizeLimit(52_428_800)]
    public async Task<ActionResult<BulkInvoiceResultDto>> IssueInvoicesBulk(
        [FromBody] BulkInvoiceRequest? request,
        CancellationToken cancellationToken)
    {
        try
        {
            var year = request?.Year ?? DateTime.UtcNow.Year;
            var sendEmail = request?.SendEmail ?? true;
            var publishToMember = request?.PublishToMember ?? true;
            if (!sendEmail && !publishToMember)
                return BadRequest(new { message = "Choose email, member dashboard, or both." });
            var result = await _finance.IssueAnnualInvoicesForYearAsync(
                year,
                User.UserId(),
                sendEmail,
                cancellationToken,
                request?.AccountIds,
                publishToMember,
                ParseInvoiceHtmlMap(request?.InvoiceHtmlByAccountId));
            return Ok(new BulkInvoiceResultDto(result.Issued, year, result.Emailed, result.Published, result.SkippedNoEmail));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost("invoices/{accountId:long}")]
    public async Task<ActionResult<InvoiceDocumentDto>> IssueInvoice(
        long accountId,
        [FromQuery] int? year,
        [FromQuery] bool sendEmail,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.IssueSubscriptionInvoiceAsync(accountId, year, sendEmail, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpGet("invoices/{accountId:long}")]
    public async Task<ActionResult<InvoiceDocumentDto>> GetInvoice(
        long accountId,
        [FromQuery] int? year,
        CancellationToken cancellationToken)
    {
        try
        {
            var invoice = await _finance.GetSubscriptionInvoiceAsync(accountId, year, cancellationToken);
            return invoice is null ? NotFound(new { message = "No invoice has been issued for this member and year." }) : Ok(invoice);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER")]
    [HttpGet("statement-parties")]
    public async Task<ActionResult<PagedResult<StatementPartyRowDto>>> StatementParties(
        [FromQuery] PagedRequest paging,
        [FromQuery] string? search,
        [FromQuery] string? audience,
        [FromQuery] string? membershipType,
        [FromQuery] int? year,
        CancellationToken cancellationToken) =>
        Ok(await _finance.ListStatementPartiesAsync(search, audience, membershipType, year, paging, cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpGet("statements/{accountId:long}")]
    public async Task<ActionResult<StatementDocumentDto>> Statement(
        long accountId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.GetMemberStatementAsync(accountId, from, to, cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER")]
    [HttpGet("statements/applicant/{applicationId:long}")]
    public async Task<ActionResult<StatementDocumentDto>> ApplicantStatement(
        long applicationId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.GetApplicantStatementAsync(applicationId, from, to, cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER")]
    [HttpPost("statements/email")]
    [RequestSizeLimit(52_428_800)]
    public async Task<ActionResult<StatementEmailResultDto>> EmailStatements(
        [FromBody] StatementEmailRequest? request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.EmailStatementsAsync(request ?? new StatementEmailRequest(), cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN")]
    [HttpDelete("statement-parties")]
    public async Task<ActionResult<object>> DeletePartyStatements(
        [FromQuery] long? accountId,
        [FromQuery] long? applicationId,
        CancellationToken cancellationToken)
    {
        if (!User.IsInRole("ADMIN"))
            return StatusCode(403, new { message = "Only Admin can delete issued statements." });
        try
        {
            var deleted = await _finance.DeletePartyStatementsAsync(accountId, applicationId, cancellationToken);
            return Ok(new { deleted });
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

    [HttpGet("joining-dues")]
    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    public async Task<ActionResult<PagedResult<BillingQueueRowDto>>> JoiningDues(
        [FromQuery] PagedRequest paging,
        [FromQuery] string? search,
        [FromQuery] string? membershipType,
        [FromQuery] string? audience,
        CancellationToken cancellationToken) =>
        Ok(await _finance.ListJoiningDuesAsync(search, membershipType, paging, cancellationToken, audience));

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
    public async Task<ActionResult<SubscriptionLifecycleResultDto>> Posting(int year, CancellationToken cancellationToken)
    {
        if (year < 2000 || year > 2100)
            return BadRequest(new { message = "Year must be between 2000 and 2100." });
        return Ok(await _finance.RunSubscriptionLifecycleForYearAsync(year, User.UserId(), cancellationToken));
    }

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN,ADMIN")]
    [HttpPost("subscription-lifecycle")]
    public async Task<ActionResult<SubscriptionLifecycleResultDto>> SubscriptionLifecycle(CancellationToken cancellationToken) =>
        Ok(await _finance.EnforceSubscriptionLifecycleAsync(cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpGet("billing/queue")]
    public async Task<ActionResult<PagedResult<BillingQueueRowDto>>> BillingQueue(
        [FromQuery] PagedRequest paging,
        [FromQuery] string? feeType,
        [FromQuery] int? year,
        [FromQuery] string? search,
        [FromQuery] string? membershipType,
        [FromQuery] string? kind,
        CancellationToken cancellationToken) =>
        Ok(await _finance.ListBillingQueueAsync(
            feeType ?? "ANNUAL",
            year ?? DateTime.UtcNow.Year,
            search,
            membershipType,
            paging,
            cancellationToken,
            kind ?? "INVOICE"));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpGet("billing/stats")]
    public async Task<ActionResult<BillingQueueStatsDto>> BillingStats(
        [FromQuery] string? feeType,
        [FromQuery] int? year,
        [FromQuery] string? membershipType,
        [FromQuery] string? kind,
        CancellationToken cancellationToken) =>
        Ok(await _finance.GetBillingQueueStatsAsync(
            feeType ?? "ANNUAL",
            year ?? DateTime.UtcNow.Year,
            membershipType,
            cancellationToken,
            kind ?? "INVOICE"));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost("billing/submit")]
    [RequestSizeLimit(52_428_800)]
    public async Task<ActionResult<BillingSubmitResultDto>> SubmitBilling(
        [FromBody] BillingSubmitRequest? request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.SubmitBillingDocumentsAsync(
                request ?? new BillingSubmitRequest("INVOICE", "ANNUAL"),
                User.UserId(),
                cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER")]
    [HttpGet("billing/approvals")]
    public async Task<ActionResult<PagedResult<BillingApprovalRowDto>>> BillingApprovals(
        [FromQuery] PagedRequest paging,
        [FromQuery] string? kind,
        [FromQuery] string? status,
        [FromQuery] string? feeType,
        [FromQuery] string? search,
        CancellationToken cancellationToken) =>
        Ok(await _finance.ListBillingApprovalsAsync(kind, status, feeType, search, paging, cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER")]
    [HttpGet("billing/pending-count")]
    public async Task<ActionResult<BillingPendingCountsDto>> BillingPendingCount(CancellationToken cancellationToken) =>
        Ok(await _finance.GetBillingPendingCountsAsync(cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER")]
    [HttpGet("billing/{billingDocumentId:long}")]
    public async Task<ActionResult<BillingApprovalRowDto>> GetBillingDocument(
        long billingDocumentId,
        CancellationToken cancellationToken)
    {
        var doc = await _finance.GetBillingDocumentAsync(billingDocumentId, cancellationToken);
        return doc is null ? NotFound(new { message = "Document was not found." }) : Ok(doc);
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER")]
    [HttpPost("billing/{billingDocumentId:long}/approve")]
    public async Task<ActionResult<BillingApprovalRowDto>> ApproveBilling(
        long billingDocumentId,
        [FromBody] BillingDecisionRequest? request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.ApproveBillingDocumentAsync(
                billingDocumentId,
                request ?? new BillingDecisionRequest(),
                User.UserId(),
                cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER")]
    [HttpPost("billing/{billingDocumentId:long}/reject")]
    public async Task<ActionResult<BillingApprovalRowDto>> RejectBilling(
        long billingDocumentId,
        [FromBody] BillingDecisionRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _finance.RejectBillingDocumentAsync(billingDocumentId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    private static Dictionary<long, string>? ParseInvoiceHtmlMap(Dictionary<string, string>? source)
    {
        if (source is not { Count: > 0 }) return null;
        var map = new Dictionary<long, string>();
        foreach (var (key, html) in source)
        {
            if (long.TryParse(key, out var accountId) && !string.IsNullOrWhiteSpace(html))
                map[accountId] = html;
        }
        return map.Count == 0 ? null : map;
    }
}
