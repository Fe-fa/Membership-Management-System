using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities
{
    [Table("Application_approval")]
    public class ApplicationApproval
    {
        [Column("application_approval_id")]
        [Key]
        public long ApplicationApprovalId { get; set; }

        [Column("application_id")]
        public long ApplicationId { get; set; }

        [Column("approver_profile_id")]
        public long ApproverProfileId { get; set; }

        [Column("approver_role_id")]
        public long ApproverRoleId { get; set; }

        [Column("approval_decision")]
        [Required]
        public string ApprovalDecision { get; set; } = string.Empty;

        [Column("approval_signature_url")]
        public string? ApprovalSignatureUrl { get; set; }

        [Column("approved_at")]
        public DateTime? ApprovedAt { get; set; }

        [Column("date_elected")]
        public DateOnly? DateElected { get; set; }

        [Column("remarks")]
        public string? Remarks { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MApplication Application { get; set; } = null!;

        public virtual MProfile Approver { get; set; } = null!;

        public virtual CommitteeRole ApproverRole { get; set; } = null!;

    }
}
