using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Engagement;

[Table("Event_category")]
public class EventCategory
{
    [Column("event_category_id")]
    [Key]
    public long EventCategoryId { get; set; }

    [Column("code")]
    [MaxLength(40)]
    [Required]
    public string Code { get; set; } = string.Empty;

    [Column("name")]
    [MaxLength(80)]
    [Required]
    public string Name { get; set; } = string.Empty;

    [Column("sort_order")]
    public int SortOrder { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }
}
