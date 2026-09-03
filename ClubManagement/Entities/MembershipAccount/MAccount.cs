using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Entities.Facilities;
using ClubManagement.Entities.Discipline;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Guarantorship;
using ClubManagement.Entities.Tenancy;

namespace ClubManagement.Entities.MembershipAccount
{
    [Table("MAccount")]
    public class MAccount : ITenantScoped
    {
        [Column("account_id")]
        [Key]
        public long AccountId { get; set; }

        [Column("tenant_id")]
        public long TenantId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("application_id")]
        public long? ApplicationId { get; set; }

        [Column("membership_type_id")]
        public long MembershipTypeId { get; set; }

        [Column("election_type_id")]
        public long ElectionTypeId { get; set; }

        [Column("membership_no")]
        public string? MembershipNo { get; set; }

        [Column("current_member_status_id")]
        public long CurrentMemberStatusId { get; set; }

        [Column("joined_date")]
        public DateOnly? JoinedDate { get; set; }

        [Column("start_date")]
        public DateOnly? StartDate { get; set; }

        [Column("end_date")]
        public DateOnly? EndDate { get; set; }

        [Column("entrance_fee_amount")]
        public decimal? EntranceFeeAmount { get; set; }

        [Column("entrance_fee_waived_flag")]
        public bool EntranceFeeWaivedFlag { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("is_deleted")]
        public bool IsDeleted { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

        public virtual MApplication? Application { get; set; }

        public virtual MembershipType MembershipType { get; set; } = null!;

        public virtual ElectionType ElectionType { get; set; } = null!;

        public virtual MemberStatus CurrentMemberStatus { get; set; } = null!;

        public virtual ICollection<MemberStatusHistory> MemberStatusHistories { get; set; } = new HashSet<MemberStatusHistory>();

        public virtual ICollection<Subscription> Subscriptions { get; set; } = new HashSet<Subscription>();

        public virtual ICollection<MTransaction> MTransactions { get; set; } = new HashSet<MTransaction>();

        public virtual ICollection<Arrears> Arrearses { get; set; } = new HashSet<Arrears>();

        public virtual ICollection<FeeWaiver> FeeWaivers { get; set; } = new HashSet<FeeWaiver>();

        public virtual ICollection<FeeWaiver> FeeWaiversAsParentAccount { get; set; } = new HashSet<FeeWaiver>();

        public virtual ICollection<DisciplinaryAction> DisciplinaryActions { get; set; } = new HashSet<DisciplinaryAction>();

        public virtual ICollection<Reinstatement> Reinstatements { get; set; } = new HashSet<Reinstatement>();

        public virtual ICollection<AccommodationBooking> AccommodationBookings { get; set; } = new HashSet<AccommodationBooking>();

        public virtual ICollection<CreditFacility> CreditFacilities { get; set; } = new HashSet<CreditFacility>();

        public virtual ICollection<Notification> Notifications { get; set; } = new HashSet<Notification>();

        public virtual ICollection<MemberGuarantorship> MemberGuarantorships { get; set; } = new HashSet<MemberGuarantorship>();

        public virtual ICollection<MemberStatusOverride> MemberStatusOverrides { get; set; } = new HashSet<MemberStatusOverride>();

    }
}
