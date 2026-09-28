using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;

namespace ClubManagement.Auth;

/// <summary>
/// Super Admin satisfies every role and policy requirement, so that account can use every module.
/// </summary>
public sealed class SuperAdminAuthorizationHandler : IAuthorizationHandler
{
    public Task HandleAsync(AuthorizationHandlerContext context)
    {
        var isSuperAdmin = context.User.FindAll(ClaimTypes.Role)
            .Concat(context.User.FindAll("role"))
            .Any(claim => string.Equals(claim.Value, "SUPER_ADMIN", StringComparison.OrdinalIgnoreCase));
        if (!isSuperAdmin) return Task.CompletedTask;

        foreach (var requirement in context.PendingRequirements.ToList())
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
