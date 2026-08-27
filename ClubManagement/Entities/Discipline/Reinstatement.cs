using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Discipline
{
    [Table("Reinstatement")]
    public class Reinstatement
    {
        [Column("reinstatement_id")]
        [Key]
        public long ReinstatementId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("disciplinary_action_id")]
        public long? DisciplinaryActionId { get; set; }

        [Column("reinstatement_date")]
        public DateOnly ReinstatementDate { get; set; }

        [Column("reason")]
        public string? Reason { get; set; }

        [Column("arrears_settled_flag")]
        public bool ArrearsSettledFlag { get; set; }

        [Column("new_entrance_fee_paid_flag")]
        public bool NewEntranceFeePaidFlag { get; set; }

        [Column("reapplication_id")]
        public long? ReapplicationId { get; set; }

        [Column("approved_by_profile_id")]
        public long? ApprovedByProfileId { get; set; }

        [Column("status")]
        public string? Status { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount Account { get; set; } = null!;

        public virtual DisciplinaryAction? DisciplinaryAction { get; set; }

        public virtual MApplication? Reapplication { get; set; }

        public virtual MProfile? ApprovedBy { get; set; }

    }
}
