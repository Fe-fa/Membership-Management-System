using ClubManagement.Auth;
using ClubManagement.Services.Engagement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Engagement;

[ApiController]
[Authorize]
[Route("api/events")]
public class ClubEventsController : ControllerBase
{
    private readonly IClubEventService _events;

    public ClubEventsController(IClubEventService events) => _events = events;

    [HttpGet]
    public async Task<ActionResult<MemberEventsDto>> List(CancellationToken cancellationToken) =>
        Ok(await _events.ListForMemberAsync(cancellationToken));

    [HttpPost]
    public async Task<ActionResult<ClubEventDto>> Create([FromBody] SaveClubEventRequest request, CancellationToken cancellationToken)
    {
        if (!User.IsStaff()) return Forbid();
        try { return Ok(await _events.CreateAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("{id:long}")]
    public async Task<ActionResult<ClubEventDto>> Update(long id, [FromBody] SaveClubEventRequest request, CancellationToken cancellationToken)
    {
        if (!User.IsStaff()) return Forbid();
        try
        {
            var row = await _events.UpdateAsync(id, request, cancellationToken);
            return row is null ? NotFound() : Ok(row);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken cancellationToken)
    {
        if (!User.IsStaff()) return Forbid();
        var removed = await _events.DeleteAsync(id, cancellationToken);
        return removed ? Ok(new { message = "Event removed." }) : NotFound();
    }
}
