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
    public async Task<ActionResult<RegisterResult>> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _auth.RegisterApplicantAsync(request, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [AllowAnonymous]
    [HttpPost("verify-email")]
    public async Task<ActionResult<AuthResponse>> VerifyEmail([FromBody] VerifyEmailRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _auth.VerifyEmailAsync(request, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [AllowAnonymous]
    [HttpPost("resend-verification")]
    public async Task<ActionResult<RegisterResult>> ResendVerification([FromBody] VerifyEmailRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _auth.ResendVerificationAsync(request.Email, cancellationToken)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        try { return Ok(await _auth.LoginAsync(request, cancellationToken)); }
        catch (EmailVerificationRequiredException ex)
        {
            return Unauthorized(new { message = ex.Message, verificationRequired = true, email = ex.Email });
        }
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

    [Authorize]
    [HttpPut("me")]
    public async Task<ActionResult<AuthUserDto>> UpdateMe([FromBody] UpdateMeRequest request, CancellationToken cancellationToken)
    {
        var id = User.UserId();
        if (id is null) return Unauthorized();
        try
        {
            var me = await _auth.UpdateMeAsync(id.Value, request, cancellationToken);
            return me is null ? Unauthorized() : Ok(me);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [Authorize]
    [HttpPost("me/password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangeMyPasswordRequest request, CancellationToken cancellationToken)
    {
        var id = User.UserId();
        if (id is null) return Unauthorized();  
        try
        {
            await _auth.ChangeMyPasswordAsync(id.Value, request, cancellationToken);
            return Ok(new { message = "Password updated." });
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [AllowAnonymous]
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        try
        {
            await _auth.RequestPasswordResetAsync(request.Email, cancellationToken);
            return Ok(new { message = "If an account exists for that email, we sent a reset link. It expires in 30 minutes." });
        }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
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
