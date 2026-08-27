using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Tenancy;

namespace ClubManagement.Entities.Lookups
{
    [Table("Membership_type")]
    public class MembershipType : ITenantScoped
    {
        [Column("membership_type_id")]
        [Key]
        public long MembershipTypeId { get; set; }

        [Column("tenant_id")]
        public long TenantId { get; set; }

        [Column("code")]
        [Required]
        public string Code { get; set; }

        [Column("name")]
        [Required]
        public string Name { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("sort_order")]
        public int SortOrder { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("can_vote")]
        public bool CanVote { get; set; }

        [Column("can_run_for_office")]
        public bool CanRunForOffice { get; set; }

        [Column("reciprocation_allowed")]
        public bool ReciprocationAllowed { get; set; }

        [Column("can_introduce_guests")]
        public bool CanIntroduceGuests { get; set; }

        /// <summary>Member dashboard: Subscriptions &amp; Payments card.</summary>
        [Column("can_access_subscriptions")]
        public bool CanAccessSubscriptions { get; set; } = true;

        /// <summary>Member dashboard: Committee card (view roster / notices).</summary>
        [Column("can_access_committee")]
        public bool CanAccessCommittee { get; set; } = true;

        /// <summary>Member dashboard: Accommodation card.</summary>
        [Column("can_access_accommodation")]
        public bool CanAccessAccommodation { get; set; } = true;

        /// <summary>Member dashboard: Proposer / Seconder card.</summary>
        [Column("can_access_endorsements")]
        public bool CanAccessEndorsements { get; set; } = true;

        /// <summary>Member dashboard: Notifications &amp; Documents card.</summary>
        [Column("can_access_documents")]
        public bool CanAccessDocuments { get; set; } = true;

        [Column("max_duration_days")]
        public int? MaxDurationDays { get; set; }

        [Column("is_permanent")]
        public bool IsPermanent { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual ICollection<MAccount> MAccounts { get; set; } = new HashSet<MAccount>();

    }
}
