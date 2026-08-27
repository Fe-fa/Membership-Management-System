using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.Lookups;

namespace ClubManagement.Entities.Subscriptions;

[Table("Membership_fee_schedule")]
public class MembershipFeeSchedule
{
    [Column("membership_fee_schedule_id")]
    [Key]
    public long MembershipFeeScheduleId { get; set; }

    [Column("membership_type_id")]
    public long MembershipTypeId { get; set; }

    [Column("joining_fee")]
    public decimal JoiningFee { get; set; }

    [Column("joining_fee_under_30")]
    public decimal JoiningFeeUnder30 { get; set; }

    [Column("annual_subscription")]
    public decimal AnnualSubscription { get; set; }

    [Column("effective_date")]
    public DateOnly EffectiveDate { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("created_by_user_id")]
    public long? CreatedByUserId { get; set; }

    [Column("updated_by_user_id")]
    public long? UpdatedByUserId { get; set; }

    public virtual MembershipType MembershipType { get; set; } = null!;
}
