using ClubManagement.Auth;
using ClubManagement.Services.MembershipAccount;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.MembershipAccount;

[ApiController]
[Route("api/membership-transitions")]
[Authorize(Roles = "ADMIN,GENERAL_MANAGER,CHAIRMAN")]
public class MembershipTransitionsController : ControllerBase
{
    private readonly IMembershipTransitionService _transitions;

    public MembershipTransitionsController(IMembershipTransitionService transitions)
    {
        _transitions = transitions;
    }

    [HttpGet]
    public async Task<ActionResult<TransitionHubDto>> Hub(CancellationToken cancellationToken) =>
        Ok(await _transitions.GetHubAsync(cancellationToken));

    [HttpPost("senior-life")]
    public async Task<IActionResult> ConfirmSeniorLife([FromBody] ConfirmSeniorLifeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var converted = await _transitions.ConfirmSeniorLifeAsync(request.AccountIds, User.UserId(), cancellationToken);
            return Ok(new { converted });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("nominations")]
    public async Task<ActionResult<LifeNominationDto>> Nominate([FromBody] NominateLifeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _transitions.NominateLifeAsync(request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("nominations/{transitionId:long}/vote")]
    public async Task<ActionResult<LifeNominationDto>> Vote(
        long transitionId,
        [FromBody] RecordLifeVoteRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _transitions.RecordVoteAsync(transitionId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{transitionId:long}/letter")]
    public async Task<IActionResult> Letter(long transitionId, CancellationToken cancellationToken)
    {
        var html = await _transitions.GetLetterHtmlAsync(transitionId, cancellationToken);
        if (string.IsNullOrWhiteSpace(html)) return NotFound();
        return Ok(new { html });
    }
}
