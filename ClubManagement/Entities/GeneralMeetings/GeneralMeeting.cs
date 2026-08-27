using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.GeneralMeetings
{
    [Table("General_meeting")]
    public class GeneralMeeting
    {
        [Column("general_meeting_id")]
        [Key]
        public long GeneralMeetingId { get; set; }

        [Column("meeting_type")]
        [Required]
        public string MeetingType { get; set; } = "AGM";

        [Column("meeting_date")]
        public DateOnly MeetingDate { get; set; }

        [Column("notice_sent_date")]
        public DateOnly? NoticeSentDate { get; set; }

        [Column("notice_method")]
        public string? NoticeMethod { get; set; }

        [Column("quorum_required")]
        public int QuorumRequired { get; set; }

        [Column("quorum_met_flag")]
        public bool QuorumMetFlag { get; set; }

        [Column("status")]
        [Required]
        public string Status { get; set; } = "SCHEDULED";

        [Column("adjourned_from_meeting_id")]
        public long? AdjournedFromMeetingId { get; set; }

        [Column("minutes_url")]
        public string? MinutesUrl { get; set; }

        [Column("agenda_text")]
        public string? AgendaText { get; set; }

        [Column("papers_url")]
        public string? PapersUrl { get; set; }

        [Column("venue")]
        public string? Venue { get; set; }

        [Column("ballot_window_open")]
        public bool BallotWindowOpen { get; set; }

        [Column("ballot_opens_at")]
        public DateTime? BallotOpensAt { get; set; }

        [Column("ballot_closes_at")]
        public DateTime? BallotClosesAt { get; set; }

        [Column("ballot_conductor_profile_id")]
        public long? BallotConductorProfileId { get; set; }

        [Column("scrutineer_1_profile_id")]
        public long? Scrutineer1ProfileId { get; set; }

        [Column("scrutineer_2_profile_id")]
        public long? Scrutineer2ProfileId { get; set; }

        [Column("result_declared_at")]
        public DateTime? ResultDeclaredAt { get; set; }

        [Column("result_declared_by_profile_id")]
        public long? ResultDeclaredByProfileId { get; set; }

        [Column("result_summary")]
        public string? ResultSummary { get; set; }

        [Column("chairman_profile_id")]
        public long? ChairmanProfileId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual GeneralMeeting? AdjournedFrom { get; set; }

        public virtual MProfile? Chairman { get; set; }

        public virtual ICollection<GeneralMeeting> GeneralMeetings { get; set; } = new HashSet<GeneralMeeting>();

        public virtual ICollection<MeetingAgendaItem> MeetingAgendaItems { get; set; } = new HashSet<MeetingAgendaItem>();

        public virtual ICollection<Proxy> Proxies { get; set; } = new HashSet<Proxy>();

        public virtual ICollection<MemberVote> MemberVotes { get; set; } = new HashSet<MemberVote>();

        public virtual ICollection<ElectionNomination> Nominations { get; set; } = new HashSet<ElectionNomination>();
    }
}

