using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Guests;

namespace ClubManagement.Entities.Lookups
{
    [Table("Club")]
    public class Club
    {
        [Column("club_id")]
        [Key]
        public long ClubId { get; set; }

        [Column("club_name")]
        [Required]
        public string ClubName { get; set; }

        [Column("club_type_id")]
        public long ClubTypeId { get; set; }

        [Column("address")]
        public string? Address { get; set; }

        [Column("city")]
        public string? City { get; set; }

        [Column("country_id")]
        public long? CountryId { get; set; }

        [Column("contact_phone")]
        public string? ContactPhone { get; set; }

        [Column("contact_email")]
        public string? ContactEmail { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual ClubType ClubType { get; set; } = null!;

        public virtual Country? Country { get; set; }

        public virtual ICollection<MemberClubAffiliation> MemberClubAffiliations { get; set; } = new HashSet<MemberClubAffiliation>();

        public virtual ICollection<ReciprocalUsage> ReciprocalUsages { get; set; } = new HashSet<ReciprocalUsage>();

    }
}
