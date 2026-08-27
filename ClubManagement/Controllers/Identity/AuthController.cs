using ClubManagement.Auth;
using ClubManagement.DTOs.Identity;
using ClubManagement.Services.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClubManagement.Controllers.Identity;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    public AuthController(IAuthService auth) => _auth = auth;

    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _auth.RegisterApplicantAsync(request, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _auth.LoginAsync(request, cancellationToken)); }
        catch (InvalidOperationException ex) { return Unauthorized(new { message = ex.Message }); }
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<AuthUserDto>> Me(CancellationToken cancellationToken)
    {
        var id = User.UserId();
        if (id is null) return Unauthorized();
        var me = await _auth.MeAsync(id.Value, cancellationToken);
        return me is null ? Unauthorized() : Ok(me);
    }

    [AllowAnonymous]
    [HttpPost("set-password")]
    public async Task<IActionResult> SetPassword([FromBody] SetPasswordByTokenRequest request, CancellationToken cancellationToken)
    {
        try
        {
            await _auth.SetPasswordByTokenAsync(request.Token, request.Password, cancellationToken);
            return Ok(new { message = "Password saved. You can sign in." });
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
