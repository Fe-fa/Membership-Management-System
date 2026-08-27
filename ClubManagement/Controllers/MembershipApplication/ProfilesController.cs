using ClubManagement.Auth;
using ClubManagement.DTOs.MembershipApplication;
using ClubManagement.Services.MembershipApplication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.MembershipApplication;

[ApiController]
[Route("api/profiles")]
public class ProfilesController : ControllerBase
{
    private readonly IProfileService _profileService;

    public ProfilesController(IProfileService profileService)
    {
        _profileService = profileService;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProfileListItemDto>>> GetAll(CancellationToken cancellationToken)
    {
        var result = await _profileService.GetAllAsync(cancellationToken);
        return Ok(result);
    }

    [HttpGet("{profileId:long}")]
    public async Task<ActionResult<ProfileDetailDto>> GetById(long profileId, CancellationToken cancellationToken)
    {
        var result = await _profileService.GetByIdAsync(profileId, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<ProfileDetailDto>> Create([FromBody] CreateProfileRequest request, CancellationToken cancellationToken)
    {
        var result = await _profileService.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { profileId = result.ProfileId }, result);
    }

    [Authorize]
    [HttpPut("{profileId:long}")]
    public async Task<ActionResult<ProfileDetailDto>> Update(long profileId, [FromBody] UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        if (!User.IsStaff() && User.ProfileId() != profileId) return NotFound();
        var result = await _profileService.UpdateAsync(profileId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }
}
