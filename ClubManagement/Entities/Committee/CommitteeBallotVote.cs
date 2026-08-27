using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Committee;

[Table("Committee_ballot_vote")]
public class CommitteeBallotVote
{
    [Column("committee_ballot_vote_id")]
    [Key]
    public long CommitteeBallotVoteId { get; set; }

    [Column("committee_ballot_item_id")]
    public long CommitteeBallotItemId { get; set; }

    [Column("voter_profile_id")]
    public long VoterProfileId { get; set; }

    /// <summary>FOR | AGAINST</summary>
    [Column("vote_value")]
    [Required]
    public string VoteValue { get; set; } = string.Empty;

    [Column("cast_at")]
    public DateTime CastAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    public virtual CommitteeBallotItem Item { get; set; } = null!;
    public virtual MProfile Voter { get; set; } = null!;
}
