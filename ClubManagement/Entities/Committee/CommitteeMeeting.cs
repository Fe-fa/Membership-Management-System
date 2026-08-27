using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Discipline;

namespace ClubManagement.Entities.Committee
{
    [Table("Committee_meeting")]
    public class CommitteeMeeting
    {
        [Column("committee_meeting_id")]
        [Key]
        public long CommitteeMeetingId { get; set; }

        [Column("committee_id")]
        public long CommitteeId { get; set; }

        [Column("meeting_type_id")]
        public long MeetingTypeId { get; set; }

        [Column("meeting_date")]
        public DateOnly MeetingDate { get; set; }

        [Column("chair_profile_id")]
        public long? ChairProfileId { get; set; }

        [Column("minutes_url")]
        public string? MinutesUrl { get; set; }

        [Column("status")]
        [Required]
        public string Status { get; set; } = "SCHEDULED";

        [Column("meeting_name")]
        public string? MeetingName { get; set; }

        [Column("meeting_time")]
        public string? MeetingTime { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual Committee Committee { get; set; } = null!;

        public virtual MeetingType MeetingType { get; set; } = null!;

        public virtual MProfile? Chair { get; set; }

        public virtual ICollection<Interview> Interviews { get; set; } = new HashSet<Interview>();

        public virtual ICollection<DisciplinaryAction> DisciplinaryActions { get; set; } = new HashSet<DisciplinaryAction>();

        public virtual ICollection<MeetingAttendance> MeetingAttendances { get; set; } = new HashSet<MeetingAttendance>();

        public virtual ICollection<Resolution> Resolutions { get; set; } = new HashSet<Resolution>();

        public virtual ICollection<CommitteeBallotItem> BallotItems { get; set; } = new HashSet<CommitteeBallotItem>();
    }
}
