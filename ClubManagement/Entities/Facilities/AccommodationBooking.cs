using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Facilities
{
    [Table("Accommodation_booking")]
    public class AccommodationBooking
    {
        [Column("accommodation_booking_id")]
        [Key]
        public long AccommodationBookingId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("check_in_date")]
        public DateOnly CheckInDate { get; set; }

        [Column("check_out_date")]
        public DateOnly CheckOutDate { get; set; }

        [Column("room_type")]
        public string? RoomType { get; set; }

        [Column("nightly_rate")]
        public decimal? NightlyRate { get; set; }

        [Column("cancellation_fee")]
        public decimal? CancellationFee { get; set; }

        [Column("vacated_by_10am_flag")]
        public bool VacatedBy10amFlag { get; set; }

        [Column("status")]
        [Required]
        public string Status { get; set; } = "BOOKED";

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount Account { get; set; } = null!;

    }
}
