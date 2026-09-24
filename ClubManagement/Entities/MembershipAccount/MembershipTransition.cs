using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.MembershipAccount;

[Table("Membership_transition")]
public class MembershipTransition
{
    [Column("membership_transition_id")]
    [Key]
    public long MembershipTransitionId { get; set; }

    [Column("account_id")]
    public long AccountId { get; set; }

    /// <summary>SENIOR_LIFE or LIFE.</summary>
    [Column("kind")]
    [Required]
    public string Kind { get; set; } = "LIFE";

    /// <summary>PENDING, CONVERTED, or DECLINED.</summary>
    [Column("status")]
    [Required]
    public string Status { get; set; } = "PENDING";

    [Column("nominated_at")]
    public DateTime NominatedAt { get; set; }

    [Column("nominated_by_user_id")]
    public long? NominatedByUserId { get; set; }

    [Column("gm_date")]
    public DateOnly? GmDate { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("decided_at")]
    public DateTime? DecidedAt { get; set; }

    [Column("decided_by_user_id")]
    public long? DecidedByUserId { get; set; }

    [Column("letter_html")]
    public string? LetterHtml { get; set; }

    [Column("letter_sent_at")]
    public DateTime? LetterSentAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    public virtual MAccount Account { get; set; } = null!;
}
