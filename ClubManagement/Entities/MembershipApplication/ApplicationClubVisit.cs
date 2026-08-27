using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities;

[Table("Application_club_visit")]
public class ApplicationClubVisit
{
    [Column("application_club_visit_id")]
    [Key]
    public long ApplicationClubVisitId { get; set; }

    [Column("application_id")]
    public long ApplicationId { get; set; }

    [Column("visit_date")]
    public DateOnly VisitDate { get; set; }

    [Column("met_with")]
    [Required]
    [MaxLength(200)]
    public string MetWith { get; set; } = string.Empty;

    [Column("notes")]
    [MaxLength(1000)]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    [Column("updated_by_user_id")]
    public long? UpdatedByUserId { get; set; }

    public virtual MApplication Application { get; set; } = null!;
}
