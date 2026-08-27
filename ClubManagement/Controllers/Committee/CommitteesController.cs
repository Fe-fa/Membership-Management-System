using ClubManagement.Auth;
using ClubManagement.DTOs.Committee;
using ClubManagement.Services.Committee;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Committee;

[ApiController]
[Route("api/committees")]
[Authorize]
public class CommitteesController : ControllerBase
{
    private readonly ICommitteeService _committees;
    private readonly IInterviewConductService _interviews;
    private readonly ICommitteeBallotService _ballots;

    public CommitteesController(
        ICommitteeService committees,
        IInterviewConductService interviews,
        ICommitteeBallotService ballots)
    {
        _committees = committees;
        _interviews = interviews;
        _ballots = ballots;
    }

    private async Task<bool> CanManageAsync(CancellationToken cancellationToken) =>
        await _committees.CanManageAsync(User.ProfileId(), User.RoleCodes(), cancellationToken);

    private ObjectResult ManageForbidden() =>
        StatusCode(
            StatusCodes.Status403Forbidden,
            new
            {
                message =
                    "Only Admin, General Manager, Chairman, Treasurer, or a committee officer with credit-approval rights can manage the committee."
            });

    [HttpGet("current")]
    public async Task<ActionResult<CommitteeDetailDto>> GetCurrent(
        [FromQuery] string? type,
        CancellationToken cancellationToken)
    {
        var result = await _committees.GetCurrentAsync(type, cancellationToken);
        return result is null ? NotFound(new { message = "No active committee found." }) : Ok(result);
    }

    /// <summary>Active committees + upcoming SCHEDULED meetings for Stage A assign-to-meeting.</summary>
    [HttpGet("active")]
    public async Task<ActionResult<IReadOnlyList<ActiveCommitteeOptionDto>>> ListActive(
        CancellationToken cancellationToken)
    {
        if (!User.HasAnyRole("ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "TREASURER")
            && !await CanManageAsync(cancellationToken))
            return ManageForbidden();
        return Ok(await _committees.ListActiveForAssignAsync(cancellationToken));
    }

    [HttpGet("meta/roles")]
    public async Task<ActionResult<IReadOnlyList<CommitteeRoleOptionDto>>> Roles(CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        return Ok(await _committees.ListRolesAsync(cancellationToken));
    }

    [HttpGet("meta/meeting-types")]
    public async Task<ActionResult<IReadOnlyList<MeetingTypeOptionDto>>> MeetingTypes(CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        return Ok(await _committees.ListMeetingTypesAsync(cancellationToken));
    }

    [HttpGet("meta/profiles")]
    public async Task<ActionResult<IReadOnlyList<ProfileSearchHitDto>>> SearchProfiles(
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        return Ok(await _committees.SearchProfilesAsync(search, cancellationToken));
    }

    [HttpGet("{committeeId:long}")]
    public async Task<ActionResult<CommitteeDetailDto>> GetById(long committeeId, CancellationToken cancellationToken)
    {
        var result = await _committees.GetByIdAsync(committeeId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<CommitteeDetailDto>> Create(
        [FromBody] CreateCommitteeRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            return Ok(await _committees.CreateAsync(request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{committeeId:long}")]
    public async Task<ActionResult<CommitteeDetailDto>> Update(
        long committeeId,
        [FromBody] UpdateCommitteeRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            var updated = await _committees.UpdateAsync(committeeId, request, User.UserId(), cancellationToken);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{committeeId:long}/members")]
    public async Task<ActionResult<CommitteeMemberDto>> AddMember(
        long committeeId,
        [FromBody] AddCommitteeMemberRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            return Ok(await _committees.AddMemberAsync(committeeId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("{committeeId:long}/members/{committeeMemberId:long}")]
    public async Task<IActionResult> RemoveMember(
        long committeeId,
        long committeeMemberId,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            await _committees.SoftRemoveMemberAsync(committeeId, committeeMemberId, User.UserId(), cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{committeeId:long}/meetings")]
    public async Task<ActionResult<CommitteeMeetingDto>> CreateMeeting(
        long committeeId,
        [FromBody] CreateCommitteeMeetingRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            return Ok(await _committees.CreateMeetingAsync(committeeId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPatch("meetings/{meetingId:long}/status")]
    public async Task<ActionResult<CommitteeMeetingDto>> UpdateMeetingStatus(
        long meetingId,
        [FromBody] UpdateMeetingStatusRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            var result = await _committees.UpdateMeetingStatusAsync(meetingId, request, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPatch("meetings/{meetingId:long}/minutes")]
    public async Task<ActionResult<CommitteeMeetingDto>> UpdateMeetingMinutes(
        long meetingId,
        [FromBody] UpdateMeetingMinutesRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            var result = await _committees.UpdateMeetingMinutesAsync(meetingId, request, User.UserId(), cancellationToken);
            return result is null ? NotFound() : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("meetings/{meetingId:long}/interviews")]
    public async Task<ActionResult<IReadOnlyList<MeetingInterviewDto>>> ListInterviews(
        long meetingId,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        return Ok(await _interviews.ListByMeetingAsync(meetingId, cancellationToken));
    }

    [HttpPost("meetings/{meetingId:long}/interviews")]
    public async Task<ActionResult<MeetingInterviewDto>> AttachInterview(
        long meetingId,
        [FromBody] AttachInterviewRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            return Ok(await _interviews.AttachAsync(meetingId, request.ApplicationId, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("meetings/{meetingId:long}/interview-candidates")]
    public async Task<ActionResult<IReadOnlyList<InterviewCandidateDto>>> SearchInterviewCandidates(
        long meetingId,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        return Ok(await _interviews.SearchCandidatesAsync(meetingId, search, cancellationToken));
    }

    [HttpPatch("interviews/{interviewId:long}/outcome")]
    public async Task<ActionResult<MeetingInterviewDto>> SaveInterviewOutcome(
        long interviewId,
        [FromBody] SaveInterviewOutcomeRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken)) return ManageForbidden();
        try
        {
            return Ok(await _interviews.SaveOutcomeAsync(interviewId, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private async Task<bool> CanAccessBallotAsync(CancellationToken cancellationToken) =>
        await _ballots.CanAccessBallotAsync(User.ProfileId(), User.RoleCodes(), cancellationToken);

    private ObjectResult BallotForbidden() =>
        StatusCode(
            StatusCodes.Status403Forbidden,
            new { message = "Committee ballot is confidential Committee business (Article 6)." });

    [HttpGet("admission-ballot")]
    public async Task<ActionResult<CommitteeBallotMeetingDto>> AdmissionDesk(CancellationToken cancellationToken)
    {
        if (!await CanAccessBallotAsync(cancellationToken)) return BallotForbidden();
        try
        {
            return Ok(await _ballots.GetAdmissionDeskAsync(User.ProfileId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("meetings/{meetingId:long}/ballot")]
    public async Task<ActionResult<CommitteeBallotMeetingDto>> GetBallot(
        long meetingId,
        CancellationToken cancellationToken)
    {
        if (!await CanAccessBallotAsync(cancellationToken)) return BallotForbidden();
        try
        {
            return Ok(await _ballots.GetMeetingBallotAsync(meetingId, User.ProfileId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("meetings/{meetingId:long}/ballot-candidates")]
    public async Task<ActionResult<IReadOnlyList<BallotCandidateDto>>> SearchBallotCandidates(
        long meetingId,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        if (!await CanAccessBallotAsync(cancellationToken)) return BallotForbidden();
        return Ok(await _ballots.SearchCandidatesAsync(meetingId, search, cancellationToken));
    }

    [HttpPost("meetings/{meetingId:long}/ballot")]
    public async Task<ActionResult<CommitteeBallotItemDto>> AttachBallot(
        long meetingId,
        [FromBody] AttachBallotRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanAccessBallotAsync(cancellationToken)) return BallotForbidden();
        try
        {
            return Ok(await _ballots.AttachAsync(meetingId, request.ApplicationId, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("ballot/{itemId:long}/vote")]
    public async Task<ActionResult<CommitteeBallotItemDto>> CastBallotVote(
        long itemId,
        [FromBody] CastCommitteeBallotRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanAccessBallotAsync(cancellationToken)) return BallotForbidden();
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _ballots.CastVoteAsync(itemId, profileId.Value, request.VoteValue, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("ballot/{itemId:long}/signatures")]
    public async Task<ActionResult<CommitteeBallotItemDto>> ProceedToSignatures(
        long itemId,
        CancellationToken cancellationToken)
    {
        if (!await CanManageAsync(cancellationToken) && !await CanAccessBallotAsync(cancellationToken))
            return BallotForbidden();
        try
        {
            return Ok(await _ballots.ProceedToSignaturesAsync(itemId, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("meetings/{meetingId:long}/attendance")]
    public async Task<ActionResult<CommitteeBallotMeetingDto>> SetAttendance(
        long meetingId,
        [FromBody] SetAttendanceRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanAccessBallotAsync(cancellationToken)) return BallotForbidden();
        try
        {
            return Ok(await _ballots.SetAttendanceAsync(
                meetingId,
                request.CommitteeMemberIds,
                User.UserId(),
                cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("ballot/{itemId:long}/sign")]
    public async Task<ActionResult<CommitteeBallotItemDto>> SignAdmission(
        long itemId,
        [FromBody] AdmissionSignRequest request,
        CancellationToken cancellationToken)
    {
        if (!await CanAccessBallotAsync(cancellationToken)) return BallotForbidden();
        var profileId = User.ProfileId();
        if (profileId is null) return Unauthorized();
        try
        {
            return Ok(await _ballots.SignAdmissionAsync(itemId, profileId.Value, request, User.UserId(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
