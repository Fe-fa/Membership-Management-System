using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.MembershipAccount
{
    [Table("Member_status_history")]
    public class MemberStatusHistory
    {
        [Column("member_status_history_id")]
        [Key]
        public long MemberStatusHistoryId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("from_status_id")]
        public long? FromStatusId { get; set; }

        [Column("to_status_id")]
        public long ToStatusId { get; set; }

        [Column("effective_date")]
        public DateOnly EffectiveDate { get; set; }

        [Column("reason")]
        public string? Reason { get; set; }

        [Column("reference_type")]
        public string? ReferenceType { get; set; }

        [Column("reference_id")]
        public long? ReferenceId { get; set; }

        [Column("changed_by_user_id")]
        public long? ChangedByUserId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount Account { get; set; } = null!;

        public virtual MemberStatus? FromStatus { get; set; }

        public virtual MemberStatus ToStatus { get; set; } = null!;

    }
}
