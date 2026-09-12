using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Lookups;
using ClubManagement.Services.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClubManagement.Services.MembershipApplication;

public interface IEndorsementInviteService
{
    Task NotifyNamedEndorsersAsync(long applicationId, CancellationToken cancellationToken);
    Task NotifyNewlyNamedEndorsersAsync(long applicationId, long? previousProposerId, long? previousSeconderId, CancellationToken cancellationToken);
    Task NotifyEndorsementDeclinedAsync(long applicationId, string role, string endorserName, string reason, CancellationToken cancellationToken);
}

public class EndorsementInviteService : IEndorsementInviteService
{
    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailSender _email;
    private readonly AppPublicOptions _app;

    public EndorsementInviteService(ApplicationModuleDbContext db, IEmailSender email, IOptions<AppPublicOptions> app)
    {
        _db = db;
        _email = email;
        _app = app.Value;
    }

    public async Task NotifyNamedEndorsersAsync(long applicationId, CancellationToken cancellationToken)
    {
        var application = await _db.Applications
            .Include(a => a.Applicant)
            .Include(a => a.ElectionType)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (application is null) return;

        var membershipType = application.ElectionType?.Name ?? "Membership";
        var applicantName = string.Join(" ", new[] { application.Applicant.FirstName, application.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));

        await NotifyOneAsync(application.ProposerProfileId, "Proposer", applicantName, membershipType, applicationId, force: false, cancellationToken);
        await NotifyOneAsync(application.SeconderProfileId, "Seconder", applicantName, membershipType, applicationId, force: false, cancellationToken);
    }

    public async Task NotifyNewlyNamedEndorsersAsync(
        long applicationId,
        long? previousProposerId,
        long? previousSeconderId,
        CancellationToken cancellationToken)
    {
        var application = await _db.Applications
            .Include(a => a.Applicant)
            .Include(a => a.ElectionType)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (application is null) return;

        var membershipType = application.ElectionType?.Name ?? "Membership";
        var applicantName = string.Join(" ", new[] { application.Applicant.FirstName, application.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));

        if (application.ProposerProfileId is long proposerId && proposerId > 0 && proposerId != previousProposerId)
            await NotifyOneAsync(proposerId, "Proposer", applicantName, membershipType, applicationId, force: true, cancellationToken);
        if (application.SeconderProfileId is long seconderId && seconderId > 0 && seconderId != previousSeconderId)
            await NotifyOneAsync(seconderId, "Seconder", applicantName, membershipType, applicationId, force: true, cancellationToken);
    }

    private async Task NotifyOneAsync(long? profileId, string role, string applicantName, string membershipType, long applicationId, bool force, CancellationToken cancellationToken)
    {
        if (profileId is null or 0) return;
        var profile = await _db.Profiles.AsNoTracking().FirstOrDefaultAsync(p => p.ProfileId == profileId, cancellationToken);
        if (profile is null) return;

        var subject = $"You have been selected as {role} for {applicantName}'s {membershipType} Membership application.";
        var body = $"{subject}\n\nOpen the Member Dashboard to complete the endorsement:\n{_app.PublicBaseUrl.TrimEnd('/')}/endorsements";

        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == "ENDORSEMENT_REQUEST", cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = "ENDORSEMENT_REQUEST",
                Name = "Proposer / Seconder request",
                SortOrder = 20,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var recipient = profile.Email ?? profile.ProfileId.ToString();
        if (!force)
        {
            var already = await _db.Notifications.AnyAsync(n =>
                n.NotificationTypeId == type.NotificationTypeId &&
                n.RelatedEntityType == "APPLICATION" &&
                n.RelatedEntityId == applicationId &&
                n.Recipient == recipient &&
                n.Content != null && n.Content.Contains(role), cancellationToken);
            if (already) return;
        }

        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profile.ProfileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);

        // Always create an in-app notification so the named member sees the request
        // on the dashboard even when email is unavailable.
        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = recipient,
            Channel = "IN_APP",
            SentDate = DateTime.UtcNow,
            Content = subject,
            RelatedEntityType = "APPLICATION",
            RelatedEntityId = applicationId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(profile.Email))
        {
            try { await _email.SendAsync(profile.Email, subject, body, cancellationToken); }
            catch { /* in-app invite still stands if SMTP is down */ }
        }
    }

    public async Task NotifyEndorsementDeclinedAsync(
        long applicationId,
        string role,
        string endorserName,
        string reason,
        CancellationToken cancellationToken)
    {
        var application = await _db.Applications
            .Include(a => a.Applicant)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (application?.Applicant is null) return;

        var applicant = application.Applicant;
        var roleLabel = string.IsNullOrWhiteSpace(role) ? "endorser" : role.Trim();
        var who = string.IsNullOrWhiteSpace(endorserName) ? $"Your named {roleLabel}" : endorserName.Trim();
        var subject = $"{who} declined to endorse application {application.ApplicationNo}";
        var body =
            $"{who} declined to act as {roleLabel} for your membership application {application.ApplicationNo}.\n\n" +
            $"Reason: {reason.Trim()}\n\n" +
            $"Please name another member on this same application:\n{_app.PublicBaseUrl.TrimEnd('/')}/application";

        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == "ENDORSEMENT_DECLINED", cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = "ENDORSEMENT_DECLINED",
                Name = "Endorsement declined",
                SortOrder = 21,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var recipient = applicant.Email ?? applicant.ProfileId.ToString();
        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == applicant.ProfileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);

        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = recipient,
            Channel = "IN_APP",
            SentDate = DateTime.UtcNow,
            Content = $"{subject}\n\n{body}",
            RelatedEntityType = "APPLICATION",
            RelatedEntityId = applicationId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(applicant.Email))
            await _email.SendAsync(applicant.Email, subject, body, cancellationToken);
    }
}
