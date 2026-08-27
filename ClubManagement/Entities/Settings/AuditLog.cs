using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Settings
{
    [Table("Audit_log")]
    public class AuditLog
    {
        [Column("audit_log_id")]
        [Key]
        public long AuditLogId { get; set; }

        [Column("table_name")]
        [Required]
        public string TableName { get; set; }

        [Column("record_id")]
        public long RecordId { get; set; }

        [Column("action")]
        [Required]
        public string Action { get; set; }

        [Column("old_values")]
        public string? OldValues { get; set; }

        [Column("new_values")]
        public string? NewValues { get; set; }

        [Column("changed_by_user_id")]
        public long? ChangedByUserId { get; set; }

        [Column("changed_at")]
        public DateTime ChangedAt { get; set; }

    }
}
