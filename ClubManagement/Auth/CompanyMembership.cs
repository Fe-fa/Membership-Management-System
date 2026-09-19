namespace ClubManagement.Auth;

/// <summary>
/// Company (tenant) membership rules:
/// Admin is system-wide and must not belong to a company.
/// Applicant, Member (including Chairman, General Manager, Treasurer, Committee Member),
/// and Receptionist must belong to a company.
/// </summary>
public static class CompanyMembership
{
    /// <summary>Stored TenantId for system Admin (no company).</summary>
    public const long NoCompanyId = 0;
    /// <summary>Set on new entities so StampTenantIds does not inherit the actor's company.</summary>
    public const long ExplicitNoCompany = -1;

    public static readonly string[] CompanyRequiredRoleCodes =
    [
        "APPLICANT",
        "MEMBER",
        "GENERAL_MANAGER",
        "CHAIRMAN",
        "TREASURER",
        "COMMITTEE_MEMBER",
        "RECEPTIONIST"
    ];

    public static bool IsAdmin(string? roleCode) =>
        string.Equals(roleCode, "ADMIN", StringComparison.OrdinalIgnoreCase);

    public static bool RequiresCompany(string? roleCode) =>
        !string.IsNullOrWhiteSpace(roleCode)
        && CompanyRequiredRoleCodes.Contains(roleCode.Trim(), StringComparer.OrdinalIgnoreCase);

    public static bool RequiresCompany(IEnumerable<string> roleCodes) =>
        roleCodes.Any(RequiresCompany);

    public static bool IsAdminOnly(IEnumerable<string> roleCodes)
    {
        var codes = roleCodes.Where(c => !string.IsNullOrWhiteSpace(c)).ToList();
        return codes.Any(IsAdmin) && !RequiresCompany(codes);
    }

    public static bool HasAdmin(IEnumerable<string> roleCodes) =>
        roleCodes.Any(IsAdmin);

    public static void EnsureCompatible(IReadOnlyList<string> roleCodes)
    {
        if (HasAdmin(roleCodes) && RequiresCompany(roleCodes))
        {
            throw new InvalidOperationException(
                "Admin does not belong to a company. Remove Admin, or remove the company roles (Applicant, Member, Chairman, General Manager, Treasurer, Committee Member, Receptionist).");
        }
    }
}
