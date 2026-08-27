using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Engagement
{
    [Table("Complaint")]
    public class Complaint
    {
        [Column("complaint_id")]
        [Key]
        public long ComplaintId { get; set; }

        [Column("complainant_profile_id")]
        public long ComplainantProfileId { get; set; }

        [Column("subject")]
        [Required]
        public string Subject { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("received_date")]
        public DateOnly ReceivedDate { get; set; }

        [Column("handled_by_user_id")]
        public long? HandledByUserId { get; set; }

        [Column("status")]
        [Required]
        public string Status { get; set; } = "OPEN";

        [Column("resolution")]
        public string? Resolution { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Complainant { get; set; } = null!;

    }
}
