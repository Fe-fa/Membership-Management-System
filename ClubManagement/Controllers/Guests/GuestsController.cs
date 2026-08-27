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
