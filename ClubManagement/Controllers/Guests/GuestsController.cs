using ClubManagement.Auth;
using ClubManagement.Services.Guests;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Guests;

[ApiController]
[Route("api/guests")]
[Authorize]
public class GuestsController : ControllerBase
{
    private readonly IGuestService _guests;
    public GuestsController(IGuestService guests) => _guests = guests;

    [HttpGet("policy")]
    public async Task<ActionResult<GuestPolicyDto>> Policy(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId() ?? throw new InvalidOperationException("Profile is missing from the token.");
        return Ok(await _guests.GetGuestPolicyAsync(profileId, cancellationToken));
    }

    [HttpGet("visits")]
    public async Task<ActionResult<IReadOnlyList<VisitRowDto>>> List(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId() ?? 0;
        return Ok(await _guests.ListCurrentAsync(profileId, cancellationToken));
    }

    [HttpPost("visits")]
    public async Task<ActionResult<VisitRowDto>> SignIn([FromBody] GuestVisitRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var profileId = User.ProfileId() ?? throw new InvalidOperationException("Profile is missing from the token.");
            return Ok(await _guests.SignInGuestAsync(profileId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    /// <summary>
    /// Full guest-book entry for the signed-in member. Host is always the caller's profile
    /// (members cannot introduce guests under another member).
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<ReceptionVisitDto>> Register(
        [FromBody] MemberRegisterGuestRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var profileId = User.ProfileId() ?? throw new InvalidOperationException("Profile is missing from the token.");
            var full = new RegisterGuestVisitRequest(
                request.FirstName,
                request.Surname,
                request.Email,
                profileId,
                request.VisitDate,
                request.Purpose,
                request.Signature,
                request.Status,
                request.Phone);
            return Ok(await _guests.RegisterGuestVisitAsync(full, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("visits/{visitId:long}/notify-reception")]
    public async Task<ActionResult<GuestArrivalAlertDto>> NotifyReception(
        long visitId,
        [FromBody] NotifyReceptionBody? request,
        CancellationToken cancellationToken)
    {
        try
        {
            var profileId = User.ProfileId() ?? throw new InvalidOperationException("Profile is missing from the token.");
            return Ok(await _guests.NotifyReceptionGuestArrivedAsync(
                profileId, visitId, request?.Message, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("visits/{visitId:long}/sign-out")]
    public async Task<IActionResult> SignOut(long visitId, [FromBody] SignOutRequest request, CancellationToken cancellationToken)
    {
        await _guests.SignOutAsync(visitId, request.TimeOut, cancellationToken);
        return NoContent();
    }

    [HttpPost("reciprocal")]
    public async Task<IActionResult> Reciprocal([FromBody] ReciprocalVisitRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var profileId = User.ProfileId() ?? throw new InvalidOperationException("Profile is missing from the token.");
            await _guests.RecordReciprocalAsync(profileId, request, User.UserId(), cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}

public record SignOutRequest(TimeOnly TimeOut);

public record NotifyReceptionBody(string? Message);

public record MemberRegisterGuestRequest(
    string FirstName,
    string Surname,
    string? Email,
    DateOnly? VisitDate,
    string? Purpose,
    string? Signature,
    string? Status,
    string? Phone);
