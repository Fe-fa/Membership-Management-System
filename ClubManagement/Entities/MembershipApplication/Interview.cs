using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using ClubManagement.Entities.Committee;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities
{
    [Table("Interview")]
    public class Interview
    {
        [Column("interview_id")]
        [Key]
        public long InterviewId { get; set; }

        [Column("application_id")]
        public long ApplicationId { get; set; }

        [Column("committee_meeting_id")]
        public long? CommitteeMeetingId { get; set; }

        [Column("scheduled_at")]
        public DateTime? ScheduledAt { get; set; }

        [Column("conducted_at")]
        public DateTime? ConductedAt { get; set; }

        [Column("interviewer_profile_id")]
        public long? InterviewerProfileId { get; set; }

        [Column("attended_flag")]
        public bool AttendedFlag { get; set; }

        [Column("outcome")]
        public string? Outcome { get; set; }

        [Column("notes")]
        public string? Notes { get; set; }

        [Column("interview_form_json")]
        public string? FormJson { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MApplication Application { get; set; } = null!;

        public virtual CommitteeMeeting? CommitteeMeeting { get; set; }

        public virtual MProfile? Interviewer { get; set; }

    }
}
