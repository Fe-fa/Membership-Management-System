using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace ClubManagement.Auth;

public static class CurrentUser
{
    public static long? UserId(this ClaimsPrincipal user) => ReadLong(user, JwtRegisteredClaimNames.Sub, ClaimTypes.NameIdentifier, "uid");
    public static long? ProfileId(this ClaimsPrincipal user) => ReadLong(user, "profileId");
    public static IReadOnlyList<string> RoleCodes(this ClaimsPrincipal user) =>
        user.FindAll(ClaimTypes.Role)
            .Concat(user.FindAll("role"))
            .Concat(user.FindAll("roles"))
            .Concat(user.FindAll("http://schemas.microsoft.com/ws/2008/06/identity/claims/role"))
            .Select(c => c.Value)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static bool HasAnyRole(this ClaimsPrincipal user, params string[] roles) =>
        user.RoleCodes().Any(r => roles.Contains(r, StringComparer.OrdinalIgnoreCase));

    public static readonly string[] StaffRoles =
    [
        "ADMIN",
        "GENERAL_MANAGER",
        "CHAIRMAN",
        "TREASURER",
        "COMMITTEE_MEMBER",
        "RECEPTIONIST"
    ];

    public static bool IsStaff(this ClaimsPrincipal user) => user.HasAnyRole(StaffRoles);

    private static long? ReadLong(ClaimsPrincipal user, params string[] types)
    {
        foreach (var type in types)
        {
            var value = user.FindFirstValue(type);
            if (long.TryParse(value, out var parsed)) return parsed;
        }
        return null;
    }
}
