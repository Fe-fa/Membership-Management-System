using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Identity
{
    [Table("User_role")]
    public class UserRole
    {
        [Column("user_role_id")]
        [Key]
        public long UserRoleId { get; set; }

        [Column("user_account_id")]
        public long UserAccountId { get; set; }

        [Column("role_id")]
        public long RoleId { get; set; }

        [Column("assigned_date")]
        public DateOnly AssignedDate { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual UserAccount UserAccount { get; set; } = null!;

        public virtual SystemRole Role { get; set; } = null!;

    }
}
