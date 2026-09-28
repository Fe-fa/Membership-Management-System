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

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }
}
