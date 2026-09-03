using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities
{
    [Table("Application_status_history")]
    public class ApplicationStatusHistory
    {
        [Column("application_status_history_id")]
        [Key]
        public long ApplicationStatusHistoryId { get; set; }

        [Column("application_id")]
        public long ApplicationId { get; set; }

        [Column("from_status_id")]
        public long? FromStatusId { get; set; }

        [Column("to_status_id")]
        public long ToStatusId { get; set; }

        [Column("changed_at")]
        public DateTime ChangedAt { get; set; }

        [Column("changed_by_user_id")]
        public long? ChangedByUserId { get; set; }

        [Column("reason")]
        public string? Reason { get; set; }

        [Column("action")]
        [MaxLength(40)]
        public string? Action { get; set; }

        public virtual MApplication Application { get; set; } = null!;

        public virtual ApplicationStatus? FromStatus { get; set; }

        public virtual ApplicationStatus ToStatus { get; set; } = null!;

    }
}
