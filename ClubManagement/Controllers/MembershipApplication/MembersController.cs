using ClubManagement.Data.MembershipApplication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Controllers.MembershipApplication;

[ApiController]
[Route("api/members")]
public class MembersController : ControllerBase
{
    private readonly ApplicationModuleDbContext _dbContext;

    public MembersController(ApplicationModuleDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    /// <summary>
    /// Look up proposer/seconder candidates by membership number.
    /// Returns matches even when ineligible, with a clear reason, so staff can see
    /// registration/joining-date problems instead of a blank "not found".
    /// </summary>
    [HttpGet("eligible-supporters")]
    public async Task<ActionResult<IReadOnlyList<EligibleSupporterDto>>> GetEligibleSupporters(
        [FromQuery] string? search,
        [FromQuery] int minYears = 3,
        CancellationToken cancellationToken = default)
    {
        var term = (search ?? "").Trim();
        if (term.Length < 2)
            return Ok(Array.Empty<EligibleSupporterDto>());

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var requiredYears = Math.Max(minYears, 0);
        var earliestEligibleJoin = today.AddYears(-requiredYears);

        // Find by membership number among live accounts (eligibility applied after load).
        var rows = await _dbContext.Accounts
            .AsNoTracking()
            .Where(a => !a.IsDeleted && a.MembershipNo != null && a.MembershipNo.Contains(term))
            .OrderBy(a => a.MembershipNo)
            .Take(25)
            .Select(a => new
            {
                a.ProfileId,
                a.MembershipNo,
                a.IsActive,
                ProfileActive = a.Profile.IsActive && !a.Profile.IsDeleted,
                Title = a.Profile.Title,
                FirstName = a.Profile.FirstName,
                MiddleName = a.Profile.MiddleName,
                LastName = a.Profile.LastName,
                Email = a.Profile.Email,
                Phone = a.Profile.Mobile,
                MembershipType = a.MembershipType.Name,
                JoinedDate = a.JoinedDate ?? a.StartDate,
                StatusActive = a.CurrentMemberStatus.IsActiveStatus,
                HasOpenArrears = a.Arrearses.Any(ar => ar.Status == "OPEN"),
            })
            .ToListAsync(cancellationToken);

        var members = rows.Select(a =>
        {
            var fullName = string.Join(" ", new[] { a.Title, a.FirstName, a.MiddleName, a.LastName }
                .Where(v => !string.IsNullOrWhiteSpace(v)));
            var yearOfJoining = a.JoinedDate?.Year ?? 0;
            var tenureYears = a.JoinedDate is null
                ? 0
                : Math.Max(0, today.DayNumber - a.JoinedDate.Value.DayNumber) / 365;

            string? reason = null;
            if (!a.IsActive || !a.ProfileActive)
                reason = "Membership account is not active";
            else if (!a.StatusActive)
                reason = "Member status does not allow proposing or seconding";
            else if (a.HasOpenArrears)
                reason = "Subscriptions are not in good standing (open arrears)";
            else if (a.JoinedDate is null)
                reason = "Joining date is missing on the member record — update it under Existing members";
            else if (a.JoinedDate.Value > earliestEligibleJoin)
                reason =
                    $"Only about {tenureYears} year{(tenureYears == 1 ? "" : "s")} of continuous membership (minimum {requiredYears}). " +
                    $"Joined {a.JoinedDate:dd/MM/yyyy}.";

            return new EligibleSupporterDto
            {
                ProfileId = a.ProfileId.ToString(),
                MembershipNo = a.MembershipNo ?? "",
                FullName = fullName,
                Email = a.Email ?? string.Empty,
                Phone = a.Phone ?? string.Empty,
                MembershipType = a.MembershipType,
                YearOfJoining = yearOfJoining,
                IsActive = a.IsActive && a.ProfileActive && a.StatusActive,
                InGoodStanding = !a.HasOpenArrears,
                Eligible = reason is null,
                IneligibleReason = reason,
                TenureYears = tenureYears,
            };
        }).ToList();

        return Ok(members);
    }
}

public class EligibleSupporterDto
{
    public string ProfileId { get; set; } = string.Empty;
    public string MembershipNo { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string MembershipType { get; set; } = string.Empty;
    public int YearOfJoining { get; set; }
    public bool IsActive { get; set; }
    public bool InGoodStanding { get; set; }
    public bool Eligible { get; set; }
    public string? IneligibleReason { get; set; }
    public int TenureYears { get; set; }
}
