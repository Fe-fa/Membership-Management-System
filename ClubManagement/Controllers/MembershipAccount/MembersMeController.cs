using ClubManagement.Auth;
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

    public MembersMeController(IMemberDashboardService dashboard, IMemberProfileService profiles, IFinanceService finance)
    {
        _dashboard = dashboard;
        _profiles = profiles;
        _finance = finance;
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

    [HttpGet("endorsements")]
    public async Task<ActionResult<object>> Endorsements(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(new
        {
            pending = await _dashboard.ListInvitesAsync(profileId.Value, cancellationToken),
            history = await _dashboard.ListHistoryAsync(profileId.Value, cancellationToken)
        });
    }

    [HttpGet("notifications")]
    public async Task<ActionResult<IReadOnlyList<MemberNotificationDto>>> Notifications(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(await _dashboard.ListNotificationsAsync(profileId.Value, cancellationToken));
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
}
