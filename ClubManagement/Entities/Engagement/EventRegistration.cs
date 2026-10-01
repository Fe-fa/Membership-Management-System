using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Engagement;

[Table("Event_registration")]
public class EventRegistration
{
    [Column("event_registration_id")]
    [Key]
    public long EventRegistrationId { get; set; }

    [Column("club_event_id")]
    public long ClubEventId { get; set; }

    [Column("account_id")]
    public long AccountId { get; set; }

    /// <summary>PENDING, APPROVED, REJECTED, CANCELLED.</summary>
    [Column("status")]
    [MaxLength(20)]
    [Required]
    public string Status { get; set; } = "PENDING";

    /// <summary>NOT_REQUIRED, UNPAID, PAID.</summary>
    [Column("payment_status")]
    [MaxLength(20)]
    public string PaymentStatus { get; set; } = "NOT_REQUIRED";

    [Column("guest_count")]
    public int GuestCount { get; set; }

    [Column("guest_name")]
    [MaxLength(120)]
    public string? GuestName { get; set; }

    [Column("ticket_code")]
    [MaxLength(40)]
    public string? TicketCode { get; set; }

    [Column("registered_at")]
    public DateTime RegisteredAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    public virtual ClubEvent? Event { get; set; }
}
