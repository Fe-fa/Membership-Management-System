using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Committee;

namespace ClubManagement.Entities.GeneralMeetings
{
    [Table("Meeting_agenda_item")]
    public class MeetingAgendaItem
    {
        [Column("meeting_agenda_item_id")]
        [Key]
        public long MeetingAgendaItemId { get; set; }

        [Column("general_meeting_id")]
        public long GeneralMeetingId { get; set; }

        [Column("resolution_id")]
        public long? ResolutionId { get; set; }

        [Column("subject")]
        [Required]
        public string Subject { get; set; }

        [Column("is_special_business_flag")]
        public bool IsSpecialBusinessFlag { get; set; }

        [Column("sort_order")]
        public int SortOrder { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual GeneralMeeting GeneralMeeting { get; set; } = null!;

        public virtual Resolution? Resolution { get; set; }

        public virtual ICollection<MemberVote> MemberVotes { get; set; } = new HashSet<MemberVote>();

    }
}
