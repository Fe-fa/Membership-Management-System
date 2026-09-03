using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Subscriptions
{
    [Table("MReceiptMaster")]
    public class MReceiptMaster
    {
        [Column("receipt_id")]
        [Key]
        public long ReceiptId { get; set; }

        [Column("receipt_number")]
        [Required]
        public string ReceiptNumber { get; set; }

        [Column("transaction_id")]
        public long TransactionId { get; set; }

        [Column("amount")]
        public decimal Amount { get; set; }

        [Column("issued_date")]
        public DateOnly IssuedDate { get; set; }

        [Column("issued_by_user_id")]
        public long? IssuedByUserId { get; set; }

        [Column("cheque_document_id")]
        public long? ChequeDocumentId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MTransaction Transaction { get; set; } = null!;

    }
}
