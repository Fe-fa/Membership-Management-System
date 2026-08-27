using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.GeneralMeetings;

[Table("Election_nomination")]
public class ElectionNomination
{
    [Column("election_nomination_id")]
    [Key]
    public long ElectionNominationId { get; set; }

    [Column("general_meeting_id")]
    public long GeneralMeetingId { get; set; }

    [Column("nominee_profile_id")]
    public long NomineeProfileId { get; set; }

    [Column("proposer_profile_id")]
    public long ProposerProfileId { get; set; }

    [Column("seconder_profile_id")]
    public long SeconderProfileId { get; set; }

    [Column("role_standing_for")]
    [Required]
    public string RoleStandingFor { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    public virtual GeneralMeeting GeneralMeeting { get; set; } = null!;
    public virtual MProfile Nominee { get; set; } = null!;
    public virtual MProfile Proposer { get; set; } = null!;
    public virtual MProfile Seconder { get; set; } = null!;
}
