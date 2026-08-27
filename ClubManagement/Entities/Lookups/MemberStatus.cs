using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Entities.MembershipAccount;


namespace ClubManagement.Entities.Lookups
{
    [Table("Member_status")]
    public class MemberStatus
    {
        [Column("member_status_id")]
        [Key]
        public long MemberStatusId { get; set; }

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

        [Column("is_terminal")]
        public bool IsTerminal { get; set; }

        [Column("is_active_status")]
        public bool IsActiveStatus { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual ICollection<MAccount> MAccounts { get; set; } = new HashSet<MAccount>();

        public virtual ICollection<MemberStatusHistory> MemberStatusHistories { get; set; } = new HashSet<MemberStatusHistory>();

        public virtual ICollection<MemberStatusHistory> MemberStatusHistoriesAsToStatus { get; set; } = new HashSet<MemberStatusHistory>();

        public virtual ICollection<Subscription> Subscriptions { get; set; } = new HashSet<Subscription>();

    }
}
