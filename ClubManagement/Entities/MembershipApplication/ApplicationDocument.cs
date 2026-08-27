using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;
using System.Xml.Linq;

namespace ClubManagement.Entities
{
    [Table("Aplication_document")]
    public class AplicationDocument
    {
        [Column("application_document_id")]
        [Key]
        public long ApplicationDocumentId { get; set; }

        [Column("application_id")]
        public long ApplicationId { get; set; }

        [Column("document_type_id")]
        public long DocumentTypeId { get; set; }

        [Column("file_name")]
        [Required]
        public string FileName { get; set; } = string.Empty;

        [Column("file_url")]
        [Required]
        public string FileUrl { get; set; } = string.Empty;

        [Column("uploaded_at")]
        public DateTime? UploadedAt { get; set; }

        [Column("uploaded_by_user_id")]
        public long? UploadedByUserId { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        [Column("is_verified")]
        public bool IsVerified { get; set; }

        [Column("verification_status")]
        public string? VerificationStatus { get; set; }

        [Column("verification_notes")]
        public string? VerificationNotes { get; set; }

        [Column("verified_at")]
        public DateTime? VerifiedAt { get; set; }

        [Column("verified_by_user_id")]
        public long? VerifiedByUserId { get; set; }

        public virtual MApplication Application { get; set; } = null!;

        public virtual DocumentType DocumentType { get; set; } = null!;

    }
}
