using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Committee;

[Table("Committee_ballot_item")]
public class CommitteeBallotItem
{
    [Column("committee_ballot_item_id")]
    [Key]
    public long CommitteeBallotItemId { get; set; }

    [Column("committee_meeting_id")]
    public long CommitteeMeetingId { get; set; }

    [Column("application_id")]
    public long ApplicationId { get; set; }

    /// <summary>OPEN | PASSED | REJECTED</summary>
    [Column("status")]
    [Required]
    public string Status { get; set; } = "OPEN";

    [Column("resolved_at")]
    public DateTime? ResolvedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    [Column("updated_by_user_id")]
    public long? UpdatedByUserId { get; set; }

    public virtual CommitteeMeeting CommitteeMeeting { get; set; } = null!;
    public virtual MApplication Application { get; set; } = null!;
    public virtual ICollection<CommitteeBallotVote> Votes { get; set; } = new HashSet<CommitteeBallotVote>();
}
