using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Tenancy;

namespace ClubManagement.Entities.Engagement;

[Table("Support_ticket")]
public class SupportTicket : ITenantScoped
{
    [Column("support_ticket_id")]
    [Key]
    public long SupportTicketId { get; set; }

    [Column("tenant_id")]
    public long TenantId { get; set; }

    [Column("ticket_no")]
    [Required]
    public string TicketNo { get; set; } = string.Empty;

    [Column("subject")]
    [Required]
    public string Subject { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    /// <summary>System_role.code this ticket is routed to (Chairman, Treasurer, etc.).</summary>
    [Column("category_role_code")]
    [Required]
    public string CategoryRoleCode { get; set; } = string.Empty;

    [Column("category_email")]
    public string? CategoryEmail { get; set; }

    [Column("category_assignee_name")]
    public string? CategoryAssigneeName { get; set; }

    [Column("priority")]
    [Required]
    public string Priority { get; set; } = "NORMAL";

    [Column("status")]
    [Required]
    public string Status { get; set; } = "OPEN";

    [Column("created_by_user_id")]
    public long CreatedByUserId { get; set; }

    [Column("created_by_profile_id")]
    public long CreatedByProfileId { get; set; }

    [Column("assigned_user_id")]
    public long? AssignedUserId { get; set; }

    [Column("attachment_file_name")]
    public string? AttachmentFileName { get; set; }

    [Column("attachment_url")]
    public string? AttachmentUrl { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }

    [Column("updated_by_user_id")]
    public long? UpdatedByUserId { get; set; }

    public virtual ICollection<SupportTicketMessage> Messages { get; set; } = new HashSet<SupportTicketMessage>();
}
