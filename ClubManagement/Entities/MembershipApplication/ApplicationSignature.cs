using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities
{
    [Table("Application_signature")]
    public class ApplicationSignature
    {
        [Column("application_signature_id")]
        [Key]
        public long ApplicationSignatureId { get; set; }

        [Column("application_id")]
        public long ApplicationId { get; set; }

        [Column("signatory_profile_id")]
        public long SignatoryProfileId { get; set; }

        [Column("signatory_role")]
        [Required]
        public string SignatoryRole { get; set; } = string.Empty;

        [Column("signature_image_url")]
        public string? SignatureImageUrl { get; set; }

        [Column("signed_at")]
        public DateTime? SignedAt { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MApplication Application { get; set; } = null!;

        public virtual MProfile Signatory { get; set; } = null!;

    }
}
