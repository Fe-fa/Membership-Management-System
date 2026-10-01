using ClubManagement.Auth;
using ClubManagement.Services.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Finance;

[ApiController]
[Route("api/finance/companies")]
[Authorize]
public class CorporateCompaniesController : ControllerBase
{
    private readonly ICorporateCompanyService _companies;
    private readonly IFinanceService _finance;

    public CorporateCompaniesController(ICorporateCompanyService companies, IFinanceService finance)
    {
        _companies = companies;
        _finance = finance;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CorporateCompanyDto>>> List(
        [FromQuery] bool activeOnly,
        CancellationToken cancellationToken) =>
        Ok(await _companies.ListAsync(activeOnly, cancellationToken));

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost]
    public async Task<ActionResult<CorporateCompanyDto>> Create(
        [FromBody] SaveCorporateCompanyRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _companies.CreateAsync(request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPut("{companyId:long}")]
    public async Task<ActionResult<CorporateCompanyDto>> Update(
        long companyId,
        [FromBody] SaveCorporateCompanyRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _companies.UpdateAsync(companyId, request, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpGet("{companyId:long}/statement")]
    public async Task<ActionResult<StatementDocumentDto>> Statement(
        long companyId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _finance.GetCorporateStatementAsync(companyId, from, to, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize(Roles = "ADMIN,GENERAL_MANAGER,TREASURER,CHAIRMAN")]
    [HttpPost("{companyId:long}/active")]
    public async Task<ActionResult<CorporateCompanyDto>> SetActive(
        long companyId,
        [FromBody] SetCorporateCompanyActiveRequest request,
        CancellationToken cancellationToken)
    {
        try { return Ok(await _companies.SetActiveAsync(companyId, request.Active, User.UserId(), cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}

public record SetCorporateCompanyActiveRequest(bool Active);
