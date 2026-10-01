using ClubManagement.Auth;
using ClubManagement.DTOs.Engagement;
using ClubManagement.Services.Engagement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Engagement;

[ApiController]
[Authorize]
[Route("api/member/events")]
public class MemberEventsController : ControllerBase
{
    private readonly IClubEventService _events;

    public MemberEventsController(IClubEventService events) => _events = events;

    private long? ProfileId() => User.ProfileId();

    [HttpGet("summary")]
    public async Task<ActionResult<MemberEventSummaryDto>> Summary(CancellationToken cancellationToken)
    {
        var profileId = ProfileId();
        if (profileId is null) return Forbid();
        return Ok(await _events.MemberSummaryAsync(profileId.Value, cancellationToken));
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ClubEventDetailDto>>> List(
        [FromQuery] string? bucket,
        [FromQuery] string? category,
        [FromQuery] string? search,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken cancellationToken)
    {
        var profileId = ProfileId();
        if (profileId is null) return Forbid();
        return Ok(await _events.MemberListAsync(profileId.Value, bucket, category, search, from, to, cancellationToken));
    }

    [HttpGet("mine")]
    public async Task<ActionResult<IReadOnlyList<ClubEventDetailDto>>> Mine([FromQuery] string? bucket, CancellationToken cancellationToken)
    {
        var profileId = ProfileId();
        if (profileId is null) return Forbid();
        return Ok(await _events.MemberMineAsync(profileId.Value, bucket, cancellationToken));
    }

    [HttpGet("calendar")]
    public async Task<ActionResult<IReadOnlyList<ClubEventDetailDto>>> Calendar(
        [FromQuery] DateTime from,
        [FromQuery] DateTime to,
        CancellationToken cancellationToken)
    {
        var profileId = ProfileId();
        if (profileId is null) return Forbid();
        return Ok(await _events.CalendarAsync(from, to, publishedOnly: true, profileId, cancellationToken));
    }

    [HttpGet("categories")]
    public async Task<ActionResult<IReadOnlyList<EventCategoryDto>>> Categories(CancellationToken cancellationToken)
    {
        if (ProfileId() is null) return Forbid();
        return Ok(await _events.CategoriesAsync(activeOnly: true, cancellationToken));
    }

    [HttpGet("{id:long}")]
    public async Task<ActionResult<ClubEventDetailDto>> Get(long id, CancellationToken cancellationToken)
    {
        var profileId = ProfileId();
        if (profileId is null) return Forbid();
        var row = await _events.MemberGetAsync(profileId.Value, id, cancellationToken);
        return row is null ? NotFound() : Ok(row);
    }

    [HttpPost("{id:long}/register")]
    public async Task<ActionResult<ClubEventDetailDto>> Register(long id, [FromBody] RegisterForEventRequest? request, CancellationToken cancellationToken)
    {
        var profileId = ProfileId();
        if (profileId is null) return Forbid();
        try { return Ok(await _events.RegisterAsync(profileId.Value, id, request?.GuestName, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{id:long}/cancel")]
    public async Task<ActionResult<ClubEventDetailDto>> Cancel(long id, CancellationToken cancellationToken)
    {
        var profileId = ProfileId();
        if (profileId is null) return Forbid();
        try { return Ok(await _events.CancelOwnAsync(profileId.Value, id, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
