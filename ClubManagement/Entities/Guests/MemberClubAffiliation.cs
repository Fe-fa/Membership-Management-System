using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Guests;

namespace ClubManagement.Entities.Guests
{
    [Table("Member_club_affiliation")]
    public class MemberClubAffiliation
    {
        [Column("member_club_affiliation_id")]
        [Key]
        public long MemberClubAffiliationId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("club_id")]
        public long ClubId { get; set; }

        [Column("affiliation_type_id")]
        public long AffiliationTypeId { get; set; }

        [Column("start_date")]
        public DateOnly? StartDate { get; set; }

        [Column("end_date")]
        public DateOnly? EndDate { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

        public virtual Club Club { get; set; } = null!;

        public virtual AffiliationType AffiliationType { get; set; } = null!;

    }
}
