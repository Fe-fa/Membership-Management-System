using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Tenancy;

namespace ClubManagement.Entities.Finance;

[Table("Corporate_company")]
public class CorporateCompany : ITenantScoped
{
    [Column("corporate_company_id")]
    [Key]
    public long CorporateCompanyId { get; set; }

    [Column("tenant_id")]
    public long TenantId { get; set; }

    [Column("code")]
    [MaxLength(40)]
    [Required]
    public string Code { get; set; } = string.Empty;

    [Column("name")]
    [MaxLength(200)]
    [Required]
    public string Name { get; set; } = string.Empty;

    [Column("email")]
    [MaxLength(200)]
    [Required]
    public string Email { get; set; } = string.Empty;

    [Column("phone")]
    [MaxLength(40)]
    public string? Phone { get; set; }

    [Column("kra_pin")]
    [MaxLength(20)]
    public string? KraPin { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    [Column("updated_by_user_id")]
    public long? UpdatedByUserId { get; set; }
}
