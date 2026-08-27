using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Subscriptions
{
    [Table("Arrears")]
    public class Arrears
    {
        [Column("arrears_id")]
        [Key]
        public long ArrearsId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("subscription_id")]
        public long? SubscriptionId { get; set; }

        [Column("opened_date")]
        public DateOnly OpenedDate { get; set; }

        [Column("amount")]
        public decimal Amount { get; set; }

        [Column("status")]
        [Required]
        public string Status { get; set; } = "OPEN";

        [Column("settled_date")]
        public DateOnly? SettledDate { get; set; }

        [Column("settled_by_transaction_id")]
        public long? SettledByTransactionId { get; set; }

        [Column("removal_reference_id")]
        public long? RemovalReferenceId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount Account { get; set; } = null!;

        public virtual Subscription? Subscription { get; set; }

        public virtual MTransaction? SettledByTransaction { get; set; }

    }
}
