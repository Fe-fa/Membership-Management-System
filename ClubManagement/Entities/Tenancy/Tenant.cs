using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Tenancy;

/// <summary>
/// Owning flying club / organisation that runs the MMS (multi-tenant root).
/// Distinct from lookup <c>Club</c>, which stores other/reciprocal clubs.
/// </summary>
[Table("Tenant")]
public class Tenant
{
    [Column("tenant_id")]
    [Key]
    public long TenantId { get; set; }

    [Column("code")]
    [Required]
    [MaxLength(40)]
    public string Code { get; set; } = string.Empty;

    [Column("name")]
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Column("short_name")]
    [MaxLength(80)]
    public string? ShortName { get; set; }

    [Column("contact_email")]
    [MaxLength(200)]
    public string? ContactEmail { get; set; }

    [Column("contact_phone")]
    [MaxLength(40)]
    public string? ContactPhone { get; set; }

    [Column("address_line")]
    [MaxLength(400)]
    public string? AddressLine { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}

/// <summary>Entities that belong to one owning club (tenant).</summary>
public interface ITenantScoped
{
    long TenantId { get; set; }
}
