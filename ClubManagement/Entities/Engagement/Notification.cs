using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.Engagement
{
    [Table("Notification")]
    public class Notification
    {
        [Column("notification_id")]
        [Key]
        public long NotificationId { get; set; }

        [Column("account_id")]
        public long? AccountId { get; set; }

        [Column("notification_type_id")]
        public long NotificationTypeId { get; set; }

        [Column("recipient")]
        [Required]
        public string Recipient { get; set; }

        [Column("channel")]
        [Required]
        public string Channel { get; set; }

        [Column("sent_date")]
        public DateTime? SentDate { get; set; }

        [Column("content")]
        public string? Content { get; set; }

        [Column("related_entity_type")]
        public string? RelatedEntityType { get; set; }

        [Column("related_entity_id")]
        public long? RelatedEntityId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount? Account { get; set; }

        public virtual NotificationType NotificationType { get; set; } = null!;

    }
}

