using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Finance;

/// <summary>Reverses part or all of one issued membership invoice. The original invoice stays on file.</summary>
[Table("Invoice_credit_note")]
public class InvoiceCreditNote
{
    [Column("credit_note_id")]
    [Key]
    public long CreditNoteId { get; set; }

    [Column("credit_note_no")]
    [Required]
    public string CreditNoteNo { get; set; } = string.Empty;

    [Column("invoice_id")]
    public long InvoiceId { get; set; }

    [Column("account_id")]
    public long AccountId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    /// <summary>Portion of this credit that was already paid and is waiting to be refunded. It is not applied to later years.</summary>
    [Column("awaiting_refund_amount")]
    public decimal AwaitingRefundAmount { get; set; }

    [Column("reason")]
    [Required]
    public string Reason { get; set; } = string.Empty;

    [Column("status")]
    [Required]
    public string Status { get; set; } = "ISSUED";

    [Column("issued_at")]
    public DateTime IssuedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    public virtual MembershipInvoice Invoice { get; set; } = null!;
}
