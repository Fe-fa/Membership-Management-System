using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Committee;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Aviation;
using ClubManagement.Entities.GeneralMeetings;
using ClubManagement.Entities.Guests;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Entities.Guarantorship;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Facilities;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Discipline;
using ClubManagement.Entities.Tenancy;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities
{
    [Table("MProfile")]
    public class MProfile : ITenantScoped
    {
        [Column("profile_id")]
        [Key]
        public long ProfileId { get; set; }

        [Column("tenant_id")]
        public long TenantId { get; set; }

        [Column("account_type_id")]
        public long? AccountTypeId { get; set; }

        [Column("membership_no")]
        public string? MembershipNo { get; set; }

        [Column("title")]
        public string? Title { get; set; }

        [Column("first_name")]
        [Required]
        public string FirstName { get; set; } = string.Empty;

        [Column("middle_name")]
        public string? MiddleName { get; set; }

        [Column("last_name")]
        [Required]
        public string LastName { get; set; } = string.Empty;

        [Column("gender_id")]
        public long? GenderId { get; set; }

        [Column("marital_status_id")]
        public long? MaritalStatusId { get; set; }

        [Column("blood_group_id")]
        public long? BloodGroupId { get; set; }

        [Column("date_of_birth")]
        public DateOnly? DateOfBirth { get; set; }

        [Column("place_of_birth")]
        public string? PlaceOfBirth { get; set; }

        [Column("nationality_id")]
        public long? NationalityId { get; set; }

        [Column("country_of_residence_id")]
        public long? CountryOfResidenceId { get; set; }

        [Column("id_passport_no")]
        public string? IdPassportNo { get; set; }

        [Column("occupation")]
        public string? Occupation { get; set; }

        [Column("company")]
        public string? Company { get; set; }

        [Column("role")]
        public string? Role { get; set; }

        [Column("postal_address")]
        public string? PostalAddress { get; set; }

        [Column("city")]
        public string? City { get; set; }

        [Column("state_country")]
        public string? StateCountry { get; set; }

        [Column("postal_code")]
        public string? PostalCode { get; set; }

        [Column("country_id")]
        public long? CountryId { get; set; }

        [Column("email")]
        public string? Email { get; set; }

        [Column("alt_email")]
        public string? AltEmail { get; set; }

        [Column("tel_intl_prefix")]
        public string? TelIntlPrefix { get; set; }

        [Column("mobile")]
        public string? Mobile { get; set; }

        [Column("tel_other")]
        public string? TelOther { get; set; }

        [Column("photo_url")]
        public string? PhotoUrl { get; set; }

        [Column("data_consent_given")]
        public bool DataConsentGiven { get; set; }

        [Column("privacy_policy_accepted_at")]
        public DateTime? PrivacyPolicyAcceptedAt { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("is_deleted")]
        public bool IsDeleted { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual AccountType? AccountType { get; set; }

        public virtual Gender? Gender { get; set; }

        public virtual MaritalStatus? MaritalStatus { get; set; }

        public virtual BloodGroup? BloodGroup { get; set; }

        public virtual Country? Nationality { get; set; }

        public virtual Country? CountryOfResidence { get; set; }

        public virtual Country? Country { get; set; }

        public virtual ICollection<MApplication> MApplications { get; set; } = new HashSet<MApplication>();

        public virtual ICollection<MApplication> MApplicationsAsProposer { get; set; } = new HashSet<MApplication>();

        public virtual ICollection<MApplication> MApplicationsAsSeconder { get; set; } = new HashSet<MApplication>();

        public virtual ICollection<ApplicationSignature> ApplicationSignatures { get; set; } = new HashSet<ApplicationSignature>();

        public virtual ICollection<Endorsement> Endorsements { get; set; } = new HashSet<Endorsement>();

        public virtual ICollection<CommitteeMember> CommitteeMembers { get; set; } = new HashSet<CommitteeMember>();

        public virtual ICollection<CommitteeMeeting> CommitteeMeetings { get; set; } = new HashSet<CommitteeMeeting>();

        public virtual ICollection<ApplicationApproval> ApplicationApprovals { get; set; } = new HashSet<ApplicationApproval>();

        public virtual ICollection<Interview> Interviews { get; set; } = new HashSet<Interview>();

        public virtual ICollection<MAccount> MAccounts { get; set; } = new HashSet<MAccount>();

        public virtual ICollection<MDependant> MDependants { get; set; } = new HashSet<MDependant>();

        public virtual ICollection<MDependant> MDependantsAsDependantProfile { get; set; } = new HashSet<MDependant>();

        public virtual ICollection<MemberAviationDetail> MemberAviationDetails { get; set; } = new HashSet<MemberAviationDetail>();

        public virtual ICollection<MemberLicense> MemberLicenses { get; set; } = new HashSet<MemberLicense>();

        public virtual ICollection<MemberAircraft> MemberAircrafts { get; set; } = new HashSet<MemberAircraft>();

        public virtual ICollection<MemberClubAffiliation> MemberClubAffiliations { get; set; } = new HashSet<MemberClubAffiliation>();

        public virtual ICollection<MGuest> MGuests { get; set; } = new HashSet<MGuest>();

        public virtual ICollection<MGuest> MGuestsAsIntroducedBy { get; set; } = new HashSet<MGuest>();

        public virtual ICollection<MVisit> MVisits { get; set; } = new HashSet<MVisit>();

        public virtual ICollection<ReciprocalUsage> ReciprocalUsages { get; set; } = new HashSet<ReciprocalUsage>();

        public virtual ICollection<MTransaction> MTransactions { get; set; } = new HashSet<MTransaction>();

        public virtual ICollection<DisciplinaryAction> DisciplinaryActions { get; set; } = new HashSet<DisciplinaryAction>();

        public virtual ICollection<Reinstatement> Reinstatements { get; set; } = new HashSet<Reinstatement>();

        public virtual ICollection<CreditFacility> CreditFacilities { get; set; } = new HashSet<CreditFacility>();

        public virtual ICollection<Complaint> Complaints { get; set; } = new HashSet<Complaint>();

        public virtual ICollection<UserAccount> UserAccounts { get; set; } = new HashSet<UserAccount>();

        public virtual ICollection<GeneralMeeting> GeneralMeetings { get; set; } = new HashSet<GeneralMeeting>();

        public virtual ICollection<Proxy> Proxies { get; set; } = new HashSet<Proxy>();

        public virtual ICollection<Proxy> ProxiesAsProxyProfile { get; set; } = new HashSet<Proxy>();

        public virtual ICollection<MemberVote> MemberVotes { get; set; } = new HashSet<MemberVote>();

        public virtual ICollection<MemberGuarantorship> MemberGuarantorships { get; set; } = new HashSet<MemberGuarantorship>();

        public virtual ICollection<MemberEmergencyContact> MemberEmergencyContacts { get; set; } = new HashSet<MemberEmergencyContact>();

        public virtual ICollection<MemberStatusOverride> MemberStatusOverrides { get; set; } = new HashSet<MemberStatusOverride>();

        public virtual ICollection<ApplicationExclusion> ApplicationExclusions { get; set; } = new HashSet<ApplicationExclusion>();

        public virtual ICollection<DataSharingConsent> DataSharingConsents { get; set; } = new HashSet<DataSharingConsent>();

    }
}
