using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Guests;

[Table("Guest_arrival_alert")]
public class GuestArrivalAlert
{
    [Column("guest_arrival_alert_id")]
    [Key]
    public long GuestArrivalAlertId { get; set; }

    [Column("visit_id")]
    public long VisitId { get; set; }

    [Column("host_profile_id")]
    public long HostProfileId { get; set; }

    [Column("guest_name")]
    [Required]
    public string GuestName { get; set; } = "";

    [Column("host_member_name")]
    [Required]
    public string HostMemberName { get; set; } = "";

    [Column("message")]
    public string? Message { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    [Column("acknowledged_at")]
    public DateTime? AcknowledgedAt { get; set; }

    [Column("acknowledged_by_user_id")]
    public long? AcknowledgedByUserId { get; set; }

    public virtual MVisit Visit { get; set; } = null!;
}
