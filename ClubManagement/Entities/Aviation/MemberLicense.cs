using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.Aviation
{
    [Table("Member_license")]
    public class MemberLicense
    {
        [Column("member_license_id")]
        [Key]
        public long MemberLicenseId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("license_type_id")]
        public long LicenseTypeId { get; set; }

        [Column("license_number")]
        [Required]
        public string LicenseNumber { get; set; }

        [Column("issuer")]
        public string? Issuer { get; set; }

        [Column("issued_date")]
        public DateOnly? IssuedDate { get; set; }

        [Column("expiry_date")]
        public DateOnly? ExpiryDate { get; set; }

        [Column("license_document_id")]
        public long? LicenseDocumentId { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

        public virtual LicenseType LicenseType { get; set; } = null!;

    }
}
