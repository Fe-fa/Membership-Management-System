using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.Governance
{
    [Table("Governance_document")]
    public class GovernanceDocument
    {
        [Column("governance_document_id")]
        [Key]
        public long GovernanceDocumentId { get; set; }

        [Column("document_name")]
        [Required]
        public string DocumentName { get; set; }

        [Column("document_type_id")]
        public long DocumentTypeId { get; set; }

        [Column("current_version_id")]
        public long? CurrentVersionId { get; set; }

        [Column("code")]
        public string? Code { get; set; }

        [Column("name")]
        public string? Name { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("sort_order")]
        public int SortOrder { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        public virtual DocumentType DocumentType { get; set; } = null!;

        public virtual GovernanceDocumentVersion? CurrentVersion { get; set; }

        public virtual ICollection<GovernanceDocumentVersion> GovernanceDocumentVersions { get; set; } = new HashSet<GovernanceDocumentVersion>();

    }
}
