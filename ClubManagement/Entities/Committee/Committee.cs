using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Tenancy;

namespace ClubManagement.Entities.Committee
{
    [Table("Committee")]
    public class Committee : ITenantScoped
    {
        [Column("committee_id")]
        [Key]
        public long CommitteeId { get; set; }

        [Column("tenant_id")]
        public long TenantId { get; set; }

        [Column("committee_name")]
        [Required]
        public string CommitteeName { get; set; }

        /// <summary>Logical committee kind, e.g. "main". Used to deactivate the previous active term of the same type.</summary>
        [Column("committee_type")]
        public string CommitteeType { get; set; } = "main";

        [Column("term_start")]
        public DateOnly? TermStart { get; set; }

        [Column("term_end")]
        public DateOnly? TermEnd { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual ICollection<CommitteeMember> CommitteeMembers { get; set; } = new HashSet<CommitteeMember>();

        public virtual ICollection<CommitteeMeeting> CommitteeMeetings { get; set; } = new HashSet<CommitteeMeeting>();

    }
}

