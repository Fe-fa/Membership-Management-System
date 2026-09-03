namespace ClubManagement.Services.Identity;

/// <summary>
/// Maps Laravel-style MAIL_* environment variables onto the existing Smtp configuration section.
/// </summary>
public static class MailEnvironmentBinder
{
    public static void Apply(ConfigurationManager configuration)
    {
        Overlay(configuration, "MAIL_HOST", "Smtp:Host");
        Overlay(configuration, "MAIL_USERNAME", "Smtp:User");
        Overlay(configuration, "MAIL_PASSWORD", "Smtp:Password");
        Overlay(configuration, "MAIL_FROM_ADDRESS", "Smtp:From");

        var port = Environment.GetEnvironmentVariable("MAIL_PORT");
        if (int.TryParse(port, out var parsedPort) && parsedPort > 0)
            configuration["Smtp:Port"] = parsedPort.ToString();

        var encryption = Environment.GetEnvironmentVariable("MAIL_ENCRYPTION");
        if (!string.IsNullOrWhiteSpace(encryption))
        {
            var tls = !encryption.Equals("none", StringComparison.OrdinalIgnoreCase)
                      && !encryption.Equals("off", StringComparison.OrdinalIgnoreCase);
            configuration["Smtp:EnableSsl"] = tls ? "true" : "false";
        }

        var fromName = Unquote(Environment.GetEnvironmentVariable("MAIL_FROM_NAME"));
        if (!string.IsNullOrWhiteSpace(fromName))
        {
            var appName = Environment.GetEnvironmentVariable("APP_NAME") ?? configuration["App:Name"] ?? "Aero Club East Africa";
            configuration["Smtp:FromName"] = fromName.Replace("${APP_NAME}", appName, StringComparison.Ordinal);
        }
    }

    private static void Overlay(ConfigurationManager configuration, string envName, string configKey)
    {
        var value = Unquote(Environment.GetEnvironmentVariable(envName));
        if (!string.IsNullOrWhiteSpace(value))
            configuration[configKey] = value;
    }

    private static string? Unquote(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return value;
        var trimmed = value.Trim();
        if (trimmed.Length >= 2 && trimmed[0] == '"' && trimmed[^1] == '"')
            return trimmed[1..^1];
        return trimmed;
    }
}
