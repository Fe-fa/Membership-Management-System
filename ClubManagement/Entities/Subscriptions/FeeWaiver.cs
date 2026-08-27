using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.Subscriptions
{
    [Table("Fee_waiver")]
    public class FeeWaiver
    {
        [Column("fee_waiver_id")]
        [Key]
        public long FeeWaiverId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("parent_account_id")]
        public long? ParentAccountId { get; set; }

        [Column("parent_continuous_years")]
        public int? ParentContinuousYears { get; set; }

        [Column("fee_type_id")]
        public long FeeTypeId { get; set; }

        [Column("amount_waived")]
        public decimal AmountWaived { get; set; }

        [Column("waiver_date")]
        public DateOnly WaiverDate { get; set; }

        [Column("approved_by_user_id")]
        public long? ApprovedByUserId { get; set; }

        [Column("reason")]
        public string? Reason { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount Account { get; set; } = null!;

        public virtual MAccount? ParentAccount { get; set; }

        public virtual FeeType FeeType { get; set; } = null!;

    }
}
