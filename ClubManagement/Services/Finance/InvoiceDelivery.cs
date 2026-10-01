using ClubManagement.Entities.Finance;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Services.Finance;

public sealed record InvoiceDeliveryPlan(string Target, bool PublishToMember, IReadOnlyList<string> Emails)
{
    public string? EmailList => Emails.Count == 0 ? null : string.Join("; ", Emails);

    public static InvoiceDeliveryPlan For(MAccount? account)
    {
        var target = Normalize(account?.InvoiceTo);
        var member = Clean(account?.Profile?.Email);
        var company = account?.CorporateCompany is { IsActive: true } row ? Clean(row.Email) : null;
        var emails = target switch
        {
            "CORPORATE" => List(company),
            "BOTH" => List(member, company),
            _ => List(member)
        };
        return new InvoiceDeliveryPlan(target, target is "INDIVIDUAL" or "BOTH", emails);
    }

    public static string Normalize(string? value) =>
        (value ?? "").Trim().ToUpperInvariant() switch
        {
            "CORPORATE" or "CORPORATE_COMPANY" or "COMPANY" => "CORPORATE",
            "BOTH" => "BOTH",
            _ => "INDIVIDUAL"
        };

    private static string? Clean(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static IReadOnlyList<string> List(params string?[] emails) =>
        emails
            .Where(email => !string.IsNullOrWhiteSpace(email))
            .Select(email => email!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
}
