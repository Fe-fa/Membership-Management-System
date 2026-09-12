using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Finance;

[Table("Nm_corkage_charge")]
public class NmCorkageCharge
{
    [Column("nm_corkage_charge_id")]
    [Key]
    public long NmCorkageChargeId { get; set; }

    [Column("payer_name")]
    [Required]
    public string PayerName { get; set; } = string.Empty;

    [Column("account_id")]
    public long? AccountId { get; set; }

    [Column("is_guest")]
    public bool IsGuest { get; set; } = true;

    [Column("item_description")]
    [Required]
    public string ItemDescription { get; set; } = string.Empty;

    [Column("fee_amount")]
    public decimal FeeAmount { get; set; }

    [Column("authorized_by_manager")]
    public bool AuthorizedByManager { get; set; }

    [Column("manager_name")]
    public string? ManagerName { get; set; }

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

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    [Column("updated_by_user_id")]
    public long? UpdatedByUserId { get; set; }

    public virtual MAccount? Account { get; set; }
}
