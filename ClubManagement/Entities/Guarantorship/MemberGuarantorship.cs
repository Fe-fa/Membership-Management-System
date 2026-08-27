using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Guarantorship
{
    [Table("Member_guarantorship")]
    public class MemberGuarantorship
    {
        [Column("member_guarantorship_id")]
        [Key]
        public long MemberGuarantorshipId { get; set; }

        [Column("temporary_account_id")]
        public long TemporaryAccountId { get; set; }

        [Column("guarantor_profile_id")]
        public long GuarantorProfileId { get; set; }

        [Column("guarantor_years_standing_at_signup")]
        public int? GuarantorYearsStandingAtSignup { get; set; }

        [Column("start_date")]
        public DateOnly StartDate { get; set; }

        [Column("end_date")]
        public DateOnly? EndDate { get; set; }

        [Column("extended_flag")]
        public bool ExtendedFlag { get; set; }

        [Column("extended_until_date")]
        public DateOnly? ExtendedUntilDate { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount TemporaryAccount { get; set; } = null!;

        public virtual MProfile Guarantor { get; set; } = null!;

    }
}
