using ClubManagement.Auth;
using ClubManagement.Services.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Settings;

[ApiController]
[Route("api/club-setup")]
[Authorize(Roles = "ADMIN,GENERAL_MANAGER,CHAIRMAN,TREASURER,COMMITTEE_MEMBER")]
public class ClubSetupController : ControllerBase
{
    private readonly IClubSetupService _setup;
    public ClubSetupController(IClubSetupService setup) => _setup = setup;

    [HttpGet("countries")]
    public async Task<ActionResult<IReadOnlyList<ClubSetupCountryDto>>> Countries(CancellationToken cancellationToken) =>
        Ok(await _setup.ListCountriesAsync(cancellationToken));

    [HttpPost("countries")]
    public async Task<ActionResult<ClubSetupCountryDto>> CreateCountry(
        [FromBody] ClubSetupCountryRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _setup.SaveCountryAsync(null, request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("countries/{id:long}")]
    public async Task<ActionResult<ClubSetupCountryDto>> UpdateCountry(
        long id,
        [FromBody] ClubSetupCountryRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _setup.SaveCountryAsync(id, request, User.UserId(), cancellationToken)); }
        catch (KeyNotFoundException) { return NotFound(new { message = "Country was not found." }); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("companies")]
    public async Task<ActionResult<IReadOnlyList<ClubSetupCompanyDto>>> Companies(CancellationToken cancellationToken) =>
        Ok(await _setup.ListCompaniesAsync(cancellationToken));

    [HttpPost("companies")]
    public async Task<ActionResult<ClubSetupCompanyDto>> CreateCompany(
        [FromBody] ClubSetupCompanyRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _setup.SaveCompanyAsync(null, request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("companies/{id:long}")]
    public async Task<ActionResult<ClubSetupCompanyDto>> UpdateCompany(
        long id,
        [FromBody] ClubSetupCompanyRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _setup.SaveCompanyAsync(id, request, User.UserId(), cancellationToken)); }
        catch (KeyNotFoundException) { return NotFound(new { message = "Company was not found." }); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpDelete("companies/{id:long}")]
    public async Task<IActionResult> DeleteCompany(long id, CancellationToken cancellationToken)
    {
        try
        {
            await _setup.DeleteCompanyAsync(id, cancellationToken);
            return NoContent();
        }
        catch (KeyNotFoundException) { return NotFound(new { message = "Company was not found." }); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("designations")]
    public async Task<ActionResult<IReadOnlyList<ClubSetupDesignationDto>>> Designations(CancellationToken cancellationToken) =>
        Ok(await _setup.ListDesignationsAsync(cancellationToken));

    [HttpPost("designations")]
    public async Task<ActionResult<ClubSetupDesignationDto>> CreateDesignation(
        [FromBody] ClubSetupDesignationRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _setup.SaveDesignationAsync(null, request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpPut("designations/{id:long}")]
    public async Task<ActionResult<ClubSetupDesignationDto>> UpdateDesignation(
        long id,
        [FromBody] ClubSetupDesignationRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _setup.SaveDesignationAsync(id, request, User.UserId(), cancellationToken)); }
        catch (KeyNotFoundException) { return NotFound(new { message = "Designation was not found." }); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpDelete("designations/{id:long}")]
    public async Task<IActionResult> DeleteDesignation(long id, CancellationToken cancellationToken)
    {
        try
        {
            await _setup.DeleteDesignationAsync(id, cancellationToken);
            return NoContent();
        }
        catch (KeyNotFoundException) { return NotFound(new { message = "Designation was not found." }); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
