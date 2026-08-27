using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Governance;

namespace ClubManagement.Entities.Lookups
{
    [Table("Document_type")]
    public class DocumentType
    {
        [Column("document_type_id")]
        [Key]
        public long DocumentTypeId { get; set; }

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

        public virtual ICollection<GovernanceDocument> GovernanceDocuments { get; set; } = new HashSet<GovernanceDocument>();

        public virtual ICollection<AplicationDocument> AplicationDocuments { get; set; } = new HashSet<AplicationDocument>();

    }
}
