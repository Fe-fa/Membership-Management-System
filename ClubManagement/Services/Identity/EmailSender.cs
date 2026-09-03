using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.Identity;

public class SmtpOptions
{
    public const string SectionName = "Smtp";
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string From { get; set; } = "noreply@aeroclubea.com";
    public string FromName { get; set; } = "Aero Club East Africa";
    public string User { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public bool EnableSsl { get; set; } = true;
}

public class AppPublicOptions
{
    public const string SectionName = "App";
    public string PublicBaseUrl { get; set; } = "http://localhost:8080";
}

public interface IEmailSender
{
    Task<bool> SendAsync(string to, string subject, string body, CancellationToken cancellationToken);
}

public class EmailSender : IEmailSender
{
    private readonly SmtpOptions _smtp;
    private readonly ILogger<EmailSender> _logger;

    public EmailSender(IOptions<SmtpOptions> smtp, ILogger<EmailSender> logger)
    {
        _smtp = smtp.Value;
        _logger = logger;
    }

    public async Task<bool> SendAsync(string to, string subject, string body, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_smtp.Host))
        {
            _logger.LogInformation("Email (not sent — SMTP host is empty). To={To} Subject={Subject}\n{Body}", to, subject, body);
            return false;
        }

        var fromName = string.IsNullOrWhiteSpace(_smtp.FromName) ? _smtp.From : _smtp.FromName;
        using var message = new MailMessage
        {
            From = new MailAddress(_smtp.From, fromName),
            Subject = subject,
            Body = body,
            IsBodyHtml = false
        };
        message.To.Add(to);

        using var client = new SmtpClient(_smtp.Host, _smtp.Port)
        {
            EnableSsl = _smtp.EnableSsl,
            DeliveryMethod = SmtpDeliveryMethod.Network
        };
        if (!string.IsNullOrWhiteSpace(_smtp.User))
        {
            client.Credentials = new NetworkCredential(_smtp.User, _smtp.Password);
        }

        await client.SendMailAsync(message, cancellationToken);
        return true;
    }
}
