using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using System.Text.RegularExpressions;
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
    Task<bool> SendHtmlAsync(string to, string subject, string html, CancellationToken cancellationToken);
}

public class EmailSender : IEmailSender
{
    private static readonly Regex DataUriImage = new(
        @"src=""(data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+))""",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

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

        await SendCoreAsync(to, subject, body, html: false, cancellationToken);
        return true;
    }

    public async Task<bool> SendHtmlAsync(string to, string subject, string html, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_smtp.Host))
        {
            _logger.LogInformation("Email HTML (not sent — SMTP host is empty). To={To} Subject={Subject}", to, subject);
            return false;
        }

        await SendCoreAsync(to, subject, html, html: true, cancellationToken);
        return true;
    }

    private async Task SendCoreAsync(string to, string subject, string body, bool html, CancellationToken cancellationToken)
    {
        var fromName = string.IsNullOrWhiteSpace(_smtp.FromName) ? _smtp.From : _smtp.FromName;
        using var message = new MailMessage
        {
            From = new MailAddress(_smtp.From, fromName),
            Subject = subject,
            BodyEncoding = Encoding.UTF8,
            SubjectEncoding = Encoding.UTF8
        };
        message.To.Add(to);

        if (html)
        {
            var extracted = ReplaceDataUriImages(body);
            var view = AlternateView.CreateAlternateViewFromString(extracted.Html, Encoding.UTF8, MediaTypeNames.Text.Html);
            foreach (var resource in extracted.Resources)
                view.LinkedResources.Add(resource);
            message.AlternateViews.Add(view);
            message.IsBodyHtml = true;
            message.Body = "This invoice is in HTML format. Please view it in an HTML email client.";
        }
        else
        {
            message.IsBodyHtml = false;
            message.Body = body;
        }

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
    }

    private static (string Html, List<LinkedResource> Resources) ReplaceDataUriImages(string html)
    {
        var resources = new List<LinkedResource>();
        var replaced = DataUriImage.Replace(html, match =>
        {
            var mimeSubtype = match.Groups[2].Value;
            var base64 = Regex.Replace(match.Groups[3].Value, @"\s+", "");
            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(base64);
            }
            catch (FormatException)
            {
                return match.Value;
            }

            var contentId = $"logo{resources.Count + 1}@aeroclubea.com";
            var extension = mimeSubtype.Split('+')[0];
            var resource = new LinkedResource(new MemoryStream(bytes), new ContentType($"image/{mimeSubtype}"))
            {
                ContentId = contentId,
                TransferEncoding = TransferEncoding.Base64
            };
            resource.ContentType.Name = $"logo{resources.Count + 1}.{extension}";
            resources.Add(resource);
            return $@"src=""cid:{contentId}""";
        });
        return (replaced, resources);
    }
}
