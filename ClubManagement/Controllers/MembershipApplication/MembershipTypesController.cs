using ClubManagement.Data.MembershipApplication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Controllers.MembershipApplication;

[ApiController]
[Route("api/membership-types")]
public class MembershipTypesController : ControllerBase
{
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

    [Authorize(Roles = "GENERAL_MANAGER,CHAIRMAN,ADMIN")]
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
