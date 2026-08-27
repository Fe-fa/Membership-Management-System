using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Committee
{
    [Table("Meeting_attendance")]
    public class MeetingAttendance
    {
        [Column("meeting_attendance_id")]
        [Key]
        public long MeetingAttendanceId { get; set; }

        [Column("committee_meeting_id")]
        public long CommitteeMeetingId { get; set; }

        [Column("committee_member_id")]
        public long CommitteeMemberId { get; set; }

        [Column("attended_flag")]
        public bool AttendedFlag { get; set; }

        [Column("notes")]
        public string? Notes { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual CommitteeMeeting CommitteeMeeting { get; set; } = null!;

        public virtual CommitteeMember CommitteeMember { get; set; } = null!;

    }
}
