using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Lookups
{
    [Table("Country")]
    public class Country
    {
        [Column("country_id")]
        [Key]
        public long CountryId { get; set; }

        [Column("country_code")]
        [Required]
        public string CountryCode { get; set; }

        [Column("country_name")]
        [Required]
        public string CountryName { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("sort_order")]
        public int SortOrder { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_at")]
        public DateTime? UpdatedAt { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual ICollection<Club> Clubs { get; set; } = new HashSet<Club>();

        public virtual ICollection<MProfile> MProfiles { get; set; } = new HashSet<MProfile>();

        public virtual ICollection<MProfile> MProfilesAsCountryOfResidence { get; set; } = new HashSet<MProfile>();

        public virtual ICollection<MProfile> MProfilesAsCountry { get; set; } = new HashSet<MProfile>();

    }
}
