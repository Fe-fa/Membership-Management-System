using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.Guests
{
    [Table("Reciprocal_usage")]
    public class ReciprocalUsage
    {
        [Column("reciprocal_usage_id")]
        [Key]
        public long ReciprocalUsageId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("home_club_id")]
        public long HomeClubId { get; set; }

        [Column("visit_date")]
        public DateOnly VisitDate { get; set; }

        [Column("days_used")]
        public int DaysUsed { get; set; }

        [Column("register_signature_url")]
        public string? RegisterSignatureUrl { get; set; }

        [Column("notes")]
        public string? Notes { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

        public virtual Club HomeClub { get; set; } = null!;

    }
}

