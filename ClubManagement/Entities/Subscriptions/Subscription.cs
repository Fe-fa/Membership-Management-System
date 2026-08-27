using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Subscriptions;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Subscriptions
{
    [Table("Subscription")]
    public class Subscription
    {
        [Column("subscription_id")]
        [Key]
        public long SubscriptionId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("subscription_year")]
        public int SubscriptionYear { get; set; }

        [Column("amount_due")]
        public decimal AmountDue { get; set; }

        [Column("due_date")]
        public DateOnly? DueDate { get; set; }

        [Column("posted_date")]
        public DateOnly? PostedDate { get; set; }

        [Column("removal_date")]
        public DateOnly? RemovalDate { get; set; }

        [Column("amount_paid")]
        public decimal AmountPaid { get; set; }

        [Column("arrears_amount")]
        public decimal ArrearsAmount { get; set; }

        [Column("subscription_status_id")]
        public long SubscriptionStatusId { get; set; }

        [Column("waived_flag")]
        public bool WaivedFlag { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount Account { get; set; } = null!;

        public virtual MemberStatus Status { get; set; } = null!;

        public virtual ICollection<MTransaction> MTransactions { get; set; } = new HashSet<MTransaction>();

        public virtual ICollection<Arrears> Arrearses { get; set; } = new HashSet<Arrears>();

    }
}
