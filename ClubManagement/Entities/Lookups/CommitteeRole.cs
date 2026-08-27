using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Committee;

namespace ClubManagement.Entities.Lookups
{
    [Table("Committee_role")]
    public class CommitteeRole
    {
        [Column("committee_role_id")]
        [Key]
        public long CommitteeRoleId { get; set; }

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

        [Column("can_approve_credit")]
        public bool CanApproveCredit { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual ICollection<CommitteeMember> CommitteeMembers { get; set; } = new HashSet<CommitteeMember>();

        public virtual ICollection<ApplicationApproval> ApplicationApprovals { get; set; } = new HashSet<ApplicationApproval>();

    }
}
