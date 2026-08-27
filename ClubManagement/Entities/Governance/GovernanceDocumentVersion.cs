using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Governance
{
    [Table("Governance_document_version")]
    public class GovernanceDocumentVersion
    {
        [Column("governance_document_version_id")]
        [Key]
        public long GovernanceDocumentVersionId { get; set; }

        [Column("governance_document_id")]
        public long GovernanceDocumentId { get; set; }

        [Column("version_label")]
        [Required]
        public string VersionLabel { get; set; }

        [Column("effective_date")]
        public DateOnly? EffectiveDate { get; set; }

        [Column("document_url")]
        public string? DocumentUrl { get; set; }

        [Column("status")]
        [Required]
        public string Status { get; set; } = "EFFECTIVE";

        [Column("superseded_by_version_id")]
        public long? SupersededByVersionId { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime? UpdatedAt { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual GovernanceDocument GovernanceDocument { get; set; } = null!;

        public virtual GovernanceDocumentVersion? SupersededBy { get; set; }

        public virtual ICollection<GovernanceDocument> GovernanceDocuments { get; set; } = new HashSet<GovernanceDocument>();

        public virtual ICollection<GovernanceDocumentVersion> GovernanceDocumentVersions { get; set; } = new HashSet<GovernanceDocumentVersion>();

        public virtual ICollection<MApplication> MApplications { get; set; } = new HashSet<MApplication>();

    }
}
