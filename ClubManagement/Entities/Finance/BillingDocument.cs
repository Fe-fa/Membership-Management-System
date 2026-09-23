using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Finance;

[Table("Billing_document")]
public class BillingDocument
{
    [Column("billing_document_id")]
    [Key]
    public long BillingDocumentId { get; set; }

    [Column("document_no")]
    [Required]
    public string DocumentNo { get; set; } = string.Empty;

    /// <summary>INVOICE or STATEMENT.</summary>
    [Column("kind")]
    [Required]
    public string Kind { get; set; } = "INVOICE";

    /// <summary>JOINING, ANNUAL, ACCOMMODATION, CORKAGE, CUSTOM.</summary>
    [Column("fee_type")]
    [Required]
    public string FeeType { get; set; } = "ANNUAL";

    /// <summary>MEMBER, APPLICANT, or GUEST.</summary>
    [Column("audience")]
    [Required]
    public string Audience { get; set; } = "MEMBER";

    [Column("account_id")]
    public long? AccountId { get; set; }

    [Column("application_id")]
    public long? ApplicationId { get; set; }

    [Column("charge_id")]
    public long? ChargeId { get; set; }

    [Column("membership_invoice_id")]
    public long? MembershipInvoiceId { get; set; }

    [Column("year")]
    public int? Year { get; set; }

    [Column("period_from")]
    public DateOnly? PeriodFrom { get; set; }

    [Column("period_to")]
    public DateOnly? PeriodTo { get; set; }

    [Column("party_name")]
    [Required]
    public string PartyName { get; set; } = string.Empty;

    [Column("party_no")]
    public string? PartyNo { get; set; }

    [Column("email")]
    public string? Email { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("amount_paid")]
    public decimal AmountPaid { get; set; }

    [Column("balance")]
    public decimal Balance { get; set; }

    [Column("document_html")]
    public string? DocumentHtml { get; set; }

    /// <summary>PENDING_GM, APPROVED, REJECTED, PUBLISHED.</summary>
    [Column("status")]
    [Required]
    public string Status { get; set; } = "PENDING_GM";

    [Column("email_after_approval")]
    public bool EmailAfterApproval { get; set; }

    [Column("submitted_at")]
    public DateTime SubmittedAt { get; set; }

    [Column("submitted_by_user_id")]
    public long? SubmittedByUserId { get; set; }

    [Column("reviewed_at")]
    public DateTime? ReviewedAt { get; set; }

    [Column("reviewed_by_user_id")]
    public long? ReviewedByUserId { get; set; }

    [Column("review_notes")]
    public string? ReviewNotes { get; set; }

    [Column("published_at")]
    public DateTime? PublishedAt { get; set; }

    [Column("sent_at")]
    public DateTime? SentAt { get; set; }

    [Column("sent_to_email")]
    public string? SentToEmail { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    public virtual MAccount? Account { get; set; }
}
