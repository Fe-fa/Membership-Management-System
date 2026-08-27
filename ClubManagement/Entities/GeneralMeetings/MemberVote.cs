using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.GeneralMeetings
{
    [Table("Member_vote")]
    public class MemberVote
    {
        [Column("member_vote_id")]
        [Key]
        public long MemberVoteId { get; set; }

        [Column("general_meeting_id")]
        public long GeneralMeetingId { get; set; }

        [Column("general_meeting_business_item_id")]
        public long GeneralMeetingBusinessItemId { get; set; }

        [Column("voter_profile_id")]
        public long VoterProfileId { get; set; }

        [Column("vote_method")]
        [Required]
        public string VoteMethod { get; set; }

        [Column("vote_value")]
        [Required]
        public string VoteValue { get; set; }

        [Column("cast_via_proxy_id")]
        public long? CastViaProxyId { get; set; }

        [Column("cast_at")]
        public DateTime? CastAt { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual GeneralMeeting GeneralMeeting { get; set; } = null!;

        public virtual MeetingAgendaItem BusinessItem { get; set; } = null!;

        public virtual MProfile Voter { get; set; } = null!;

        public virtual Proxy? CastViaProxy { get; set; }

    }
}
