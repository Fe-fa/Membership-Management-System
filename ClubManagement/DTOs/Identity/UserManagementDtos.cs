namespace ClubManagement.DTOs.Identity;

public class UserListItemDto
{
    public long UserAccountId { get; set; }
    public long ProfileId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Mobile { get; set; }
    public string AccountStatus { get; set; } = "ACTIVE";
    public bool IsActive { get; set; }
    public bool EmailVerified { get; set; }
    public bool MustChangePassword { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<string> Roles { get; set; } = [];
}

public class UserDetailDto : UserListItemDto
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Title { get; set; }
}

public class UserListResponse : ClubManagement.DTOs.Common.PagedResult<UserListItemDto>
{
    public int Total
    {
        get => TotalCount;
        set => TotalCount = value;
    }
}

public class CreateStaffUserRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Mobile { get; set; }
    public string? Username { get; set; }
    /// <summary>Legacy single-role field. Prefer RoleCodes.</summary>
    public string? RoleCode { get; set; }
    /// <summary>One or more System_role codes to assign via User_role.</summary>
    public List<string> RoleCodes { get; set; } = [];
    /// <summary>Required when any assigned role needs a club membership number.</summary>
    public string? MembershipNo { get; set; }
}

public class CreateStaffUserResponse
{
    public UserDetailDto User { get; set; } = new();
    public string InviteUrl { get; set; } = string.Empty;
    public bool EmailSent { get; set; }
}

public class UpdateUserRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Mobile { get; set; }
    public string? Username { get; set; }
}

public class AssignRolesRequest
{
    /// <summary>Legacy single-role field. Prefer RoleCodes.</summary>
    public string? RoleCode { get; set; }
    /// <summary>Full set of System_role codes for this user (replaces previous User_role rows).</summary>
    public List<string> RoleCodes { get; set; } = [];
}

public class ChangeAccountStatusRequest
{
    public string Status { get; set; } = string.Empty;
}

public class SetUserPasswordRequest
{
    public string Password { get; set; } = string.Empty;
}

public class SetPasswordByTokenRequest
{
    public string Token { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class RoleOptionDto
{
    public long Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
}

public class InviteResult
{
    public string InviteUrl { get; set; } = string.Empty;
    public bool EmailSent { get; set; }
}
