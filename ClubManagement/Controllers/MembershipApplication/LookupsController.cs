using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Lookups;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Controllers.MembershipApplication;

[ApiController]
[Route("api/lookups")]
[AllowAnonymous]
public class LookupsController : ControllerBase
{
    private readonly ApplicationModuleDbContext _dbContext;

    public LookupsController(ApplicationModuleDbContext dbContext)
    {
        _dbContext = dbContext;
    }


    private static readonly IReadOnlyDictionary<string, string> TableNames =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["genders"] = "Gender",
            ["blood-groups"] = "blood_group",
            ["marital-status"] = "Marital_status",
            ["countries"] = "Country",
            ["license-types"] = "License_type",
            ["aircraft-types"] = "Aircraft_type",
            ["affiliation-types"] = "Affiliation_type",
            ["relationship-types"] = "Relationship_type",
            ["club-types"] = "Club_type",
            ["membership-types"] = "Membership_type",
            ["election-types"] = "Election_type",
            ["member-statuses"] = "Member_status",
            ["document-types"] = "Document_type",
            ["application-status"] = "Application_status",
            ["payment-methods"] = "Payment_method",
            ["payment-status"] = "Payment_status",
            ["fee-types"] = "Fee_type",
            ["guest-status"] = "Guest_status",
            ["committee-roles"] = "Committee_role",
            ["meeting-types"] = "Meeting_type",
            ["system-roles"] = "System_role",
        };

    [HttpGet("{table}")]
    public async Task<ActionResult<IReadOnlyList<LookupOptionDto>>> Get(
        string table,
        CancellationToken cancellationToken)
    {
        if (!TableNames.ContainsKey(table))
        {
            return NotFound(new { message = $"Unknown lookup table '{table}'." });
        }

        var query = table.ToLowerInvariant() switch
        {
            "genders" => _dbContext.Genders
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "blood-groups" => _dbContext.BloodGroups
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "marital-status" => _dbContext.MaritalStatuses
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "countries" => _dbContext.Countries
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.CountryName)
                .Select(x => new LookupOptionDto(x.CountryCode, x.CountryName, x.SortOrder)),

            // License_type has no sort_order column — order by name, sortOrder 0.
            "license-types" => _dbContext.LicenseTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, 0)),

            "aircraft-types" => _dbContext.AircraftTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "affiliation-types" => _dbContext.AffiliationTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "relationship-types" => _dbContext.RelationshipTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "club-types" => _dbContext.ClubTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "membership-types" => _dbContext.MembershipTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder, x.MembershipTypeId)),

            "election-types" => _dbContext.ElectionTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder, x.ElectionTypeId)),

            "member-statuses" => _dbContext.MemberStatuses
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "document-types" => _dbContext.DocumentTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "application-status" => _dbContext.ApplicationStatuses
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "payment-methods" => _dbContext.PaymentMethods
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder, x.PaymentMethodId)),

            "payment-status" => _dbContext.PaymentStatuses
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "fee-types" => _dbContext.FeeTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "guest-status" => _dbContext.GuestStatuses
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            "committee-roles" => _dbContext.CommitteeRoles
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder, x.CommitteeRoleId)),

            "meeting-types" => _dbContext.MeetingTypes
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder, x.MeetingTypeId)),

            "system-roles" => _dbContext.SystemRoles
                .AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new LookupOptionDto(x.Code, x.Name, x.SortOrder)),

            _ => throw new InvalidOperationException("Unreachable — slug is whitelisted above."),
        };

        return Ok(await query.ToListAsync(cancellationToken));
    }
}

/// <summary>Shape returned to the wizard: { code, name, sortOrder }.</summary>
public sealed record LookupOptionDto(string Code, string Name, int SortOrder, long Id = 0);