using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Facilities
{
    [Table("Credit_facility")]
    public class CreditFacility
    {
        [Column("credit_facility_id")]
        [Key]
        public long CreditFacilityId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("amount")]
        public decimal Amount { get; set; }

        [Column("approved_by_profile_id")]
        public long? ApprovedByProfileId { get; set; }

        [Column("approval_date")]
        public DateOnly? ApprovalDate { get; set; }

        [Column("status")]
        [Required]
        public string Status { get; set; } = "OPEN";

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
