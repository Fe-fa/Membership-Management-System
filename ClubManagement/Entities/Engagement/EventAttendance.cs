using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Engagement;

[Table("Event_attendance")]
public class EventAttendance
{
    [Column("event_attendance_id")]
    [Key]
    public long EventAttendanceId { get; set; }

    [Column("club_event_id")]
    public long ClubEventId { get; set; }

    [Column("account_id")]
    public long AccountId { get; set; }

    [Column("event_registration_id")]
    public long? EventRegistrationId { get; set; }

    /// <summary>REGISTERED, PRESENT, ABSENT.</summary>
    [Column("status")]
    [MaxLength(20)]
    [Required]
    public string Status { get; set; } = "REGISTERED";

    [Column("checked_in_at")]
    public DateTime? CheckedInAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }

    public virtual ClubEvent? Event { get; set; }
}
