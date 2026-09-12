using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Finance;

[Table("Nm_custom_charge")]
public class NmCustomCharge
{
    [Column("nm_custom_charge_id")]
    [Key]
    public long NmCustomChargeId { get; set; }

    [Column("payer_name")]
    [Required]
    public string PayerName { get; set; } = string.Empty;

    [Column("account_id")]
    public long? AccountId { get; set; }

    [Column("category")]
    [Required]
    public string Category { get; set; } = "FACILITY_HIRE";

    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    [Column("status")]
    [Required]
    public string Status { get; set; } = "PENDING";

    [Column("receipt_no")]
    public string? ReceiptNo { get; set; }

    [Column("paid_at")]
    public DateTime? PaidAt { get; set; }

    [Column("payment_method")]
    public string? PaymentMethod { get; set; }

    [Column("reference_code")]
    public string? ReferenceCode { get; set; }

    [Column("created_by_username")]
    public string? CreatedByUsername { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    [Column("updated_by_user_id")]
    public long? UpdatedByUserId { get; set; }

    public virtual MAccount? Account { get; set; }

    public virtual ICollection<NmCustomChargeLine> LineItems { get; set; } = new HashSet<NmCustomChargeLine>();
}

[Table("Nm_custom_charge_line")]
public class NmCustomChargeLine
{
    [Column("nm_custom_charge_line_id")]
    [Key]
    public long NmCustomChargeLineId { get; set; }

    [Column("nm_custom_charge_id")]
    public long NmCustomChargeId { get; set; }

    [Column("description")]
    [Required]
    public string Description { get; set; } = string.Empty;

    [Column("unit_price")]
    public decimal UnitPrice { get; set; }

    [Column("quantity")]
    public decimal Quantity { get; set; } = 1;

    [Column("subtotal")]
    public decimal Subtotal { get; set; }

    public virtual NmCustomCharge Charge { get; set; } = null!;
}
