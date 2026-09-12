using ClubManagement.Auth;
using ClubManagement.Services.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.MembershipApplication;

[ApiController]
[Route("api/lookup-admin")]
[Authorize(Roles = "ADMIN,GENERAL_MANAGER,CHAIRMAN")]
public class LookupAdminController : ControllerBase
{
    private readonly ILookupAdminService _lookups;
    public LookupAdminController(ILookupAdminService lookups) => _lookups = lookups;

    [HttpGet("catalogs")]
    public ActionResult<IReadOnlyList<LookupCatalogDto>> Catalogs([FromQuery] string? search) =>
        Ok(_lookups.ListCatalogs(search));

    [HttpGet("{key}/rows")]
    public async Task<ActionResult<IReadOnlyList<LookupRowDto>>> Rows(string key, CancellationToken cancellationToken)
    {
        try { return Ok(await _lookups.ListRowsAsync(key, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPost("{key}/rows")]
    public async Task<ActionResult<LookupRowDto>> Create(string key, [FromBody] LookupUpsertRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _lookups.CreateAsync(key, request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("{key}/rows/{id:long}")]
    public async Task<ActionResult<LookupRowDto>> Update(string key, long id, [FromBody] LookupUpsertRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _lookups.UpdateAsync(key, id, request, User.UserId(), cancellationToken)); }
        catch (KeyNotFoundException) { return NotFound(new { message = "Row was not found." }); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
