using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;


namespace ClubManagement.Entities.Guests
{
    [Table("MGuest")]
    public class MGuest
    {
        [Column("guest_id")]
        [Key]
        public long GuestId { get; set; }

        [Column("guest_profile_id")]
        public long? GuestProfileId { get; set; }

        [Column("guest_name")]
        [Required]
        public string GuestName { get; set; } = string.Empty;

        [Column("phone")]
        public string? Phone { get; set; }

        [Column("visit_slip_code")]
        public string? VisitSlipCode { get; set; }

        [Column("introduced_by_profile_id")]
        public long? IntroducedByProfileId { get; set; }

        [Column("guest_status_id")]
        public long GuestStatusId { get; set; }

        [Column("barred_reason")]
        public string? BarredReason { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile? GuestProfile { get; set; }

        public virtual MProfile? IntroducedBy { get; set; }

        public virtual GuestStatus GuestStatus { get; set; } = null!;

        public virtual ICollection<MVisit> MVisits { get; set; } = new HashSet<MVisit>();

    }
}
