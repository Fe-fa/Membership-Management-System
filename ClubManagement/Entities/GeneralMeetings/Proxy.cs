using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.GeneralMeetings
{
    [Table("Proxy")]
    public class Proxy
    {
        [Column("proxy_id")]
        [Key]
        public long ProxyId { get; set; }

        [Column("general_meeting_id")]
        public long GeneralMeetingId { get; set; }

        [Column("appointing_profile_id")]
        public long AppointingProfileId { get; set; }

        [Column("proxy_profile_id")]
        public long? ProxyProfileId { get; set; }

        [Column("proxy_name")]
        public string? ProxyName { get; set; }

        [Column("proxy_title")]
        public string? ProxyTitle { get; set; }

        [Column("alternate_title")]
        public string? AlternateTitle { get; set; }

        [Column("alternate_name")]
        public string? AlternateName { get; set; }

        [Column("proxy_contact")]
        public string? ProxyContact { get; set; }

        [Column("vote_instruction")]
        public string? VoteInstruction { get; set; }

        [Column("leave_to_discretion")]
        public bool LeaveToDiscretion { get; set; }

        [Column("appointing_name")]
        public string? AppointingName { get; set; }

        [Column("appointing_po_box")]
        public string? AppointingPoBox { get; set; }

        [Column("is_poll")]
        public bool IsPoll { get; set; }

        [Column("instrument_received_at")]
        public DateTime? InstrumentReceivedAt { get; set; }

        [Column("deposited_on_time_flag")]
        public bool DepositedOnTimeFlag { get; set; }

        [Column("is_valid_flag")]
        public bool IsValidFlag { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual GeneralMeeting GeneralMeeting { get; set; } = null!;

        public virtual MProfile AppointingProfile { get; set; } = null!;

        public virtual MProfile? ProxyProfile { get; set; }

        public virtual ICollection<MemberVote> MemberVotes { get; set; } = new HashSet<MemberVote>();

    }
}
