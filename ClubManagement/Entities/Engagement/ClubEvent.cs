using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Engagement;

[Table("Club_event")]
public class ClubEvent
{
    [Column("club_event_id")]
    [Key]
    public long ClubEventId { get; set; }

    [Column("title")]
    [Required]
    public string Title { get; set; } = string.Empty;

    [Column("location")]
    public string? Location { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [Column("starts_at")]
    public DateTime StartsAt { get; set; }

    [Column("ends_at")]
    public DateTime? EndsAt { get; set; }

    [Column("is_published")]
    public bool IsPublished { get; set; } = true;

    /// <summary>DRAFT, PUBLISHED, or CANCELLED. ONGOING and COMPLETED are derived from the schedule.</summary>
    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = "PUBLISHED";

    [Column("category_code")]
    [MaxLength(40)]
    public string? CategoryCode { get; set; }

    [Column("image_url")]
    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    [Column("capacity")]
    public int? Capacity { get; set; }

    [Column("registration_deadline")]
    public DateTime? RegistrationDeadline { get; set; }

    [Column("fee")]
    public decimal? Fee { get; set; }

    [Column("require_registration")]
    public bool RequireRegistration { get; set; }

    [Column("require_approval")]
    public bool RequireApproval { get; set; }

    [Column("allow_guest_registration")]
    public bool AllowGuestRegistration { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }
}
