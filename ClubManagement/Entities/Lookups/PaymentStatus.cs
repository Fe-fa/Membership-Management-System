using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Subscriptions;

namespace ClubManagement.Entities.Lookups
{
    [Table("Payment_status")]
    public class PaymentStatus
    {
        [Column("payment_status_id")]
        [Key]
        public long PaymentStatusId { get; set; }

        [Column("code")]
        [Required]
        public string Code { get; set; }

        [Column("name")]
        [Required]
        public string Name { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("sort_order")]
        public int SortOrder { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual ICollection<MTransaction> MTransactions { get; set; } = new HashSet<MTransaction>();

    }
}
