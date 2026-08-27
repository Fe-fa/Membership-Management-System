using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Lookups
{
    [Table("Application_status")]
    public class ApplicationStatus
    {
        [Column("application_status_id")]
        [Key]
        public long ApplicationStatusId { get; set; }

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

        [Column("is_terminal")]
        public bool IsTerminal { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual ICollection<MApplication> MApplications { get; set; } = new HashSet<MApplication>();

        public virtual ICollection<ApplicationStatusHistory> ApplicationStatusHistories { get; set; } = new HashSet<ApplicationStatusHistory>();

        public virtual ICollection<ApplicationStatusHistory> ApplicationStatusHistoriesAsToStatus { get; set; } = new HashSet<ApplicationStatusHistory>();

    }
}
