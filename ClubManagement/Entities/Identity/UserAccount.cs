using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

using ClubManagement.Entities.Tenancy;

namespace ClubManagement.Entities.Identity
{
    [Table("User_account")]
    public class UserAccount : ITenantScoped
    {
        [Column("user_account_id")]
        [Key]
        public long UserAccountId { get; set; }

        [Column("tenant_id")]
        public long TenantId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("username")]
        [Required]
        public string Username { get; set; } = string.Empty;

        [Column("password_hash")]
        [Required]
        public string PasswordHash { get; set; } = string.Empty;

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("account_status")]
        public string AccountStatus { get; set; } = "ACTIVE";

        [Column("must_change_password")]
        public bool MustChangePassword { get; set; }

        [Column("email_verified_at")]
        public DateTime? EmailVerifiedAt { get; set; }

        [Column("password_reset_token")]
        public string? PasswordResetToken { get; set; }

        [Column("password_reset_expires_at")]
        public DateTime? PasswordResetExpiresAt { get; set; }

        [Column("last_login_at")]
        public DateTime? LastLoginAt { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

        public virtual ICollection<UserRole> UserRoles { get; set; } = new HashSet<UserRole>();

    }
}
