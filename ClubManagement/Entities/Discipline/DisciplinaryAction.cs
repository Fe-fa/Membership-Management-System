using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Committee;
using ClubManagement.Entities.Lookups;


namespace ClubManagement.Entities.Discipline
{
    [Table("Disciplinary_action")]
    public class DisciplinaryAction
    {
        [Column("disciplinary_action_id")]
        [Key]
        public long DisciplinaryActionId { get; set; }

        [Column("account_id")]
        public long AccountId { get; set; }

        [Column("action_type_id")]
        public long ActionTypeId { get; set; }

        [Column("reason")]
        public string? Reason { get; set; }

        [Column("decision_date")]
        public DateOnly? DecisionDate { get; set; }

        [Column("effective_from")]
        public DateOnly? EffectiveFrom { get; set; }

        [Column("effective_to")]
        public DateOnly? EffectiveTo { get; set; }

        [Column("imposed_by_meeting_id")]
        public long? ImposedByMeetingId { get; set; }

        [Column("approved_by_profile_id")]
        public long? ApprovedByProfileId { get; set; }

        [Column("status")]
        [Required]
        public string Status { get; set; } = "ACTIVE";

        [Column("notes")]
        public string? Notes { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MAccount Account { get; set; } = null!;

        public virtual DisciplinaryActionType ActionType { get; set; } = null!;

        public virtual CommitteeMeeting? ImposedByMeeting { get; set; }

        public virtual MProfile? ApprovedBy { get; set; }

        public virtual ICollection<Reinstatement> Reinstatements { get; set; } = new HashSet<Reinstatement>();

    }
}
