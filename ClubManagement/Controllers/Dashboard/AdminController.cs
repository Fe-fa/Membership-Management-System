using ClubManagement.Services.Dashboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Dashboard;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN,TREASURER,COMMITTEE_MEMBER")]
public class AdminController : ControllerBase
{
    private readonly IDashboardService _dashboard;
    public AdminController(IDashboardService dashboard) => _dashboard = dashboard;

    [HttpGet("overview")]
    public async Task<ActionResult<AdminOverviewDto>> Overview(CancellationToken cancellationToken) =>
        Ok(await _dashboard.GetOverviewAsync(cancellationToken));
}
