using System.Security.Cryptography;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Identity;
using ClubManagement.Entities;
using ClubManagement.Entities.Identity;
using ClubManagement.Services.MembershipAccount;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.Identity;

public interface IUserManagementService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<UserListResponse> ListAsync(string? search, string? status, string? role, int page, int pageSize, CancellationToken cancellationToken);
    Task<IReadOnlyList<RoleOptionDto>> AssignableRolesAsync(CancellationToken cancellationToken);
    Task<UserDetailDto?> GetAsync(long userAccountId, CancellationToken cancellationToken);
    Task<CreateStaffUserResponse> CreateAsync(CreateStaffUserRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<UserDetailDto?> UpdateAsync(long userAccountId, UpdateUserRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<UserDetailDto?> AssignRoleAsync(long userAccountId, string roleCode, long? actorUserId, CancellationToken cancellationToken);
    Task<UserDetailDto?> AssignRolesAsync(long userAccountId, IReadOnlyList<string> roleCodes, long? actorUserId, CancellationToken cancellationToken);
    Task<UserDetailDto?> ChangeStatusAsync(long userAccountId, string status, long? actorUserId, CancellationToken cancellationToken);
    Task<UserDetailDto?> SetPasswordAsync(long userAccountId, string password, long? actorUserId, CancellationToken cancellationToken);
    Task<InviteResult?> SendResetLinkAsync(long userAccountId, long? actorUserId, CancellationToken cancellationToken);
    Task DeleteAsync(long userAccountId, long? actorUserId, CancellationToken cancellationToken);
    Task SetPasswordByTokenAsync(string token, string password, CancellationToken cancellationToken);
    Task<InviteResult> CreateLoginForProfileAsync(long profileId, string username, string email, string firstName, string roleCode, long? actorUserId, CancellationToken cancellationToken);
}

public class UserManagementService : IUserManagementService
{
    public static readonly string[] AssignableRoleCodes =
    [
        "ADMIN",
        "GENERAL_MANAGER",
        "CHAIRMAN",
        "TREASURER",
        "COMMITTEE_MEMBER",
        "MEMBER",
        "RECEPTIONIST"
    ];

    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailSender _email;
    private readonly AppPublicOptions _app;
    private readonly IMemberAccountProvisioner _membership;

    public UserManagementService(ApplicationModuleDbContext db, IEmailSender email, IOptions<AppPublicOptions> app, IMemberAccountProvisioner membership)
    {
        _db = db;
        _email = email;
        _app = app.Value;
        _membership = membership;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.User_account', N'account_status') IS NULL
    ALTER TABLE dbo.User_account ADD account_status NVARCHAR(30) NOT NULL CONSTRAINT DF_user_account_status DEFAULT(N'ACTIVE');
", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.User_account', N'must_change_password') IS NULL
    ALTER TABLE dbo.User_account ADD must_change_password BIT NOT NULL CONSTRAINT DF_user_must_change_pwd DEFAULT(0);
", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.User_account', N'email_verified_at') IS NULL
    ALTER TABLE dbo.User_account ADD email_verified_at DATETIME2 NULL;
", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.User_account', N'password_reset_token') IS NULL
    ALTER TABLE dbo.User_account ADD password_reset_token NVARCHAR(120) NULL;
", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.User_account', N'password_reset_expires_at') IS NULL
    ALTER TABLE dbo.User_account ADD password_reset_expires_at DATETIME2 NULL;
", cancellationToken);

        foreach (var (code, name, sort) in new (string, string, int)[]
        {
            ("ADMIN", "Admin", 5),
            ("RECEPTIONIST", "Receptionist", 70)
        })
        {
            if (!await _db.SystemRoles.AnyAsync(x => x.Code == code, cancellationToken))
            {
                _db.SystemRoles.Add(new SystemRole
                {
                    Code = code,
                    Name = name,
                    SortOrder = sort,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<UserListResponse> ListAsync(string? search, string? status, string? role, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);

        var query = _db.UserAccounts.AsNoTracking()
            .Include(x => x.Profile)
            .Include(x => x.UserRoles).ThenInclude(x => x.Role)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var needle = search.Trim();
            query = query.Where(x =>
                x.Username.Contains(needle) ||
                x.Profile.FirstName.Contains(needle) ||
                x.Profile.LastName.Contains(needle) ||
                (x.Profile.Email != null && x.Profile.Email.Contains(needle)) ||
                (x.Profile.Mobile != null && x.Profile.Mobile.Contains(needle)));
        }

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(x => x.AccountStatus == status.Trim().ToUpperInvariant());
        }

        if (!string.IsNullOrWhiteSpace(role) && !role.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            var roleCode = role.Trim().ToUpperInvariant();
            query = query.Where(x => x.UserRoles.Any(r => r.Role.Code == roleCode));
        }

        var total = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderBy(x => x.Profile.LastName).ThenBy(x => x.Profile.FirstName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new UserListResponse
        {
            Items = rows.Select(MapList).ToList(),
            Total = total,
            Page = page,
            PageSize = pageSize
        };
    }

    public async Task<IReadOnlyList<RoleOptionDto>> AssignableRolesAsync(CancellationToken cancellationToken)
    {
        // Dynamic from System_role — applicants self-register, so they are excluded from staff assignment.
        var rows = await _db.SystemRoles.AsNoTracking()
            .Where(x => x.IsActive && x.Code != "APPLICANT")
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .ToListAsync(cancellationToken);
        return rows
            .Select(x => new RoleOptionDto
            {
                Id = x.SystemRoleId,
                Code = x.Code,
                Name = x.Name,
                Description = x.Description,
                SortOrder = x.SortOrder
            })
            .ToList();
    }

    public async Task<UserDetailDto?> GetAsync(long userAccountId, CancellationToken cancellationToken)
    {
        var user = await LoadAsync(userAccountId, cancellationToken);
        return user is null ? null : MapDetail(user);
    }

    public async Task<CreateStaffUserResponse> CreateAsync(CreateStaffUserRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var roleCodes = NormalizeRoleSet(request.RoleCodes, request.RoleCode, allowApplicant: false);
        var email = request.Email.Trim();
        if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName) || string.IsNullOrWhiteSpace(email))
            throw new InvalidOperationException("First name, last name and email are required.");

        var needsMembershipNo = RolesRequireMembershipNo(roleCodes);
        var membershipNo = (request.MembershipNo ?? "").Trim();
        if (needsMembershipNo && string.IsNullOrWhiteSpace(membershipNo))
            throw new InvalidOperationException("Membership number is required for the selected role(s).");

        var username = string.IsNullOrWhiteSpace(request.Username)
            ? (needsMembershipNo && !string.IsNullOrWhiteSpace(membershipNo) ? membershipNo : email)
            : request.Username.Trim();

        if (await _db.UserAccounts.AnyAsync(x => x.Username == username, cancellationToken))
            throw new InvalidOperationException("That username is already taken.");
        if (await _db.Profiles.AnyAsync(x => x.Email == email, cancellationToken))
            throw new InvalidOperationException("That email is already in use.");

        var roles = await ResolveActiveRolesAsync(roleCodes, cancellationToken);
        var now = DateTime.UtcNow;
        var profile = new MProfile
        {
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Email = email,
            Mobile = string.IsNullOrWhiteSpace(request.Mobile) ? null : request.Mobile.Trim(),
            MembershipNo = needsMembershipNo ? membershipNo : null,
            IsActive = true,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.Profiles.Add(profile);
        await _db.SaveChangesAsync(cancellationToken);

        var user = new UserAccount
        {
            ProfileId = profile.ProfileId,
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(Convert.ToHexString(RandomNumberGenerator.GetBytes(16))),
            IsActive = false,
            AccountStatus = "PENDING",
            MustChangePassword = true,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.UserAccounts.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        foreach (var role in roles)
        {
            _db.UserRoles.Add(new UserRole
            {
                UserAccountId = user.UserAccountId,
                RoleId = role.SystemRoleId,
                AssignedDate = DateOnly.FromDateTime(now),
                CreatedAt = now,
                CreatedByUserId = actorUserId
            });
        }
        await _db.SaveChangesAsync(cancellationToken);

        if (needsMembershipNo)
            await _membership.EnsureAccountWithMembershipNoAsync(profile.ProfileId, membershipNo, actorUserId, cancellationToken);
        else if (roleCodes.Contains("MEMBER", StringComparer.OrdinalIgnoreCase))
            await _membership.EnsureForMemberRoleAsync(profile.ProfileId, actorUserId, cancellationToken);

        var invite = await IssueInviteAsync(user, email, request.FirstName.Trim(), cancellationToken);
        var created = await GetAsync(user.UserAccountId, cancellationToken)
            ?? throw new InvalidOperationException("User could not be reloaded.");
        return new CreateStaffUserResponse { User = created, InviteUrl = invite.InviteUrl, EmailSent = invite.EmailSent };
    }

    public async Task<InviteResult> CreateLoginForProfileAsync(
        long profileId,
        string username,
        string email,
        string firstName,
        string roleCode,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var code = NormalizeAssignable(roleCode);
        var userName = username.Trim();
        var mail = email.Trim();
        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(mail))
            throw new InvalidOperationException("Username and email are required to create a portal login.");
        if (await _db.UserAccounts.AnyAsync(x => x.Username == userName, cancellationToken))
            throw new InvalidOperationException("That username is already taken.");
        if (await _db.UserAccounts.AnyAsync(x => x.ProfileId == profileId, cancellationToken))
            throw new InvalidOperationException("This member already has a portal login.");

        var role = await _db.SystemRoles.FirstOrDefaultAsync(x => x.Code == code, cancellationToken)
            ?? throw new InvalidOperationException($"Role '{code}' was not found. Restart the API so roles can seed.");

        var now = DateTime.UtcNow;
        var user = new UserAccount
        {
            ProfileId = profileId,
            Username = userName,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(Convert.ToHexString(RandomNumberGenerator.GetBytes(16))),
            IsActive = false,
            AccountStatus = "PENDING",
            MustChangePassword = true,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.UserAccounts.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        _db.UserRoles.Add(new UserRole
        {
            UserAccountId = user.UserAccountId,
            RoleId = role.SystemRoleId,
            AssignedDate = DateOnly.FromDateTime(now),
            CreatedAt = now,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);

        return await IssueInviteAsync(user, mail, firstName, cancellationToken);
    }

    public async Task<UserDetailDto?> UpdateAsync(long userAccountId, UpdateUserRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var user = await LoadAsync(userAccountId, cancellationToken);
        if (user is null) return null;

        var email = request.Email.Trim();
        var username = string.IsNullOrWhiteSpace(request.Username) ? user.Username : request.Username.Trim();
        if (await _db.UserAccounts.AnyAsync(x => x.Username == username && x.UserAccountId != userAccountId, cancellationToken))
            throw new InvalidOperationException("That username is already taken.");

        user.Username = username;
        user.UpdatedByUserId = actorUserId;
        user.Profile.FirstName = request.FirstName.Trim();
        user.Profile.LastName = request.LastName.Trim();
        user.Profile.Email = email;
        user.Profile.Mobile = string.IsNullOrWhiteSpace(request.Mobile) ? null : request.Mobile.Trim();
        user.Profile.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return MapDetail(user);
    }

    public async Task<UserDetailDto?> AssignRoleAsync(long userAccountId, string roleCode, long? actorUserId, CancellationToken cancellationToken) =>
        await AssignRolesAsync(userAccountId, [roleCode], actorUserId, cancellationToken);

    public async Task<UserDetailDto?> AssignRolesAsync(
        long userAccountId,
        IReadOnlyList<string> roleCodes,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var user = await LoadAsync(userAccountId, cancellationToken);
        if (user is null) return null;

        var codes = NormalizeRoleSet(roleCodes, null, allowApplicant: true);
        var roles = await ResolveActiveRolesAsync(codes, cancellationToken);

        var current = user.UserRoles.Select(r => r.Role.Code).ToList();
        if (current.Contains("GENERAL_MANAGER", StringComparer.OrdinalIgnoreCase)
            && !codes.Contains("GENERAL_MANAGER", StringComparer.OrdinalIgnoreCase))
        {
            var otherGm = await _db.UserRoles.CountAsync(
                x => x.Role.Code == "GENERAL_MANAGER" && x.UserAccountId != userAccountId,
                cancellationToken);
            if (otherGm == 0)
                throw new InvalidOperationException("Cannot remove the last General Manager.");
        }

        if (current.Contains("ADMIN", StringComparer.OrdinalIgnoreCase)
            && !codes.Contains("ADMIN", StringComparer.OrdinalIgnoreCase))
        {
            var otherAdmin = await _db.UserRoles.CountAsync(
                x => x.Role.Code == "ADMIN" && x.UserAccountId != userAccountId,
                cancellationToken);
            if (otherAdmin == 0)
                throw new InvalidOperationException("Cannot remove the last Admin.");
        }

        _db.UserRoles.RemoveRange(user.UserRoles);
        user.UserRoles.Clear();
        var now = DateTime.UtcNow;
        foreach (var role in roles)
        {
            user.UserRoles.Add(new UserRole
            {
                UserAccountId = user.UserAccountId,
                RoleId = role.SystemRoleId,
                AssignedDate = DateOnly.FromDateTime(now),
                CreatedAt = now,
                CreatedByUserId = actorUserId
            });
        }
        user.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);

        if (codes.Contains("MEMBER", StringComparer.OrdinalIgnoreCase))
            await _membership.EnsureForMemberRoleAsync(user.ProfileId, actorUserId, cancellationToken);

        return await GetAsync(userAccountId, cancellationToken);
    }

    public async Task<UserDetailDto?> ChangeStatusAsync(long userAccountId, string status, long? actorUserId, CancellationToken cancellationToken)
    {
        var user = await LoadAsync(userAccountId, cancellationToken);
        if (user is null) return null;
        var next = status.Trim().ToUpperInvariant();
        if (next is not ("ACTIVE" or "PENDING" or "SUSPENDED" or "BLOCKED" or "DEACTIVATED"))
            throw new InvalidOperationException("Status must be Active, Pending, Suspended, Blocked or Deactivated.");

        if (next != "ACTIVE" && user.UserRoles.Any(r => r.Role.Code == "GENERAL_MANAGER"))
        {
            var otherActiveGm = await _db.UserAccounts.CountAsync(
                x => x.UserAccountId != userAccountId && x.AccountStatus == "ACTIVE" && x.UserRoles.Any(r => r.Role.Code == "GENERAL_MANAGER"),
                cancellationToken);
            if (otherActiveGm == 0)
                throw new InvalidOperationException("Cannot suspend or deactivate the last active General Manager.");
        }

        user.AccountStatus = next;
        user.IsActive = next == "ACTIVE";
        user.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return MapDetail(user);
    }

    public async Task<UserDetailDto?> SetPasswordAsync(long userAccountId, string password, long? actorUserId, CancellationToken cancellationToken)
    {
        RequirePassword(password);
        var user = await LoadAsync(userAccountId, cancellationToken);
        if (user is null) return null;
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
        user.MustChangePassword = true;
        user.PasswordResetToken = null;
        user.PasswordResetExpiresAt = null;
        if (user.AccountStatus == "PENDING")
        {
            user.AccountStatus = "ACTIVE";
            user.IsActive = true;
            user.EmailVerifiedAt = DateTime.UtcNow;
        }
        user.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return MapDetail(user);
    }

    public async Task<InviteResult?> SendResetLinkAsync(long userAccountId, long? actorUserId, CancellationToken cancellationToken)
    {
        var user = await LoadAsync(userAccountId, cancellationToken);
        if (user is null) return null;
        user.UpdatedByUserId = actorUserId;
        user.MustChangePassword = true;
        return await IssueInviteAsync(user, user.Profile.Email ?? "", user.Profile.FirstName, cancellationToken);
    }

    public async Task DeleteAsync(long userAccountId, long? actorUserId, CancellationToken cancellationToken)
    {
        var user = await LoadAsync(userAccountId, cancellationToken)
            ?? throw new InvalidOperationException("User was not found.");
        if (user.UserRoles.Any(r => r.Role.Code is "GENERAL_MANAGER" or "ADMIN"))
        {
            var others = await _db.UserRoles.CountAsync(
                x => x.UserAccountId != userAccountId && (x.Role.Code == "GENERAL_MANAGER" || x.Role.Code == "ADMIN"),
                cancellationToken);
            if (others == 0)
                throw new InvalidOperationException("Cannot delete the last administrator.");
        }
        if (actorUserId == userAccountId)
            throw new InvalidOperationException("You cannot delete your own account.");

        _db.UserRoles.RemoveRange(user.UserRoles);
        _db.UserAccounts.Remove(user);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task SetPasswordByTokenAsync(string token, string password, CancellationToken cancellationToken)
    {
        RequirePassword(password);
        var user = await _db.UserAccounts
            .Include(x => x.Profile)
            .FirstOrDefaultAsync(x => x.PasswordResetToken == token, cancellationToken)
            ?? throw new InvalidOperationException("This invite or reset link is invalid.");
        if (user.PasswordResetExpiresAt is null || user.PasswordResetExpiresAt < DateTime.UtcNow)
            throw new InvalidOperationException("This invite or reset link has expired. Ask an administrator to send a new one.");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
        user.MustChangePassword = false;
        user.PasswordResetToken = null;
        user.PasswordResetExpiresAt = null;
        user.EmailVerifiedAt = DateTime.UtcNow;
        user.AccountStatus = "ACTIVE";
        user.IsActive = true;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<InviteResult> IssueInviteAsync(UserAccount user, string email, string firstName, CancellationToken cancellationToken)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        user.PasswordResetToken = token;
        user.PasswordResetExpiresAt = DateTime.UtcNow.AddDays(7);
        user.MustChangePassword = true;
        await _db.SaveChangesAsync(cancellationToken);

        var baseUrl = (_app.PublicBaseUrl ?? "http://localhost:8080").TrimEnd('/');
        var inviteUrl = $"{baseUrl}/set-password?token={Uri.EscapeDataString(token)}";
        var sent = false;
        if (!string.IsNullOrWhiteSpace(email))
        {
            var body =
                $"Hello {firstName},\n\n" +
                "An Aero Club of East Africa administrator created a portal account for you.\n" +
                $"Username: {user.Username}\n\n" +
                "Open this link to choose a password (valid for 7 days), then sign in at the Club website:\n" +
                $"{inviteUrl}\n\n" +
                "If you did not expect this message, ignore it.\n";
            sent = await _email.SendAsync(email, "Verify your Aero Club account", body, cancellationToken);
        }
        return new InviteResult { InviteUrl = inviteUrl, EmailSent = sent };
    }

    private async Task<UserAccount?> LoadAsync(long userAccountId, CancellationToken cancellationToken) =>
        await _db.UserAccounts
            .Include(x => x.Profile)
            .Include(x => x.UserRoles).ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(x => x.UserAccountId == userAccountId, cancellationToken);

    private static string NormalizeAssignable(string? roleCode)
    {
        var code = (roleCode ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(code))
            throw new InvalidOperationException("At least one role is required.");
        return code;
    }

    private static List<string> NormalizeRoleSet(IEnumerable<string>? roleCodes, string? legacyRoleCode, bool allowApplicant = false)
    {
        var codes = (roleCodes ?? [])
            .Concat(string.IsNullOrWhiteSpace(legacyRoleCode) ? [] : [legacyRoleCode])
            .Select(NormalizeAssignable)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (!allowApplicant)
            codes = codes.Where(c => !string.Equals(c, "APPLICANT", StringComparison.OrdinalIgnoreCase)).ToList();
        if (codes.Count == 0)
            throw new InvalidOperationException("Select at least one role.");
        return codes;
    }

    private async Task<List<SystemRole>> ResolveActiveRolesAsync(IReadOnlyList<string> codes, CancellationToken cancellationToken)
    {
        var roles = await _db.SystemRoles
            .Where(x => x.IsActive && codes.Contains(x.Code))
            .ToListAsync(cancellationToken);
        var missing = codes
            .Where(c => roles.All(r => !string.Equals(r.Code, c, StringComparison.OrdinalIgnoreCase)))
            .ToList();
        if (missing.Count > 0)
            throw new InvalidOperationException($"Role(s) not found in System_role: {string.Join(", ", missing)}.");
        return roles;
    }

    /// <summary>Membership no. required unless every selected role is ADMIN-only.</summary>
    private static bool RolesRequireMembershipNo(IEnumerable<string> roleCodes) =>
        roleCodes.Any(code =>
            !string.Equals(code, "ADMIN", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(code, "APPLICANT", StringComparison.OrdinalIgnoreCase));

    private static bool RoleRequiresMembershipNo(string roleCode) =>
        RolesRequireMembershipNo([roleCode]);

    private static void RequirePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
            throw new InvalidOperationException("Password must be at least 8 characters.");
    }

    private static UserListItemDto MapList(UserAccount user) => new()
    {
        UserAccountId = user.UserAccountId,
        ProfileId = user.ProfileId,
        Username = user.Username,
        FullName = string.Join(" ", new[] { user.Profile.FirstName, user.Profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
        Email = user.Profile.Email,
        Mobile = user.Profile.Mobile,
        AccountStatus = user.AccountStatus,
        IsActive = user.IsActive,
        EmailVerified = user.EmailVerifiedAt.HasValue,
        MustChangePassword = user.MustChangePassword,
        LastLoginAt = user.LastLoginAt,
        CreatedAt = user.CreatedAt,
        // Always expose System_role.code so UI tags and permission checks stay consistent.
        Roles = user.UserRoles.Where(r => r.Role.IsActive).Select(r => r.Role.Code).Distinct().ToList()
    };

    private static UserDetailDto MapDetail(UserAccount user)
    {
        var list = MapList(user);
        return new UserDetailDto
        {
            UserAccountId = list.UserAccountId,
            ProfileId = list.ProfileId,
            Username = list.Username,
            FullName = list.FullName,
            Email = list.Email,
            Mobile = list.Mobile,
            AccountStatus = list.AccountStatus,
            IsActive = list.IsActive,
            EmailVerified = list.EmailVerified,
            MustChangePassword = list.MustChangePassword,
            LastLoginAt = list.LastLoginAt,
            CreatedAt = list.CreatedAt,
            Roles = list.Roles,
            FirstName = user.Profile.FirstName,
            LastName = user.Profile.LastName,
            Title = user.Profile.Title
        };
    }
}
