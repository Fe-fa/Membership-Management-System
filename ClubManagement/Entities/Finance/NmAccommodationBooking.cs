using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;

namespace ClubManagement.Entities.Finance;

[Table("Nm_accommodation_booking")]
public class NmAccommodationBooking
{
    [Column("nm_accommodation_booking_id")]
    [Key]
    public long NmAccommodationBookingId { get; set; }

    [Column("guest_name")]
    [Required]
    public string GuestName { get; set; } = string.Empty;

    [Column("phone")]
    public string? Phone { get; set; }

    [Column("email")]
    public string? Email { get; set; }

    [Column("account_id")]
    public long? AccountId { get; set; }

    [Column("accommodation_booking_id")]
    public long? AccommodationBookingId { get; set; }

    [Column("is_guest")]
    public bool IsGuest { get; set; } = true;

    [Column("check_in_date")]
    public DateOnly CheckInDate { get; set; }

    [Column("check_out_date")]
    public DateOnly CheckOutDate { get; set; }

    [Column("number_of_nights")]
    public int NumberOfNights { get; set; }

    [Column("room_number")]
    public string? RoomNumber { get; set; }

    [Column("nightly_rate")]
    public decimal NightlyRate { get; set; }

    [Column("extra_charges")]
    public decimal ExtraCharges { get; set; }

    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    [Column("is_paid_in_advance")]
    public bool IsPaidInAdvance { get; set; }

    [Column("status")]
    [Required]
    public string Status { get; set; } = "PENDING_ADVANCE_PAYMENT";

    [Column("receipt_no")]
    public string? ReceiptNo { get; set; }

    [Column("paid_at")]
    public DateTime? PaidAt { get; set; }

    [Column("payment_method")]
    public string? PaymentMethod { get; set; }

    [Column("reference_code")]
    public string? ReferenceCode { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    [Column("updated_by_user_id")]
    public long? UpdatedByUserId { get; set; }

    public virtual MAccount? Account { get; set; }
}
