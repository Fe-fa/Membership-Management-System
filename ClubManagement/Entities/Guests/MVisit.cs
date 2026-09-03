using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Guests
{
    [Table("MVisit")]
    public class MVisit
    {
        [Column("visit_id")]
        [Key]
        public long VisitId { get; set; }

        [Column("guest_id")]
        public long GuestId { get; set; }

        [Column("visiting_profile_id")]
        public long VisitingProfileId { get; set; }

        [Column("visit_date")]
        public DateOnly VisitDate { get; set; }

        [Column("time_in")]
        public TimeOnly? TimeIn { get; set; }

        [Column("time_out")]
        public TimeOnly? TimeOut { get; set; }

        [Column("guest_book_entry_no")]
        public string? GuestBookEntryNo { get; set; }

        [Column("notes")]
        public string? Notes { get; set; }

        [Column("is_current_flag")]
        public bool IsCurrentFlag { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MGuest Guest { get; set; } = null!;

        public virtual MProfile Visitor { get; set; } = null!;

    }
}
