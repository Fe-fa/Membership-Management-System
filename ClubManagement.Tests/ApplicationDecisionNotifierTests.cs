using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Lookups;
using ClubManagement.Services.Identity;
using ClubManagement.Services.MembershipApplication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClubManagement.Tests;

public class ApplicationDecisionNotifierTests
{
    [Fact]
    public void Approved_template_is_distinct_from_rejected()
    {
        var approved = ApplicationDecisionNotifier.BuildApplicantCopy(new ApplicationDecisionMessage
        {
            Kind = ApplicationDecisionKind.Approved,
            ApplicationId = 1,
            ApplicationNo = "ACEA-1",
            ApplicantName = "Ada",
            ApplicantProfileId = 10,
            ApplicantEmail = "ada@example.com",
            StageName = "Interview",
            IsFinal = false
        }, "http://localhost:8080");

        var rejected = ApplicationDecisionNotifier.BuildApplicantCopy(new ApplicationDecisionMessage
        {
            Kind = ApplicationDecisionKind.Rejected,
            ApplicationId = 1,
            ApplicationNo = "ACEA-1",
            ApplicantName = "Ada",
            ApplicantProfileId = 10,
            ApplicantEmail = "ada@example.com",
            Reason = "Missing visits",
            ReturnedStageName = "Endorsement"
        }, "http://localhost:8080");

        Assert.Equal("APPLICATION_APPROVED", approved.TypeCode);
        Assert.Contains("approved to Interview", approved.Subject, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("APPLICATION_REJECTED", rejected.TypeCode);
        Assert.Contains("Missing visits", rejected.Body);
        Assert.Contains("Endorsement", rejected.Body);
        Assert.NotEqual(approved.Subject, rejected.Subject);
    }

    [Fact]
    public async Task Approve_enqueues_email_and_writes_notification_row()
    {
        var (db, queue, notifier) = CreateNotifier();
        await notifier.NotifyAsync(new ApplicationDecisionMessage
        {
            Kind = ApplicationDecisionKind.Approved,
            ApplicationId = 7,
            ApplicationNo = "ACEA-7",
            ApplicantName = "Ada Lovelace",
            ApplicantProfileId = 10,
            ApplicantEmail = "ada@example.com",
            StageName = "Approved",
            IsFinal = true
        }, CancellationToken.None);

        Assert.Single(queue.Items);
        Assert.Equal("ada@example.com", queue.Items[0].To);
        Assert.Contains("approved", queue.Items[0].Subject, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(1, await db.Notifications.CountAsync());
        var row = await db.Notifications.Include(n => n.NotificationType).SingleAsync();
        Assert.Equal("APPLICATION_APPROVED", row.NotificationType.Code);
        Assert.Equal("ada@example.com", row.Recipient);
    }

    [Fact]
    public async Task Reject_notifies_applicant_with_reason()
    {
        var (db, queue, notifier) = CreateNotifier();
        await notifier.NotifyAsync(new ApplicationDecisionMessage
        {
            Kind = ApplicationDecisionKind.Rejected,
            ApplicationId = 8,
            ApplicationNo = "ACEA-8",
            ApplicantName = "Ada Lovelace",
            ApplicantProfileId = 10,
            ApplicantEmail = "ada@example.com",
            Reason = "Documents incomplete",
            ReturnedStageName = "Under review"
        }, CancellationToken.None);

        Assert.Single(queue.Items);
        Assert.Contains("Documents incomplete", queue.Items[0].Body);
        Assert.Equal(1, await db.Notifications.CountAsync());
        var type = await db.NotificationTypes.SingleAsync();
        Assert.Equal("APPLICATION_REJECTED", type.Code);
    }

    private static (ApplicationModuleDbContext Db, RecordingEmailQueue Queue, ApplicationDecisionNotifier Notifier) CreateNotifier()
    {
        var options = new DbContextOptionsBuilder<ApplicationModuleDbContext>()
            .UseInMemoryDatabase("notify-" + Guid.NewGuid().ToString("N"))
            .Options;
        var db = new ApplicationModuleDbContext(options);
        var queue = new RecordingEmailQueue();
        var notifier = new ApplicationDecisionNotifier(
            db,
            queue,
            Options.Create(new AppPublicOptions { PublicBaseUrl = "http://localhost:8080" }));
        return (db, queue, notifier);
    }

    private sealed class RecordingEmailQueue : IEmailDispatchQueue
    {
        public List<EmailWorkItem> Items { get; } = [];

        public ValueTask EnqueueAsync(EmailWorkItem item, CancellationToken cancellationToken = default)
        {
            Items.Add(item);
            return ValueTask.CompletedTask;
        }

        public IAsyncEnumerable<EmailWorkItem> ReadAllAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }
}
