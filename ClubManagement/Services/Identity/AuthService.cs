using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ClubManagement.Auth;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities;
using ClubManagement.Entities.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ClubManagement.Services.Identity;

public record RegisterRequest(string Password, string FirstName, string LastName, string Email, string? Mobile, string? Username = null);
/// <summary>Sign-in identifier: email (any role) or membership number (members / staff).</summary>
public record LoginRequest(string Password, string? Login = null, string? Username = null, string? Email = null);
public record AuthUserDto(
    long UserAccountId,
    long ProfileId,
    string Username,
    string FullName,
    string? Email,
    IReadOnlyList<string> Roles,
    bool MustChangePassword,
    long TenantId,
    string TenantCode,
    string TenantName);
public record AuthResponse(string AccessToken, DateTime ExpiresAt, AuthUserDto User);

public interface IAuthService
{
    Task<AuthResponse> RegisterApplicantAsync(RegisterRequest request, CancellationToken cancellationToken);
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken);
    Task<AuthUserDto?> MeAsync(long userAccountId, CancellationToken cancellationToken);
    Task SetPasswordByTokenAsync(string token, string password, CancellationToken cancellationToken);
}

public class AuthService : IAuthService
{
    private readonly ApplicationModuleDbContext _db;
    private readonly JwtOptions _jwt;
    private readonly IUserManagementService _users;
    private readonly ITenantContext _tenant;

    public AuthService(
        ApplicationModuleDbContext db,
        IOptions<JwtOptions> jwt,
        IUserManagementService users,
        ITenantContext tenant)
    {
        _db = db;
        _jwt = jwt.Value;
        _users = users;
        _tenant = tenant;
    }

    public async Task<AuthResponse> RegisterApplicantAsync(RegisterRequest request, CancellationToken cancellationToken)
    {
        var email = (request.Email ?? "").Trim();
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            throw new InvalidOperationException("Email and a password of at least 8 characters are required.");
        if (!email.Contains('@'))
            throw new InvalidOperationException("Enter a valid email address.");

        // Applicants sign in with email — store email as the account username.
        var username = string.IsNullOrWhiteSpace(request.Username) ? email.ToLowerInvariant() : request.Username.Trim();

        if (await _db.UserAccounts.AnyAsync(x => x.Username == username, cancellationToken))
            throw new InvalidOperationException("An account with that email already exists.");
        if (await _db.Profiles.AnyAsync(x => x.Email == email, cancellationToken))
            throw new InvalidOperationException("An account with that email already exists.");

        var now = DateTime.UtcNow;
        var profile = new MProfile
        {
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Email = email,
            Mobile = request.Mobile,
            DataConsentGiven = false,
            IsActive = true,
            CreatedAt = now
        };
        _db.Profiles.Add(profile);
        await _db.SaveChangesAsync(cancellationToken);

        var applicantRole = await _db.SystemRoles.FirstOrDefaultAsync(x => x.Code == "APPLICANT", cancellationToken)
            ?? throw new InvalidOperationException("APPLICANT system role is missing. Run the seed script.");

        var user = new UserAccount
        {
            ProfileId = profile.ProfileId,
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            IsActive = true,
            AccountStatus = "ACTIVE",
            MustChangePassword = false,
            EmailVerifiedAt = now,
            CreatedAt = now
        };
        _db.UserAccounts.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        _db.UserRoles.Add(new UserRole
        {
            UserAccountId = user.UserAccountId,
            RoleId = applicantRole.SystemRoleId,
            AssignedDate = DateOnly.FromDateTime(now),
            CreatedAt = now
        });
        await _db.SaveChangesAsync(cancellationToken);

        return await IssueAsync(user.UserAccountId, cancellationToken);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        var login = (request.Login ?? request.Email ?? request.Username ?? "").Trim();
        if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(request.Password))
            throw new InvalidOperationException("Enter your email or membership number, and password.");

        var user = await FindUserForLoginAsync(login, cancellationToken);

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new InvalidOperationException("Invalid email / membership number or password.");

        if (user.AccountStatus == "PENDING")
            throw new InvalidOperationException("Verify your email using the link sent by the administrator, then choose a password.");
        if (user.AccountStatus is "SUSPENDED" or "BLOCKED" or "DEACTIVATED" || !user.IsActive)
            throw new InvalidOperationException("This account is not active. Contact the club office.");

        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return await IssueAsync(user.UserAccountId, cancellationToken);
    }

    private async Task<UserAccount?> FindUserForLoginAsync(string login, CancellationToken cancellationToken)
    {
        var needle = login.Trim();
        var emailNeedle = needle.ToLowerInvariant();

        // 1) Email on profile
        var byEmail = await _db.UserAccounts
            .Include(x => x.Profile)
            .Include(x => x.UserRoles).ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(
                x => x.Profile.Email != null && x.Profile.Email.ToLower() == emailNeedle,
                cancellationToken);
        if (byEmail is not null) return byEmail;

        // 2) Membership number on club account (members / staff linked to a register)
        var profileId = await _db.Accounts
            .AsNoTracking()
            .Where(a => !a.IsDeleted && a.MembershipNo == needle)
            .Select(a => (long?)a.ProfileId)
            .FirstOrDefaultAsync(cancellationToken);
        if (profileId is long pid)
        {
            var byMembership = await _db.UserAccounts
                .Include(x => x.Profile)
                .Include(x => x.UserRoles).ThenInclude(x => x.Role)
                .FirstOrDefaultAsync(x => x.ProfileId == pid, cancellationToken);
            if (byMembership is not null) return byMembership;
        }

        // 3) Legacy username (kept so older accounts still work until everyone uses email / membership no.)
        return await _db.UserAccounts
            .Include(x => x.Profile)
            .Include(x => x.UserRoles).ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(x => x.Username == needle, cancellationToken);
    }

    public async Task<AuthUserDto?> MeAsync(long userAccountId, CancellationToken cancellationToken)
    {
        var user = await LoadUserAsync(userAccountId, cancellationToken);
        return user is null ? null : Map(user);
    }

    public Task SetPasswordByTokenAsync(string token, string password, CancellationToken cancellationToken) =>
        _users.SetPasswordByTokenAsync(token, password, cancellationToken);

    private async Task<AuthResponse> IssueAsync(long userAccountId, CancellationToken cancellationToken)
    {
        var user = await LoadUserAsync(userAccountId, cancellationToken)
            ?? throw new InvalidOperationException("User could not be loaded.");

        var dto = Map(user);
        var expires = DateTime.UtcNow.AddMinutes(Math.Max(_jwt.AccessTokenMinutes, 15));
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.UserAccountId.ToString()),
            new(ClaimTypes.NameIdentifier, user.UserAccountId.ToString()),
            new("uid", user.UserAccountId.ToString()),
            new("profileId", user.ProfileId.ToString()),
            new(ClaimTypes.Name, user.Username),
            new("tenantId", dto.TenantId.ToString()),
            new("tenantCode", dto.TenantCode),
        };
        claims.AddRange(dto.Roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SigningKey));
        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            expires: expires,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new AuthResponse(new JwtSecurityTokenHandler().WriteToken(token), expires, dto);
    }

    private Task<UserAccount?> LoadUserAsync(long userAccountId, CancellationToken cancellationToken) =>
        _db.UserAccounts
            .AsNoTracking()
            .Include(x => x.Profile)
            .Include(x => x.UserRoles).ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(x => x.UserAccountId == userAccountId, cancellationToken);

    private AuthUserDto Map(UserAccount user)
    {
        var name = string.Join(" ", new[] { user.Profile.Title, user.Profile.FirstName, user.Profile.MiddleName, user.Profile.LastName }
            .Where(v => !string.IsNullOrWhiteSpace(v)));
        var roles = user.UserRoles.Where(r => r.Role.IsActive).Select(r => r.Role.Code).Distinct().ToList();
        var tenant = _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .FirstOrDefault(t => t.TenantId == user.TenantId);
        return new AuthUserDto(
            user.UserAccountId,
            user.ProfileId,
            user.Username,
            name,
            user.Profile.Email,
            roles,
            user.MustChangePassword,
            user.TenantId,
            tenant?.Code ?? _tenant.TenantCode ?? TenantResolutionMiddleware.DefaultTenantCode,
            tenant?.Name ?? "Club");
    }
}
