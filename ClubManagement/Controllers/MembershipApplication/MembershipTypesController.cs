using System.Text.RegularExpressions;
using ClubManagement.Auth;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Lookups;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Controllers.MembershipApplication;

[ApiController]
[EnableCors("Open")]
[Route("api/membership-types")]
public class MembershipTypesController : ControllerBase
{
    private const string ManageRoles = "ADMIN,GENERAL_MANAGER,CHAIRMAN,TREASURER,COMMITTEE_MEMBER";
    private static readonly Regex CodePattern = new(@"^[A-Z][A-Z0-9_]{0,39}$", RegexOptions.Compiled);

    private readonly ApplicationModuleDbContext _dbContext;

    public MembershipTypesController(ApplicationModuleDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<MembershipTypeOptionDto>>> GetAll(CancellationToken cancellationToken)
    {
        var rows = await _dbContext.MembershipTypes
            .AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new MembershipTypeOptionDto
            {
                MembershipTypeId = x.MembershipTypeId,
                Code = x.Code,
                Name = x.Name,
                Description = x.Description,
                CanVote = x.CanVote,
                CanRunForOffice = x.CanRunForOffice,
                ReciprocationAllowed = x.ReciprocationAllowed,
                CanIntroduceGuests = x.CanIntroduceGuests,
                CanAccessSubscriptions = x.CanAccessSubscriptions,
                CanAccessCommittee = x.CanAccessCommittee,
                CanAccessAccommodation = x.CanAccessAccommodation,
                CanAccessEndorsements = x.CanAccessEndorsements,
                CanAccessDocuments = x.CanAccessDocuments,
                IsPermanent = x.IsPermanent,
                MaxDurationDays = x.MaxDurationDays,
            })
            .ToListAsync(cancellationToken);

        return Ok(rows);
    }

    [Authorize(Roles = ManageRoles)]
    [HttpPost]
    [HttpPost("create")]
    [Consumes("application/json")]
    public async Task<ActionResult<MembershipTypeOptionDto>> Create(
        [FromBody] CreateMembershipTypeRequest request,
        CancellationToken cancellationToken)
    {
        var code = NormalizeCode(request.Code);
        var name = request.Name?.Trim() ?? "";
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        if (string.IsNullOrWhiteSpace(code) || !CodePattern.IsMatch(code))
            return BadRequest(new { message = "Membership type code is required (letters, numbers, and underscores; start with a letter)." });
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Membership name is required." });

        var exists = await _dbContext.MembershipTypes.AnyAsync(
            x => x.Code == code,
            cancellationToken);
        if (exists)
            return BadRequest(new { message = $"A membership type with code {code} already exists." });

        var nextSort = await _dbContext.MembershipTypes.MaxAsync(x => (int?)x.SortOrder, cancellationToken) ?? 0;

        var type = new MembershipType
        {
            Code = code,
            Name = name,
            Description = description,
            SortOrder = nextSort + 1,
            IsActive = true,
            CanVote = false,
            CanRunForOffice = false,
            ReciprocationAllowed = false,
            CanIntroduceGuests = false,
            CanAccessSubscriptions = false,
            CanAccessCommittee = false,
            CanAccessAccommodation = false,
            CanAccessEndorsements = false,
            CanAccessDocuments = false,
            IsPermanent = false,
            MaxDurationDays = null,
            CreatedAt = DateTime.UtcNow,
            UpdatedByUserId = User.UserId(),
        };
        _dbContext.MembershipTypes.Add(type);
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return BadRequest(new { message = $"A membership type with code {code} already exists." });
        }

        return Ok(Map(type));
    }

    [Authorize(Roles = ManageRoles)]
    [HttpPut("{membershipTypeId:long}")]
    [Consumes("application/json")]
    public async Task<ActionResult<MembershipTypeOptionDto>> Update(
        long membershipTypeId,
        [FromBody] CreateMembershipTypeRequest request,
        CancellationToken cancellationToken)
    {
        var type = await _dbContext.MembershipTypes.FirstOrDefaultAsync(
            x => x.MembershipTypeId == membershipTypeId,
            cancellationToken);
        if (type is null) return NotFound();

        var code = NormalizeCode(request.Code);
        var name = request.Name?.Trim() ?? "";
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        if (string.IsNullOrWhiteSpace(code) || !CodePattern.IsMatch(code))
            return BadRequest(new { message = "Membership type code is required (letters, numbers, and underscores; start with a letter)." });
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Membership name is required." });

        var exists = await _dbContext.MembershipTypes.AnyAsync(
            x => x.Code == code && x.MembershipTypeId != membershipTypeId,
            cancellationToken);
        if (exists)
            return BadRequest(new { message = $"A membership type with code {code} already exists." });

        type.Code = code;
        type.Name = name;
        type.Description = description;
        type.UpdatedByUserId = User.UserId();
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return BadRequest(new { message = $"A membership type with code {code} already exists." });
        }

        return Ok(Map(type));
    }

    [Authorize(Roles = ManageRoles)]
    [HttpDelete("{membershipTypeId:long}")]
    public async Task<IActionResult> Delete(long membershipTypeId, CancellationToken cancellationToken)
    {
        var type = await _dbContext.MembershipTypes.FirstOrDefaultAsync(
            x => x.MembershipTypeId == membershipTypeId,
            cancellationToken);
        if (type is null) return NotFound();

        var members = await _dbContext.Accounts.CountAsync(
            a => a.MembershipTypeId == membershipTypeId && !a.IsDeleted,
            cancellationToken);
        if (members > 0)
            return BadRequest(new { message = $"Cannot delete {type.Name} — {members} member(s) are assigned to this class." });

        var fees = await _dbContext.MembershipFeeSchedules.AnyAsync(
            f => f.MembershipTypeId == membershipTypeId,
            cancellationToken);
        if (fees)
            return BadRequest(new { message = $"Cannot delete {type.Name} — fee schedules still reference this class." });

        _dbContext.MembershipTypes.Remove(type);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Roles = ManageRoles)]
    [HttpPut("{membershipTypeId:long}/privileges")]
    public async Task<ActionResult<MembershipTypeOptionDto>> UpdatePrivileges(
        long membershipTypeId,
        [FromBody] MembershipTypePrivilegesRequest request,
        CancellationToken cancellationToken)
    {
        var type = await _dbContext.MembershipTypes.FirstOrDefaultAsync(
            x => x.MembershipTypeId == membershipTypeId,
            cancellationToken);
        if (type is null) return NotFound();

        type.CanVote = request.CanVote;
        type.CanRunForOffice = request.CanRunForOffice;
        type.ReciprocationAllowed = request.ReciprocationAllowed;
        type.CanIntroduceGuests = request.CanIntroduceGuests;
        type.CanAccessSubscriptions = request.CanAccessSubscriptions;
        type.CanAccessCommittee = request.CanAccessCommittee;
        type.CanAccessAccommodation = request.CanAccessAccommodation;
        type.CanAccessEndorsements = request.CanAccessEndorsements;
        type.CanAccessDocuments = request.CanAccessDocuments;
        type.IsPermanent = request.IsPermanent;
        type.MaxDurationDays = request.MaxDurationDays;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(Map(type));
    }

    private static MembershipTypeOptionDto Map(Entities.Lookups.MembershipType type) => new()
    {
        MembershipTypeId = type.MembershipTypeId,
        Code = type.Code,
        Name = type.Name,
        Description = type.Description,
        CanVote = type.CanVote,
        CanRunForOffice = type.CanRunForOffice,
        ReciprocationAllowed = type.ReciprocationAllowed,
        CanIntroduceGuests = type.CanIntroduceGuests,
        CanAccessSubscriptions = type.CanAccessSubscriptions,
        CanAccessCommittee = type.CanAccessCommittee,
        CanAccessAccommodation = type.CanAccessAccommodation,
        CanAccessEndorsements = type.CanAccessEndorsements,
        CanAccessDocuments = type.CanAccessDocuments,
        IsPermanent = type.IsPermanent,
        MaxDurationDays = type.MaxDurationDays,
    };

    private static string NormalizeCode(string? raw)
    {
        var value = (raw ?? "").Trim().ToUpperInvariant().Replace(' ', '_');
        return Regex.Replace(value, @"[^A-Z0-9_]", "");
    }
}

public class MembershipTypeOptionDto
{
    public long MembershipTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool CanVote { get; set; }
    public bool CanRunForOffice { get; set; }
    public bool ReciprocationAllowed { get; set; }
    public bool CanIntroduceGuests { get; set; }
    public bool CanAccessSubscriptions { get; set; }
    public bool CanAccessCommittee { get; set; }
    public bool CanAccessAccommodation { get; set; }
    public bool CanAccessEndorsements { get; set; }
    public bool CanAccessDocuments { get; set; }
    public bool IsPermanent { get; set; }
    public int? MaxDurationDays { get; set; }
}

public class CreateMembershipTypeRequest
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public record MembershipTypePrivilegesRequest(
    bool CanVote,
    bool CanRunForOffice,
    bool ReciprocationAllowed,
    bool CanIntroduceGuests,
    bool CanAccessSubscriptions,
    bool CanAccessCommittee,
    bool CanAccessAccommodation,
    bool CanAccessEndorsements,
    bool CanAccessDocuments,
    bool IsPermanent,
    int? MaxDurationDays);
