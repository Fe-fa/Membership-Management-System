using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Subscriptions;

namespace ClubManagement.Entities.Finance;

[Table("Membership_invoice")]
public class MembershipInvoice
{
    [Column("invoice_id")]
    [Key]
    public long InvoiceId { get; set; }

    [Column("invoice_no")]
    [Required]
    public string InvoiceNo { get; set; } = string.Empty;

    [Column("account_id")]
    public long AccountId { get; set; }

    [Column("subscription_id")]
    public long? SubscriptionId { get; set; }

    [Column("year")]
    public int Year { get; set; }

    [Column("issued_at")]
    public DateTime IssuedAt { get; set; }

    [Column("due_date")]
    public DateOnly DueDate { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("status")]
    [Required]
    public string Status { get; set; } = "ISSUED";

    [Column("sent_at")]
    public DateTime? SentAt { get; set; }

    [Column("sent_to_email")]
    public string? SentToEmail { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    public virtual MAccount Account { get; set; } = null!;
    public virtual Subscription? Subscription { get; set; }
}
