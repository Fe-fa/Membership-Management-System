using System;
using System.Collections.Generic;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Governance;
using ClubManagement.Entities.Discipline;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Tenancy;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.Design;

namespace ClubManagement.Entities
{
    [Table("MApplication")]
    public class MApplication : ITenantScoped
    {
        [Column("application_id")]
        [Key]
        public long ApplicationId { get; set; }

        [Column("tenant_id")]
        public long TenantId { get; set; }

        [Column("application_no")]
        [Required]
        public string ApplicationNo { get; set; } = string.Empty;

        [Column("applicant_profile_id")]
        public long ApplicantProfileId { get; set; }

        [Column("application_form_version_id")]
        public long? ApplicationFormVersionId { get; set; }

        [Column("election_type_id")]
        public long ElectionTypeId { get; set; }

        [Column("proposer_profile_id")]
        public long? ProposerProfileId { get; set; }

        [Column("seconder_profile_id")]
        public long? SeconderProfileId { get; set; }

        [Column("application_status_id")]
        public long ApplicationStatusId { get; set; }

        [Column("received_date")]
        public DateOnly? ReceivedDate { get; set; }

        [Column("club_visits_count")]
        public int ClubVisitsCount { get; set; }

        [Column("club_visits_override")]
        public bool ClubVisitsOverride { get; set; }

        [Column("club_visits_override_reason")]
        public string? ClubVisitsOverrideReason { get; set; }

        [Column("club_visits_override_at")]
        public DateTime? ClubVisitsOverrideAt { get; set; }

        [Column("club_visits_override_by_user_id")]
        public long? ClubVisitsOverrideByUserId { get; set; }

        /// <summary>Set when the General Manager authorizes Stage A to interview.</summary>
        [Column("stage_a_authorized_at")]
        public DateTime? StageAAuthorizedAt { get; set; }

        [Column("stage_a_authorized_by_user_id")]
        public long? StageAAuthorizedByUserId { get; set; }

        [Column("interview_required_flag")]
        public bool InterviewRequiredFlag { get; set; }

        [Column("entrance_fee_amount")]
        public decimal? EntranceFeeAmount { get; set; }

        [Column("annual_subscription_amount")]
        public decimal? AnnualSubscriptionAmount { get; set; }

        [Column("submitted_at")]
        public DateTime? SubmittedAt { get; set; }

        // ---- Added to match the React wizard payload (persisted as JSON) ----
        [Column("form_data_json")]
        public string? FormDataJson { get; set; }

        [Column("completed_steps_json")]
        public string? CompletedStepsJson { get; set; }

        [Column("updated_at")]
        public DateTime? UpdatedAt { get; set; }
        // ---------------------------------------------------------------------

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Applicant { get; set; } = null!;

        public virtual GovernanceDocumentVersion? ApplicationFormVersion { get; set; }

        public virtual ElectionType ElectionType { get; set; } = null!;

        public virtual MProfile? Proposer { get; set; }

        public virtual MProfile? Seconder { get; set; }

        public virtual ApplicationStatus Status { get; set; } = null!;

        public virtual ICollection<AplicationDocument> AplicationDocuments { get; set; } = new HashSet<AplicationDocument>();

        public virtual ICollection<ApplicationSignature> ApplicationSignatures { get; set; } = new HashSet<ApplicationSignature>();

        public virtual ICollection<Endorsement> Endorsements { get; set; } = new HashSet<Endorsement>();

        public virtual ICollection<ApplicationApproval> ApplicationApprovals { get; set; } = new HashSet<ApplicationApproval>();

        public virtual ICollection<ApplicationStatusHistory> ApplicationStatusHistories { get; set; } = new HashSet<ApplicationStatusHistory>();

        public virtual ICollection<Interview> Interviews { get; set; } = new HashSet<Interview>();

        public virtual ICollection<ApplicationClubVisit> ClubVisits { get; set; } = new HashSet<ApplicationClubVisit>();

        public virtual ICollection<MAccount> MAccounts { get; set; } = new HashSet<MAccount>();

        public virtual ICollection<Reinstatement> Reinstatements { get; set; } = new HashSet<Reinstatement>();

        public virtual ICollection<ApplicationExclusion> ApplicationExclusions { get; set; } = new HashSet<ApplicationExclusion>();

    }
}
