using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Aviation
{
    [Table("Member_aviation_detail")]
    public class MemberAviationDetail
    {
        [Column("member_aviation_detail_id")]
        [Key]
        public long MemberAviationDetailId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("is_aviation_affiliated")]
        public bool IsAviationAffiliated { get; set; }

        [Column("aviation_role")]
        public string? AviationRole { get; set; }

        [Column("holds_pilot_licence_flag")]
        public bool HoldsPilotLicenceFlag { get; set; }

        [Column("owns_aircraft_flag")]
        public bool OwnsAircraftFlag { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

    }
}
