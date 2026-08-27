using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Settings
{
    [Table("Data_sharing_consent")]
    public class DataSharingConsent
    {
        [Column("data_sharing_consent_id")]
        [Key]
        public long DataSharingConsentId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("third_party_name")]
        [Required]
        public string ThirdPartyName { get; set; }

        [Column("purpose")]
        public string? Purpose { get; set; }

        [Column("consented_flag")]
        public bool ConsentedFlag { get; set; }

        [Column("consented_at")]
        public DateTime? ConsentedAt { get; set; }

        [Column("withdrawn_at")]
        public DateTime? WithdrawnAt { get; set; }

        [Column("privacy_policy_version")]
        public string? PrivacyPolicyVersion { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

    }
}
