using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.MembershipAccount
{
    [Table("MDependant")]
    public class MDependant
    {
        [Column("dependant_id")]
        [Key]
        public long DependantId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("dependant_profile_id")]
        public long? DependantProfileId { get; set; }

        [Column("relationship_type_id")]
        public long RelationshipTypeId { get; set; }

        [Column("dependant_name")]
        [Required]
        public string DependantName { get; set; }

        [Column("dependant_dob")]
        public DateOnly? DependantDob { get; set; }

        [Column("telephone")]
        public string? Telephone { get; set; }

        [Column("email")]
        public string? Email { get; set; }

        [Column("is_below_18_flag")]
        public bool IsBelow18Flag { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Principal { get; set; } = null!;

        public virtual MProfile? DependantProfile { get; set; }

        public virtual RelationshipType RelationshipType { get; set; } = null!;

    }
}
