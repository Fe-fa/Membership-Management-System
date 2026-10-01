using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Finance;

namespace ClubManagement.Entities.Subscriptions;

/// <summary>
/// Applies part of a receipt to one membership invoice.
/// The source <see cref="MTransaction.Amount"/> stays unchanged.
/// </summary>
[Table("MTransactionAllocation")]
public class MTransactionAllocation
{
    [Column("allocation_id")]
    [Key]
    public long AllocationId { get; set; }

    [Column("transaction_id")]
    public long TransactionId { get; set; }

    [Column("invoice_id")]
    public long InvoiceId { get; set; }

    [Column("amount", TypeName = "decimal(18,2)")]
    public decimal Amount { get; set; }

    [Column("allocated_at")]
    public DateTime AllocatedAt { get; set; }

    [Column("allocated_by_user_id")]
    public long? AllocatedByUserId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    public virtual MTransaction Transaction { get; set; } = null!;

    public virtual MembershipInvoice Invoice { get; set; } = null!;
}
