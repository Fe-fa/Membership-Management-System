using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Lookups
{
    [Table("Member_emergency_contact")]
    public class MemberEmergencyContact
    {
        [Column("member_emergency_contact_id")]
        [Key]
        public long MemberEmergencyContactId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("contact_name")]
        [Required]
        public string ContactName { get; set; }

        [Column("relationship_type_id")]
        public long RelationshipTypeId { get; set; }

        [Column("telephone")]
        public string? Telephone { get; set; }

        [Column("email")]
        public string? Email { get; set; }

        [Column("is_primary_flag")]
        public bool IsPrimaryFlag { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

        public virtual RelationshipType RelationshipType { get; set; } = null!;

    }
}
