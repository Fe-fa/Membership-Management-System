using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.Committee
{
    [Table("Committee_member")]
    public class CommitteeMember
    {
        [Column("committee_member_id")]
        [Key]
        public long CommitteeMemberId { get; set; }

        [Column("committee_id")]
        public long CommitteeId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("committee_role_id")]
        public long CommitteeRoleId { get; set; }

        [Column("appointed_date")]
        public DateOnly? AppointedDate { get; set; }

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

        public virtual Committee Committee { get; set; } = null!;

        public virtual MProfile Member { get; set; } = null!;

        public virtual CommitteeRole CommitteeRole { get; set; } = null!;

        public virtual ICollection<MeetingAttendance> MeetingAttendances { get; set; } = new HashSet<MeetingAttendance>();

    }
}
