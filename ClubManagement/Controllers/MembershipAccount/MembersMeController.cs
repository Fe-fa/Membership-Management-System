using ClubManagement.Auth;
using ClubManagement.DTOs.Common;
using ClubManagement.DTOs.MembershipAccount;
using ClubManagement.Services.Finance;
using ClubManagement.Services.MembershipAccount;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.MembershipAccount;

[ApiController]
[Route("api/members/me")]
[Authorize]
public class MembersMeController : ControllerBase
{
    private readonly IMemberDashboardService _dashboard;
    private readonly IMemberProfileService _profiles;
    private readonly IFinanceService _finance;
    private readonly INonMembershipBillingService _nmBilling;

    public MembersMeController(
        IMemberDashboardService dashboard,
        IMemberProfileService profiles,
        IFinanceService finance,
        INonMembershipBillingService nmBilling)
    {
        _dashboard = dashboard;
        _profiles = profiles;
        _finance = finance;
        _nmBilling = nmBilling;
    }

    [HttpGet]
    public async Task<ActionResult<MemberDashboardDto>> Me(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        var me = await _dashboard.GetMineAsync(profileId.Value, cancellationToken);
        return me is null ? NotFound() : Ok(me);
    }

    [HttpGet("profile")]
    public async Task<ActionResult<MemberProfileDto>> Profile(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        var profile = await _profiles.GetByProfileIdAsync(profileId.Value, cancellationToken);
        return profile is null ? NotFound() : Ok(profile);
    }

    [HttpPut("profile")]
    public async Task<ActionResult<MemberProfileDto>> UpdateProfile([FromBody] UpdateMemberProfileRequest request, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        var existing = await _profiles.GetByProfileIdAsync(profileId.Value, cancellationToken);
        if (existing is null) return NotFound();
        request.MembershipTypeId = existing.Governance.MembershipTypeId;
        try
        {
            var updated = await _profiles.UpdateAsync(existing.AccountId, request, User.UserId(), cancellationToken);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("subscription")]
    public async Task<ActionResult<MemberSubscriptionDto>> Subscription(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        var row = await _dashboard.GetSubscriptionAsync(profileId.Value, cancellationToken);
        return row is null ? NotFound() : Ok(row);
    }

    [HttpGet("payments")]
    public async Task<ActionResult<IReadOnlyList<PaymentRowDto>>> Payments(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        var me = await _dashboard.GetMineAsync(profileId.Value, cancellationToken);
        if (me is null) return NotFound();
        return Ok(await _finance.ListPaymentsAsync(me.AccountId, cancellationToken));
    }

    [HttpGet("invoices/current")]
    public async Task<ActionResult<InvoiceDocumentDto>> CurrentInvoice(
        [FromQuery] int? year,
        CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        var me = await _dashboard.GetMineAsync(profileId.Value, cancellationToken);
        if (me is null) return NotFound();
        try
        {
            var invoice = await _finance.GetSubscriptionInvoiceAsync(
                me.AccountId,
                year,
                cancellationToken,
                memberPortalOnly: true);
            return invoice is null
                ? NotFound(new { message = "No invoice has been issued for this year yet." })
                : Ok(invoice);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("statement")]
    public async Task<ActionResult<StatementDocumentDto>> Statement(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        var me = await _dashboard.GetMineAsync(profileId.Value, cancellationToken);
        if (me is null) return NotFound();
        try
        {
            return Ok(await _finance.GetMemberStatementAsync(me.AccountId, from, to, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("payments/{transactionId:long}/void")]
    public async Task<ActionResult<PaymentRowDto>> VoidPayment(
        long transactionId,
        [FromBody] VoidPaymentRequest? request,
        CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _finance.VoidPaymentAsync(
                transactionId,
                profileId.Value,
                request,
                User.UserId(),
                cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("payments")]
    public async Task<ActionResult<PaymentRowDto>> Pay([FromBody] MemberPayRequest request, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _dashboard.PaySubscriptionAsync(profileId.Value, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("payments/mpesa-stk")]
    public async Task<ActionResult<MpesaStkPushResultDto>> MpesaStk([FromBody] MpesaStkPushRequest request, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _dashboard.InitiateMpesaStkAsync(profileId.Value, request, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("endorsements")]
    public async Task<ActionResult<object>> Endorsements(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(new
        {
            pending = await _dashboard.ListInvitesAsync(profileId.Value, cancellationToken)
        });
    }

    [HttpGet("endorsements/history")]
    public async Task<ActionResult<PagedResult<EndorsementHistoryDto>>> EndorsementHistory(
        [FromQuery] PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(await _dashboard.ListHistoryAsync(profileId.Value, paging, cancellationToken));
    }

    [HttpGet("endorsements/history/search")]
    public async Task<ActionResult<IReadOnlyList<EndorsementHistoryDto>>> SearchEndorsementHistory([FromQuery] string? q, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(await _dashboard.SearchHistoryAsync(profileId.Value, q, cancellationToken));
    }

    [HttpGet("endorsements/history/{endorsementId:long}")]
    public async Task<ActionResult<EndorsementHistoryDto>> GetEndorsementHistory(long endorsementId, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _dashboard.GetHistoryAsync(profileId.Value, endorsementId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("endorsements/history/{endorsementId:long}")]
    public async Task<ActionResult<EndorsementHistoryDto>> UpdateEndorsementHistory(long endorsementId, [FromBody] UpdateEndorsementHistoryRequest request, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _dashboard.UpdateHistoryAsync(profileId.Value, endorsementId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("endorsements/history/{endorsementId:long}")]
    public async Task<IActionResult> HideEndorsementHistory(long endorsementId, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            await _dashboard.HideHistoryAsync(profileId.Value, endorsementId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost("endorsements/history/{endorsementId:long}/restore")]
    public async Task<IActionResult> RestoreEndorsementHistory(long endorsementId, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            await _dashboard.RestoreHistoryAsync(profileId.Value, endorsementId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("notifications")]
    public async Task<ActionResult<IReadOnlyList<MemberNotificationDto>>> Notifications(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(await _dashboard.ListNotificationsAsync(profileId.Value, cancellationToken));
    }

    [HttpPost("notifications/{notificationId:long}/read")]
    public async Task<IActionResult> MarkNotificationRead(long notificationId, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            await _dashboard.MarkNotificationReadAsync(profileId.Value, notificationId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("notifications/read-all")]
    public async Task<IActionResult> MarkAllNotificationsRead(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        await _dashboard.MarkAllNotificationsReadAsync(profileId.Value, cancellationToken);
        return NoContent();
    }

    [HttpDelete("notifications/{notificationId:long}")]
    public async Task<IActionResult> DismissNotification(long notificationId, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            await _dashboard.DismissNotificationAsync(profileId.Value, notificationId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("notifications")]
    public async Task<IActionResult> DismissAllNotifications(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        await _dashboard.DismissAllNotificationsAsync(profileId.Value, cancellationToken);
        return NoContent();
    }

    [HttpPost("endorsements/{applicationId:long}")]
    public async Task<IActionResult> CompleteEndorsement(long applicationId, [FromBody] CompleteEndorsementRequest request, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            await _dashboard.CompleteEndorsementAsync(profileId.Value, applicationId, request, User.UserId(), cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("endorsements/{applicationId:long}/reject")]
    public async Task<IActionResult> DeclineEndorsement(long applicationId, [FromBody] DeclineEndorsementRequest request, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            await _dashboard.DeclineEndorsementAsync(profileId.Value, applicationId, request, User.UserId(), cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("documents")]
    public async Task<ActionResult<MemberDocumentsDto>> Documents(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(await _dashboard.GetDocumentsAsync(profileId.Value, cancellationToken));
    }

    [HttpPost("consent/withdraw")]
    public async Task<IActionResult> WithdrawConsent(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        await _dashboard.WithdrawConsentAsync(profileId.Value, User.UserId(), cancellationToken);
        return NoContent();
    }

    [HttpGet("reciprocal")]
    public async Task<ActionResult<ReciprocalSummaryDto>> Reciprocal(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(await _dashboard.ReciprocalSummaryAsync(profileId.Value, cancellationToken));
    }

    [HttpGet("accommodation")]
    public async Task<ActionResult<IReadOnlyList<AccommodationBookingDto>>> Accommodation(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _dashboard.ListBookingsAsync(profileId.Value, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("accommodation")]
    public async Task<ActionResult<AccommodationBookingDto>> Book([FromBody] CreateAccommodationBookingRequest request, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _dashboard.BookAsync(profileId.Value, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("accommodation/{bookingId:long}/cancel")]
    public async Task<IActionResult> Cancel(long bookingId, CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            await _dashboard.CancelBookingAsync(profileId.Value, bookingId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("billing/accommodation")]
    public async Task<ActionResult<object>> ListBillingAccommodation(
        [FromQuery] ClubManagement.DTOs.Common.PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var me = await RequireMeAsync(cancellationToken);
        if (me is null) return Unauthorized();
        return Ok(await _nmBilling.ListAccommodationAsync(
            new NmListFilter(AccountId: me.AccountId), paging, cancellationToken));
    }

    [HttpPost("billing/accommodation")]
    public async Task<ActionResult<NmAccommodationRowDto>> CreateBillingAccommodation(
        [FromBody] MemberNmAccommodationRequest request,
        CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        var me = await RequireMeAsync(cancellationToken);
        if (profileId is null || me is null) return Unauthorized();
        AccommodationBookingDto? stay = null;
        try
        {
            var roomType = ComposeRoomType(request.RoomType, request.RoomNumber);
            stay = await _dashboard.BookAsync(
                profileId.Value,
                new CreateAccommodationBookingRequest
                {
                    CheckInDate = request.CheckInDate,
                    CheckOutDate = request.CheckOutDate,
                    RoomType = roomType,
                    NightlyRate = request.NightlyRate
                },
                User.UserId(),
                cancellationToken);

            return Ok(await _nmBilling.CreateAccommodationAsync(
                new NmAccommodationCreateRequest(
                    me.FullName,
                    request.Phone,
                    request.Email,
                    me.AccountId,
                    IsGuest: false,
                    request.CheckInDate,
                    request.CheckOutDate,
                    request.RoomNumber,
                    request.NightlyRate,
                    request.ExtraCharges,
                    IsPaidInAdvance: true,
                    AccommodationBookingId: stay.AccommodationBookingId),
                User.UserId(),
                cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            if (stay is not null)
                await _dashboard.CancelBookingAsync(profileId.Value, stay.AccommodationBookingId, cancellationToken);
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("billing/corkage")]
    public async Task<ActionResult<object>> ListBillingCorkage(
        [FromQuery] ClubManagement.DTOs.Common.PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var me = await RequireMeAsync(cancellationToken);
        if (me is null) return Unauthorized();
        return Ok(await _nmBilling.ListCorkageAsync(
            new NmListFilter(AccountId: me.AccountId), paging, cancellationToken));
    }

    [HttpPost("billing/corkage")]
    public async Task<ActionResult<NmCorkageRowDto>> CreateBillingCorkage(
        [FromBody] MemberNmCorkageRequest request,
        CancellationToken cancellationToken)
    {
        var me = await RequireMeAsync(cancellationToken);
        if (me is null) return Unauthorized();
        try
        {
            return Ok(await _nmBilling.CreateCorkageAsync(
                new NmCorkageCreateRequest(
                    me.FullName,
                    me.AccountId,
                    IsGuest: false,
                    request.ItemDescription,
                    request.FeeAmount,
                    request.AuthorizedByManager,
                    request.ManagerName),
                User.UserId(),
                cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("billing/custom")]
    public async Task<ActionResult<object>> ListBillingCustom(
        [FromQuery] ClubManagement.DTOs.Common.PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var me = await RequireMeAsync(cancellationToken);
        if (me is null) return Unauthorized();
        return Ok(await _nmBilling.ListCustomAsync(
            new NmListFilter(AccountId: me.AccountId), paging, cancellationToken));
    }

    [HttpPost("billing/custom")]
    public async Task<ActionResult<NmCustomRowDto>> CreateBillingCustom(
        [FromBody] MemberNmCustomRequest request,
        CancellationToken cancellationToken)
    {
        var me = await RequireMeAsync(cancellationToken);
        if (me is null) return Unauthorized();
        try
        {
            return Ok(await _nmBilling.CreateCustomAsync(
                new NmCustomCreateRequest(
                    me.FullName,
                    me.AccountId,
                    request.Category,
                    request.LineItems.Select(l => new NmCustomLineRequest(l.Description, l.UnitPrice, l.Quantity)).ToList()),
                User.UserId(),
                User.Identity?.Name,
                cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private async Task<MemberDashboardDto?> RequireMeAsync(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return null;
        return await _dashboard.GetMineAsync(profileId.Value, cancellationToken);
    }

    private static string ComposeRoomType(string? roomType, string? roomNumber)
    {
        var type = string.IsNullOrWhiteSpace(roomType) ? "Standard" : roomType.Trim();
        var number = roomNumber?.Trim();
        if (string.IsNullOrWhiteSpace(number)) return type;
        return type.Contains(number, StringComparison.OrdinalIgnoreCase) ? type : $"{type} {number}";
    }
}

public record MemberNmAccommodationRequest(
    DateOnly CheckInDate,
    DateOnly CheckOutDate,
    string? RoomNumber,
    decimal NightlyRate,
    decimal ExtraCharges = 0,
    string? Phone = null,
    string? Email = null,
    string? RoomType = null);

public record MemberNmCorkageRequest(
    string ItemDescription,
    decimal FeeAmount,
    bool AuthorizedByManager = false,
    string? ManagerName = null);

public record MemberNmCustomLineRequest(string Description, decimal UnitPrice, decimal Quantity);

public record MemberNmCustomRequest(
    string Category,
    IReadOnlyList<MemberNmCustomLineRequest> LineItems);
