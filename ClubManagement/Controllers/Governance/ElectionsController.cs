using ClubManagement.Auth;
using ClubManagement.DTOs.Governance;
using ClubManagement.Services.Governance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Governance;

[ApiController]
[Route("api/elections")]
[Authorize]
public class ElectionsController : ControllerBase
{
    private readonly IElectionService _elections;

    public ElectionsController(IElectionService elections) => _elections = elections;

    private bool CanManage() =>
        User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "TREASURER", "COMMITTEE_MEMBER");

    [HttpGet("notices")]
    public async Task<ActionResult<IReadOnlyList<MeetingNoticeDto>>> Notices(CancellationToken cancellationToken) =>
        Ok(await _elections.ListNoticesAsync(cancellationToken));

    [HttpGet("mine")]
    public async Task<ActionResult<MemberElectionDto>> Mine(CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        return Ok(await _elections.GetMineAsync(profileId.Value, cancellationToken));
    }

    [HttpPost("meetings/{meetingId:long}/votes")]
    public async Task<IActionResult> Vote(
        long meetingId,
        [FromBody] CastMemberBallotRequest request,
        CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _elections.CastVoteAsync(meetingId, profileId.Value, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("meetings/{meetingId:long}/proxy")]
    public async Task<IActionResult> Proxy(
        long meetingId,
        [FromBody] AppointProxyRequest request,
        CancellationToken cancellationToken)
    {
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            await _elections.AppointProxyAsync(meetingId, profileId.Value, request, User.UserId(), cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("meetings/{meetingId:long}/nominations")]
    public async Task<ActionResult<NominationDto>> Nominate(
        long meetingId,
        [FromBody] CreateNominationRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _elections.NominateAsync(meetingId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ElectionDeskDto>>> Desk(CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _elections.ListDeskAsync(cancellationToken));
    }

    [HttpGet("members")]
    public async Task<ActionResult<IReadOnlyList<MemberSearchHitDto>>> SearchMembers(
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        return Ok(await _elections.SearchMembersAsync(search, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<ElectionDeskDto>> Publish(
        [FromBody] PublishMeetingNoticeRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            return Ok(await _elections.PublishNoticeAsync(request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("meetings/{meetingId:long}/agenda")]
    public async Task<ActionResult<ElectionDeskDto>> Agenda(
        long meetingId,
        [FromBody] AddAgendaItemRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            return Ok(await _elections.AddAgendaAsync(meetingId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("meetings/{meetingId:long}/window")]
    public async Task<ActionResult<ElectionDeskDto>> Window(
        long meetingId,
        [FromBody] SetBallotWindowRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            return Ok(await _elections.SetWindowAsync(meetingId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("meetings/{meetingId:long}/officers")]
    public async Task<ActionResult<ElectionDeskDto>> Officers(
        long meetingId,
        [FromBody] AppointElectionOfficersRequest request,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            return Ok(await _elections.AppointOfficersAsync(meetingId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("meetings/{meetingId:long}/declare")]
    public async Task<ActionResult<ElectionDeskDto>> Declare(
        long meetingId,
        CancellationToken cancellationToken)
    {
        if (!User.HasAnyRole("CHAIRMAN", "ADMIN", "GENERAL_MANAGER"))
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "The Chairman's declaration is final and conclusive (Article 60)." });
        try
        {
            return Ok(await _elections.DeclareResultAsync(meetingId, User.ProfileId(), User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
