using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Finance;

/// <summary>
/// Audit-trail row created whenever finance reverses a previously cleared payment.
/// We never delete the original MTransaction — we write a signed-off ledger entry
/// that links back to the source transaction so the balance reproduces.
/// </summary>
[Table("Reversal_entry")]
public class ReversalEntry
{
    [Column("reversal_id")]
    [Key]
    public long ReversalId { get; set; }

    /// <summary>The MTransaction being reversed.</summary>
    [Column("source_transaction_id")]
    public long SourceTransactionId { get; set; }

    /// <summary>The negative ledger row (also an MTransaction) that records the reversal.</summary>
    [Column("reversal_transaction_id")]
    public long ReversalTransactionId { get; set; }

    /// <summary>Account impacted (zero out member-specific joins later).</summary>
    [Column("account_id")]
    public long? AccountId { get; set; }

    /// <summary>Free-text reason recorded on the refund button.</summary>
    [Column("reason")]
    [Required]
    public string Reason { get; set; } = string.Empty;

    /// <summary>
    /// Committee / chairman approval metadata. The member account is only
    /// restored to ACTIVE after a reversal when this flag is true.
    /// </summary>
    [Column("approved_by_committee")]
    public bool ApprovedByCommittee { get; set; }

    [Column("approver_user_id")]
    public long? ApproverUserId { get; set; }

    [Column("approver_name")]
    public string? ApproverName { get; set; }

    [Column("approver_role")]
    public string? ApproverRole { get; set; }

    [Column("reversed_at")]
    public DateTime ReversedAt { get; set; }

    [Column("reversed_by_user_id")]
    public long? ReversedByUserId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
