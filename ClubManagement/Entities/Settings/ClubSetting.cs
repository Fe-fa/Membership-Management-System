using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Committee;
using ClubManagement.Entities.Tenancy;

namespace ClubManagement.Entities.Settings
{
    [Table("Club_setting")]
    public class ClubSetting : ITenantScoped
    {
        [Column("club_setting_id")]
        [Key]
        public long ClubSettingId { get; set; }

        [Column("tenant_id")]
        public long TenantId { get; set; }

        [Column("setting_key")]
        [Required]
        public string SettingKey { get; set; }

        [Column("setting_value")]
        [Required]
        public string SettingValue { get; set; }

        [Column("effective_date")]
        public DateOnly? EffectiveDate { get; set; }

        [Column("authorizing_resolution_id")]
        public long? AuthorizingResolutionId { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual Resolution? AuthorizingResolution { get; set; }

    }
}
