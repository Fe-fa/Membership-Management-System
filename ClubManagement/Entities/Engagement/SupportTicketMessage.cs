using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Engagement;

[Table("Support_ticket_message")]
public class SupportTicketMessage
{
    [Column("support_ticket_message_id")]
    [Key]
    public long SupportTicketMessageId { get; set; }

    [Column("support_ticket_id")]
    public long SupportTicketId { get; set; }

    [Column("author_user_id")]
    public long AuthorUserId { get; set; }

    [Column("author_name")]
    [Required]
    public string AuthorName { get; set; } = string.Empty;

    [Column("body")]
    [Required]
    public string Body { get; set; } = string.Empty;

    [Column("is_staff")]
    public bool IsStaff { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    public virtual SupportTicket Ticket { get; set; } = null!;
}
