using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Subscriptions;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Subscriptions
{
    [Table("MTransaction")]
    public class MTransaction
    {
        [Column("transaction_id")]
        [Key]
        public long TransactionId { get; set; }

        [Column("profile_id")]
        public long? ProfileId { get; set; }

        [Column("account_id")]
        public long? AccountId { get; set; }

        [Column("subscription_id")]
        public long? SubscriptionId { get; set; }

        [Column("fee_type_id")]
        public long FeeTypeId { get; set; }

        [Column("payment_method_id")]
        public long PaymentMethodId { get; set; }

        [Column("payment_status_id")]
        public long PaymentStatusId { get; set; }

        [Column("amount")]
        public decimal Amount { get; set; }

        [Column("payment_date")]
        public DateOnly? PaymentDate { get; set; }

        [Column("cheque_no")]
        public string? ChequeNo { get; set; }

        [Column("cheque_bank_name")]
        public string? ChequeBankName { get; set; }

        [Column("cheque_bank_code")]
        public string? ChequeBankCode { get; set; }

        [Column("cheque_date")]
        public DateOnly? ChequeDate { get; set; }

        [Column("cheque_document_id")]
        public long? ChequeDocumentId { get; set; }

        [Column("mpesa_code")]
        public string? MpesaCode { get; set; }

        [Column("receipt_id")]
        public long? ReceiptId { get; set; }

        [Column("reference_note")]
        public string? ReferenceNote { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile? Profile { get; set; }

        public virtual MAccount? Account { get; set; }

        public virtual Subscription? Subscription { get; set; }

        public virtual FeeType FeeType { get; set; } = null!;

        public virtual PaymentMethod PaymentMethod { get; set; } = null!;

        public virtual PaymentStatus PaymentStatus { get; set; } = null!;

        public virtual MReceiptMaster? Receipt { get; set; }

        public virtual ICollection<Arrears> Arrearses { get; set; } = new HashSet<Arrears>();

    }
}
