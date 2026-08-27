using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities
{
    [Table("ApplicationExclusion")]
    public class ApplicationExclusion
    {
        [Column("application_exclusion_id")]
        [Key]
        public long ApplicationExclusionId { get; set; }

        [Column("application_id")]
        public long ApplicationId { get; set; }

        [Column("applicant_profile_id")]
        public long ApplicantProfileId { get; set; }

        [Column("adverse_vote_count")]
        public int AdverseVoteCount { get; set; }

        [Column("excluded_date")]
        public DateOnly ExcludedDate { get; set; }

        [Column("excluded_until_date")]
        public DateOnly? ExcludedUntilDate { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MApplication Application { get; set; } = null!;

        public virtual MProfile Applicant { get; set; } = null!;

    }
}
