using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.MembershipAccount
{
    [Table("Member_status_override")]
    public class MemberStatusOverride
    {
        [Column("member_status_override_id")]
        [Key]
        public long MemberStatusOverrideId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("flag_type")]
        [Required]
        public string FlagType { get; set; }

        [Column("override_value")]
        public bool OverrideValue { get; set; }

        [Column("reason")]
        public string? Reason { get; set; }

        [Column("approved_by_profile_id")]
        public long? ApprovedByProfileId { get; set; }

        [Column("effective_date")]
        public DateOnly EffectiveDate { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount Account { get; set; } = null!;

        public virtual MProfile? ApprovedBy { get; set; }

    }
}
