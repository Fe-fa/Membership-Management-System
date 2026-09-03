using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Lookups;
using ClubManagement.Services.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.MembershipApplication;

public enum ApplicationDecisionKind
{
    Approved,
    Rejected,
}

public class ApplicationDecisionMessage
{
    public required ApplicationDecisionKind Kind { get; init; }
    public required long ApplicationId { get; init; }
    public required string ApplicationNo { get; init; }
    public required string ApplicantName { get; init; }
    public required long ApplicantProfileId { get; init; }
    public string? ApplicantEmail { get; init; }
    public string StageName { get; init; } = "";
    public bool IsFinal { get; init; }
    public string? Reason { get; init; }
    public string? ReturnedStageName { get; init; }
    public long? PreviousHandlerUserId { get; init; }
}

public interface IApplicationDecisionNotifier
{
    Task NotifyAsync(ApplicationDecisionMessage message, CancellationToken cancellationToken);
}

public class ApplicationDecisionNotifier : IApplicationDecisionNotifier
{
    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailDispatchQueue _emails;
    private readonly AppPublicOptions _app;

    public ApplicationDecisionNotifier(
        ApplicationModuleDbContext db,
        IEmailDispatchQueue emails,
        IOptions<AppPublicOptions> app)
    {
        _db = db;
        _emails = emails;
        _app = app.Value;
    }

    public async Task NotifyAsync(ApplicationDecisionMessage message, CancellationToken cancellationToken)
    {
        var portal = (_app.PublicBaseUrl ?? "http://localhost:8080").TrimEnd('/');
        var (typeCode, typeName, subject, body) = BuildApplicantCopy(message, portal);

        await PushAsync(
            typeCode,
            typeName,
            message.ApplicantProfileId,
            message.ApplicantEmail,
            subject,
            body,
            message.ApplicationId,
            cancellationToken);

        if (message.Kind == ApplicationDecisionKind.Rejected && message.PreviousHandlerUserId is long handlerId)
        {
            var handler = await _db.UserAccounts.AsNoTracking()
                .Include(u => u.Profile)
                .FirstOrDefaultAsync(u => u.UserAccountId == handlerId, cancellationToken);
            if (handler?.Profile is not null)
            {
                var returned = string.IsNullOrWhiteSpace(message.ReturnedStageName)
                    ? "the previous stage"
                    : message.ReturnedStageName;
                var hSubject = $"Application {message.ApplicationNo} returned to you";
                var hBody =
                    $"{message.ApplicantName}'s application {message.ApplicationNo} was rejected and returned to you ({returned}).\n\n" +
                    (string.IsNullOrWhiteSpace(message.Reason) ? "" : $"Comment: {message.Reason.Trim()}\n\n") +
                    $"Open the desk: {portal}/members";
                await PushAsync(
                    "APPLICATION_RETURNED",
                    "Application returned",
                    handler.ProfileId,
                    handler.Profile.Email,
                    hSubject,
                    hBody,
                    message.ApplicationId,
                    cancellationToken);
            }
        }
    }

    internal static (string TypeCode, string TypeName, string Subject, string Body) BuildApplicantCopy(
        ApplicationDecisionMessage message,
        string portal)
    {
        if (message.Kind == ApplicationDecisionKind.Approved)
        {
            var stage = string.IsNullOrWhiteSpace(message.StageName) ? "the next stage" : message.StageName;
            var subject = message.IsFinal
                ? $"Application {message.ApplicationNo} approved"
                : $"Application {message.ApplicationNo} approved to {stage}";
            var body = message.IsFinal
                ? $"Dear {message.ApplicantName},\n\nYour membership application {message.ApplicationNo} has been approved.\n\nOpen your portal: {portal}/applications"
                : $"Dear {message.ApplicantName},\n\nYour membership application {message.ApplicationNo} has been approved to {stage}.\n\nOpen your portal: {portal}/applications";
            return ("APPLICATION_APPROVED", "Application approved", subject, body);
        }

        var reason = string.IsNullOrWhiteSpace(message.Reason) ? "No additional comment was provided." : message.Reason.Trim();
        var returned = string.IsNullOrWhiteSpace(message.ReturnedStageName)
            ? "the previous reviewer"
            : message.ReturnedStageName;
        var rejectSubject = $"Application {message.ApplicationNo} was not approved";
        var rejectBody =
            $"Dear {message.ApplicantName},\n\nYour membership application {message.ApplicationNo} was rejected and returned to {returned}.\n\n" +
            $"Reason: {reason}\n\nOpen your portal: {portal}/applications";
        return ("APPLICATION_REJECTED", "Application rejected", rejectSubject, rejectBody);
    }

    private async Task PushAsync(
        string typeCode,
        string typeName,
        long profileId,
        string? email,
        string subject,
        string body,
        long applicationId,
        CancellationToken cancellationToken)
    {
        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == typeCode, cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = typeCode,
                Name = typeName,
                SortOrder = 20,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);

        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = string.IsNullOrWhiteSpace(email) ? profileId.ToString() : email.Trim(),
            Channel = "IN_APP",
            Content = body,
            RelatedEntityType = "APPLICATION",
            RelatedEntityId = applicationId,
            SentDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(email))
            await _emails.EnqueueAsync(new EmailWorkItem(email.Trim(), subject, body), cancellationToken);
    }
}
