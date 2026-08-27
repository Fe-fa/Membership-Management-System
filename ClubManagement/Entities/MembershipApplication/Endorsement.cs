using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities
{
    [Table("Endorsement")]
    public class Endorsement
    {
        [Column("endorsement_id")]
        [Key]
        public long EndorsementId { get; set; }

        [Column("application_id")]
        public long ApplicationId { get; set; }

        [Column("endorser_profile_id")]
        public long EndorserProfileId { get; set; }

        [Column("endorser_role")]
        [Required]
        public string EndorserRole { get; set; }

        [Column("years_known_candidate")]
        public int? YearsKnownCandidate { get; set; }

        [Column("personal_knowledge")]
        public string? PersonalKnowledge { get; set; }

        [Column("professional_knowledge")]
        public string? ProfessionalKnowledge { get; set; }

        [Column("value_addition")]
        public string? ValueAddition { get; set; }

        [Column("endorser_year_of_joining")]
        public int? EndorserYearOfJoining { get; set; }

        [Column("endorser_phone")]
        public string? EndorserPhone { get; set; }

        [Column("endorser_email")]
        public string? EndorserEmail { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        [Column("updated_at")]
        public DateTime? UpdatedAt { get; set; }

        public virtual MApplication Application { get; set; } = null!;

        public virtual MProfile Endorser { get; set; } = null!;

    }
}
