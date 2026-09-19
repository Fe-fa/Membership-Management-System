using ClubManagement.Auth;
using ClubManagement.DTOs.Support;
using ClubManagement.Services.Support;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Support;

[ApiController]
[Route("api/support")]
[Authorize]
public class SupportController : ControllerBase
{
    private readonly ISupportService _support;
    private readonly IWebHostEnvironment _environment;

    public SupportController(ISupportService support, IWebHostEnvironment environment)
    {
        _support = support;
        _environment = environment;
    }

    [HttpGet("categories")]
    public async Task<ActionResult<IReadOnlyList<SupportCategoryDto>>> Categories(CancellationToken cancellationToken) =>
        Ok(await _support.CategoriesAsync(cancellationToken));

    [HttpGet("dashboard")]
    public async Task<ActionResult<SupportDashboardDto>> Dashboard(CancellationToken cancellationToken)
    {
        var userId = User.UserId();
        if (userId is null) return Unauthorized();
        return Ok(await _support.DashboardAsync(userId.Value, User.RoleCodes(), cancellationToken));
    }

    [HttpGet("tickets")]
    public async Task<ActionResult<IReadOnlyList<SupportTicketListItemDto>>> List(
        [FromQuery] string? scope,
        [FromQuery] string? status,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var userId = User.UserId();
        if (userId is null) return Unauthorized();
        return Ok(await _support.ListAsync(userId.Value, User.RoleCodes(), scope, status, search, cancellationToken));
    }

    [HttpGet("tickets/{ticketId:long}")]
    public async Task<ActionResult<SupportTicketDetailDto>> Get(long ticketId, CancellationToken cancellationToken)
    {
        var userId = User.UserId();
        if (userId is null) return Unauthorized();
        var row = await _support.GetAsync(ticketId, userId.Value, User.RoleCodes(), cancellationToken);
        return row is null ? NotFound() : Ok(row);
    }

    [HttpPost("tickets")]
    public async Task<ActionResult<SupportTicketDetailDto>> Create(
        [FromBody] CreateSupportTicketRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.UserId();
        var profileId = User.ProfileId();
        if (userId is null || profileId is null) return Unauthorized();
        try
        {
            return Ok(await _support.CreateAsync(request, userId.Value, profileId.Value, User.RoleCodes(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("tickets/{ticketId:long}/attachment")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<ActionResult<SupportTicketDetailDto>> Attach(
        long ticketId,
        [FromForm] IFormFile file,
        CancellationToken cancellationToken)
    {
        var userId = User.UserId();
        if (userId is null) return Unauthorized();
        if (file is null || file.Length == 0) return BadRequest(new { message = "Choose a file." });
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext is not (".pdf" or ".png" or ".jpg" or ".jpeg" or ".doc" or ".docx"))
            return BadRequest(new { message = "Attachment must be PDF, PNG, JPG or DOC." });

        var uploads = Path.Combine(_environment.WebRootPath ?? "wwwroot", "uploads");
        Directory.CreateDirectory(uploads);
        var stored = $"support-{Guid.NewGuid():N}{ext}";
        var path = Path.Combine(uploads, stored);
        await using (var stream = System.IO.File.Create(path))
            await file.CopyToAsync(stream, cancellationToken);

        try
        {
            await _support.AttachAsync(ticketId, userId.Value, User.RoleCodes(), file.FileName, $"/uploads/{stored}", cancellationToken);
            var row = await _support.GetAsync(ticketId, userId.Value, User.RoleCodes(), cancellationToken);
            return row is null ? NotFound() : Ok(row);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("tickets/{ticketId:long}/replies")]
    public async Task<ActionResult<SupportTicketDetailDto>> Reply(
        long ticketId,
        [FromBody] ReplySupportTicketRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.UserId();
        if (userId is null) return Unauthorized();
        try
        {
            return Ok(await _support.ReplyAsync(ticketId, request, userId.Value, User.RoleCodes(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("tickets/{ticketId:long}/status")]
    public async Task<ActionResult<SupportTicketDetailDto>> Status(
        long ticketId,
        [FromBody] ChangeSupportTicketStatusRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.UserId();
        if (userId is null) return Unauthorized();
        try
        {
            return Ok(await _support.ChangeStatusAsync(ticketId, request.Status, userId.Value, User.RoleCodes(), cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
