using ClubManagement.Auth;
using ClubManagement.DTOs.Engagement;
using ClubManagement.Services.Engagement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Engagement;

[ApiController]
[Authorize]
[Route("api/admin/events")]
public class AdminEventsController : ControllerBase
{
    private readonly IClubEventService _events;

    public AdminEventsController(IClubEventService events) => _events = events;

    private bool CanManage() => User.HasAnyRole(ClubEventService.EventAdminRoles);

    [HttpGet("summary")]
    public async Task<ActionResult<EventSummaryDto>> Summary(CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _events.AdminSummaryAsync(cancellationToken));
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ClubEventDetailDto>>> List(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] string? category,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _events.AdminListAsync(search, status, category, cancellationToken));
    }

    [HttpGet("calendar")]
    public async Task<ActionResult<IReadOnlyList<ClubEventDetailDto>>> Calendar(
        [FromQuery] DateTime from,
        [FromQuery] DateTime to,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _events.CalendarAsync(from, to, publishedOnly: false, profileId: null, cancellationToken));
    }

    [HttpGet("categories")]
    public async Task<ActionResult<IReadOnlyList<EventCategoryDto>>> Categories(CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _events.CategoriesAsync(activeOnly: false, cancellationToken));
    }

    [HttpPost("categories")]
    public async Task<ActionResult<EventCategoryDto>> CreateCategory([FromBody] SaveEventCategoryRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.SaveCategoryAsync(request, null, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("categories/{id:long}")]
    public async Task<ActionResult<EventCategoryDto>> UpdateCategory(long id, [FromBody] SaveEventCategoryRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.SaveCategoryAsync(request, id, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("registrations")]
    public async Task<ActionResult<RegistrationBoardDto>> Registrations(
        [FromQuery] long? eventId,
        [FromQuery] string? search,
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _events.RegistrationsAsync(eventId, search, status, cancellationToken));
    }

    [HttpPost("registrations/{id:long}/approve")]
    public Task<ActionResult<EventRegistrationDto>> Approve(long id, CancellationToken cancellationToken) =>
        ChangeRegistration(id, "APPROVED", cancellationToken);

    [HttpPost("registrations/{id:long}/reject")]
    public Task<ActionResult<EventRegistrationDto>> Reject(long id, CancellationToken cancellationToken) =>
        ChangeRegistration(id, "REJECTED", cancellationToken);

    [HttpPost("registrations/{id:long}/cancel")]
    public Task<ActionResult<EventRegistrationDto>> CancelRegistration(long id, CancellationToken cancellationToken) =>
        ChangeRegistration(id, "CANCELLED", cancellationToken);

    [HttpPost("registrations/{id:long}/payment")]
    public async Task<ActionResult<EventRegistrationDto>> Payment(long id, [FromBody] MarkPaymentRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.SetPaymentStatusAsync(id, request.PaymentStatus, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("attendance")]
    public async Task<ActionResult<AttendanceBoardDto>> Attendance(
        [FromQuery] long? eventId,
        [FromQuery] string? search,
        [FromQuery] bool history,
        CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _events.AttendanceAsync(eventId, search, history, cancellationToken));
    }

    [HttpPost("{id:long}/attendance")]
    public async Task<ActionResult<EventRegistrationDto>> MarkAttendance(long id, [FromBody] MarkAttendanceRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.MarkAttendanceAsync(id, request, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("reports")]
    public async Task<ActionResult<EventReportDto>> Reports(CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        return Ok(await _events.ReportAsync(cancellationToken));
    }

    [HttpGet("{id:long}")]
    public async Task<ActionResult<ClubEventDetailDto>> Get(long id, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        var row = await _events.AdminGetAsync(id, cancellationToken);
        return row is null ? NotFound() : Ok(row);
    }

    [HttpPost]
    public async Task<ActionResult<ClubEventDetailDto>> Create([FromBody] SaveEventRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.SaveAdminAsync(request, User.UserId(), null, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("{id:long}")]
    public async Task<ActionResult<ClubEventDetailDto>> Update(long id, [FromBody] SaveEventRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.SaveAdminAsync(request, User.UserId(), id, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{id:long}/publish")]
    public Task<ActionResult<ClubEventDetailDto>> Publish(long id, CancellationToken cancellationToken) =>
        PublishState(id, true, cancellationToken);

    [HttpPost("{id:long}/unpublish")]
    public Task<ActionResult<ClubEventDetailDto>> Unpublish(long id, CancellationToken cancellationToken) =>
        PublishState(id, false, cancellationToken);

    [HttpPost("{id:long}/cancel")]
    public async Task<ActionResult<ClubEventDetailDto>> Cancel(long id, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.CancelEventAsync(id, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, [FromQuery] bool force, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            await _events.DeleteAdminAsync(id, force, cancellationToken);
            return Ok(new { message = "Event deleted." });
        }
        catch (EventConflictException ex) { return Conflict(new { message = ex.Message, requiresConfirmation = true }); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{id:long}/announce")]
    public async Task<IActionResult> Announce(long id, [FromBody] EventAnnouncementRequest request, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try
        {
            await _events.AnnounceAsync(id, request.Message, request.Audience, User.UserId(), cancellationToken);
            return Ok(new { message = "Announcement sent." });
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    private async Task<ActionResult<ClubEventDetailDto>> PublishState(long id, bool publish, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.SetPublishedAsync(id, publish, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    private async Task<ActionResult<EventRegistrationDto>> ChangeRegistration(long id, string status, CancellationToken cancellationToken)
    {
        if (!CanManage()) return Forbid();
        try { return Ok(await _events.SetRegistrationStatusAsync(id, status, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
