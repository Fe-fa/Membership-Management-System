using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.GeneralMeetings;

namespace ClubManagement.Entities.Committee
{
    [Table("Resolution")]
    public class Resolution
    {
        [Column("resolution_id")]
        [Key]
        public long ResolutionId { get; set; }

        [Column("committee_meeting_id")]
        public long CommitteeMeetingId { get; set; }

        [Column("resolution_type_id")]
        public long ResolutionTypeId { get; set; }

        [Column("subject")]
        [Required]
        public string Subject { get; set; }

        [Column("resolution_text")]
        public string? ResolutionText { get; set; }

        [Column("passed_flag")]
        public bool PassedFlag { get; set; }

        [Column("effective_date")]
        public DateOnly? EffectiveDate { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual CommitteeMeeting CommitteeMeeting { get; set; } = null!;

        public virtual ResolutionType ResolutionType { get; set; } = null!;

        public virtual ICollection<MeetingAgendaItem> MeetingAgendaItems { get; set; } = new HashSet<MeetingAgendaItem>();

        public virtual ICollection<ClubSetting> ClubSettings { get; set; } = new HashSet<ClubSetting>();

    }
}
