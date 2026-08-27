using ClubManagement.Auth;
using ClubManagement.Entities;
using ClubManagement.Entities.Aviation;
using ClubManagement.Entities.Committee;
using ClubManagement.Entities.Discipline;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Facilities;
using ClubManagement.Entities.GeneralMeetings;
using ClubManagement.Entities.Governance;
using ClubManagement.Entities.Guarantorship;
using ClubManagement.Entities.Guests;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Entities.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Data.MembershipApplication;

public partial class ApplicationModuleDbContext : DbContext
{
    private readonly ITenantContext? _tenant;

    public ApplicationModuleDbContext(
        DbContextOptions<ApplicationModuleDbContext> options,
        ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    /// <summary>Used by EF global query filters (re-read each query).</summary>
    public long? CurrentTenantId => _tenant is { IsResolved: true } ? _tenant.TenantId : null;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<MProfile> Profiles => Set<MProfile>();
    public DbSet<MApplication> Applications => Set<MApplication>();
    public DbSet<AplicationDocument> ApplicationDocuments => Set<AplicationDocument>();
    public DbSet<ApplicationClubVisit> ApplicationClubVisits => Set<ApplicationClubVisit>();
    public DbSet<Endorsement> Endorsements => Set<Endorsement>();
    public DbSet<ApplicationSignature> ApplicationSignatures => Set<ApplicationSignature>();
    public DbSet<ApplicationApproval> ApplicationApprovals => Set<ApplicationApproval>();
    public DbSet<ApplicationStatusHistory> ApplicationStatusHistories => Set<ApplicationStatusHistory>();
    public DbSet<Interview> Interviews => Set<Interview>();
    public DbSet<ApplicationExclusion> ApplicationExclusions => Set<ApplicationExclusion>();

    // Account + subscription sets used by the members / supporters endpoints.
    public DbSet<MAccount> Accounts => Set<MAccount>();
    public DbSet<Arrears> Arrearses => Set<Arrears>();

    // ---- Lookup tables (wizard fields are resolved to these FK ids) ----
    public DbSet<Gender> Genders => Set<Gender>();
    public DbSet<BloodGroup> BloodGroups => Set<BloodGroup>();
    public DbSet<MaritalStatus> MaritalStatuses => Set<MaritalStatus>();
    public DbSet<Country> Countries => Set<Country>();
    public DbSet<LicenseType> LicenseTypes => Set<LicenseType>();
    public DbSet<AircraftType> AircraftTypes => Set<AircraftType>();
    public DbSet<AffiliationType> AffiliationTypes => Set<AffiliationType>();
    public DbSet<RelationshipType> RelationshipTypes => Set<RelationshipType>();
    public DbSet<ClubType> ClubTypes => Set<ClubType>();
    public DbSet<Club> Clubs => Set<Club>();
    public DbSet<MembershipType> MembershipTypes => Set<MembershipType>();
    public DbSet<ApplicationStatus> ApplicationStatuses => Set<ApplicationStatus>();
    public DbSet<DocumentType> DocumentTypes => Set<DocumentType>();
    public DbSet<MemberStatus> MemberStatuses => Set<MemberStatus>();
    public DbSet<ElectionType> ElectionTypes => Set<ElectionType>();

    // ---- Applicant child tables (1:N from MProfile / MApplication) ----
    public DbSet<MDependant> Dependants => Set<MDependant>();
    public DbSet<MemberEmergencyContact> MemberEmergencyContacts => Set<MemberEmergencyContact>();
    public DbSet<MemberAviationDetail> MemberAviationDetails => Set<MemberAviationDetail>();
    public DbSet<MemberLicense> MemberLicenses => Set<MemberLicense>();
    public DbSet<MemberAircraft> MemberAircrafts => Set<MemberAircraft>();
    public DbSet<MemberClubAffiliation> MemberClubAffiliations => Set<MemberClubAffiliation>();

    public DbSet<MVisit> Visits => Set<MVisit>();
    public DbSet<ReciprocalUsage> ReciprocalUsages => Set<ReciprocalUsage>();
    public DbSet<MGuest> Guests => Set<MGuest>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<MTransaction> Transactions => Set<MTransaction>();
    public DbSet<MReceiptMaster> Receipts => Set<MReceiptMaster>();
    public DbSet<FeeWaiver> FeeWaivers => Set<FeeWaiver>();
    public DbSet<MembershipFeeSchedule> MembershipFeeSchedules => Set<MembershipFeeSchedule>();
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<SystemRole> SystemRoles => Set<SystemRole>();
    public DbSet<ClubSetting> ClubSettings => Set<ClubSetting>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationType> NotificationTypes => Set<NotificationType>();
    public DbSet<PaymentMethod> PaymentMethods => Set<PaymentMethod>();
    public DbSet<PaymentStatus> PaymentStatuses => Set<PaymentStatus>();
    public DbSet<FeeType> FeeTypes => Set<FeeType>();
    public DbSet<GuestStatus> GuestStatuses => Set<GuestStatus>();
    public DbSet<Committee> Committees => Set<Committee>();
    public DbSet<CommitteeMember> CommitteeMembers => Set<CommitteeMember>();
    public DbSet<CommitteeMeeting> CommitteeMeetings => Set<CommitteeMeeting>();
    public DbSet<CommitteeRole> CommitteeRoles => Set<CommitteeRole>();
    public DbSet<MeetingType> MeetingTypes => Set<MeetingType>();
    public DbSet<AccommodationBooking> AccommodationBookings => Set<AccommodationBooking>();
    public DbSet<GeneralMeeting> GeneralMeetings => Set<GeneralMeeting>();
    public DbSet<MemberStatusHistory> MemberStatusHistories => Set<MemberStatusHistory>();
    public DbSet<MemberStatusOverride> MemberStatusOverrides => Set<MemberStatusOverride>();
    public DbSet<DisciplinaryAction> DisciplinaryActions => Set<DisciplinaryAction>();
    public DbSet<Reinstatement> Reinstatements => Set<Reinstatement>();
    public DbSet<Complaint> Complaints => Set<Complaint>();
    public DbSet<CreditFacility> CreditFacilities => Set<CreditFacility>();
    public DbSet<DataSharingConsent> DataSharingConsents => Set<DataSharingConsent>();
    public DbSet<MemberGuarantorship> MemberGuarantorships => Set<MemberGuarantorship>();
    public DbSet<MeetingAttendance> MeetingAttendances => Set<MeetingAttendance>();
    public DbSet<Resolution> Resolutions => Set<Resolution>();
    public DbSet<ResolutionType> ResolutionTypes => Set<ResolutionType>();
    public DbSet<AccountType> AccountTypes => Set<AccountType>();
    public DbSet<DisciplinaryActionType> DisciplinaryActionTypes => Set<DisciplinaryActionType>();
    public DbSet<MeetingAgendaItem> MeetingAgendaItems => Set<MeetingAgendaItem>();
    public DbSet<MemberVote> MemberVotes => Set<MemberVote>();
    public DbSet<Proxy> Proxies => Set<Proxy>();
    public DbSet<CommitteeBallotItem> CommitteeBallotItems => Set<CommitteeBallotItem>();
    public DbSet<CommitteeBallotVote> CommitteeBallotVotes => Set<CommitteeBallotVote>();
    public DbSet<ElectionNomination> ElectionNominations => Set<ElectionNomination>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MProfile>(entity =>
        {
            entity.HasKey(x => x.ProfileId);
        });

        modelBuilder.Entity<MApplication>(entity =>
        {
            entity.HasKey(x => x.ApplicationId);

            entity.HasOne(x => x.Applicant)
                .WithMany(x => x.MApplications)
                .HasForeignKey(x => x.ApplicantProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Proposer)
                .WithMany(x => x.MApplicationsAsProposer)
                .HasForeignKey(x => x.ProposerProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Seconder)
                .WithMany(x => x.MApplicationsAsSeconder)
                .HasForeignKey(x => x.SeconderProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.ApplicationFormVersion)
                .WithMany(x => x.MApplications)
                .HasForeignKey(x => x.ApplicationFormVersionId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.ElectionType)
                .WithMany(x => x.MApplications)
                .HasForeignKey(x => x.ElectionTypeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Status)
                .WithMany(x => x.MApplications)
                .HasForeignKey(x => x.ApplicationStatusId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AplicationDocument>(entity =>
        {
            entity.HasKey(x => x.ApplicationDocumentId);

            entity.HasOne(x => x.Application)
                .WithMany(x => x.AplicationDocuments)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.DocumentType)
                .WithMany(x => x.AplicationDocuments)
                .HasForeignKey(x => x.DocumentTypeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ApplicationClubVisit>(entity =>
        {
            entity.HasKey(x => x.ApplicationClubVisitId);

            entity.HasOne(x => x.Application)
                .WithMany(x => x.ClubVisits)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Endorsement>(entity =>
        {
            entity.HasKey(x => x.EndorsementId);

            entity.HasOne(x => x.Application)
                .WithMany(x => x.Endorsements)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Endorser)
                .WithMany(x => x.Endorsements)
                .HasForeignKey(x => x.EndorserProfileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ApplicationSignature>(entity =>
        {
            entity.HasKey(x => x.ApplicationSignatureId);

            entity.HasOne(x => x.Application)
                .WithMany(x => x.ApplicationSignatures)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Signatory)
                .WithMany(x => x.ApplicationSignatures)
                .HasForeignKey(x => x.SignatoryProfileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ApplicationApproval>(entity =>
        {
            entity.HasKey(x => x.ApplicationApprovalId);

            entity.HasOne(x => x.Application)
                .WithMany(x => x.ApplicationApprovals)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Approver)
                .WithMany(x => x.ApplicationApprovals)
                .HasForeignKey(x => x.ApproverProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.ApproverRole)
                .WithMany(x => x.ApplicationApprovals)
                .HasForeignKey(x => x.ApproverRoleId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ApplicationStatusHistory>(entity =>
        {
            entity.HasKey(x => x.ApplicationStatusHistoryId);

            entity.HasOne(x => x.Application)
                .WithMany(x => x.ApplicationStatusHistories)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.FromStatus)
                .WithMany(x => x.ApplicationStatusHistories)
                .HasForeignKey(x => x.FromStatusId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.ToStatus)
                .WithMany(x => x.ApplicationStatusHistoriesAsToStatus)
                .HasForeignKey(x => x.ToStatusId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Interview>(entity =>
        {
            entity.HasKey(x => x.InterviewId);

            entity.HasOne(x => x.Application)
                .WithMany(x => x.Interviews)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.CommitteeMeeting)
                .WithMany(x => x.Interviews)
                .HasForeignKey(x => x.CommitteeMeetingId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Interviewer)
                .WithMany(x => x.Interviews)
                .HasForeignKey(x => x.InterviewerProfileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ApplicationExclusion>(entity =>
        {
            entity.HasKey(x => x.ApplicationExclusionId);

            entity.HasOne(x => x.Application)
                .WithMany(x => x.ApplicationExclusions)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Applicant)
                .WithMany(x => x.ApplicationExclusions)
                .HasForeignKey(x => x.ApplicantProfileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Proxy>(entity =>
        {
            entity.HasKey(x => x.ProxyId);

            entity.HasOne(x => x.AppointingProfile)
                .WithMany(x => x.Proxies)
                .HasForeignKey(x => x.AppointingProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.ProxyProfile)
                .WithMany(x => x.ProxiesAsProxyProfile)
                .HasForeignKey(x => x.ProxyProfileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GovernanceDocument>(entity =>
        {
            entity.HasKey(x => x.GovernanceDocumentId);

            entity.HasOne(x => x.DocumentType)
                .WithMany(x => x.GovernanceDocuments)
                .HasForeignKey(x => x.DocumentTypeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.CurrentVersion)
                .WithMany(x => x.GovernanceDocuments)
                .HasForeignKey(x => x.CurrentVersionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GovernanceDocumentVersion>(entity =>
        {
            entity.HasKey(x => x.GovernanceDocumentVersionId);

            entity.HasOne(x => x.GovernanceDocument)
                .WithMany(x => x.GovernanceDocumentVersions)
                .HasForeignKey(x => x.GovernanceDocumentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.SupersededBy)
                .WithMany(x => x.GovernanceDocumentVersions)
                .HasForeignKey(x => x.SupersededByVersionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MGuest>(entity =>
        {
            entity.HasKey(x => x.GuestId);

            entity.HasOne(x => x.GuestProfile)
                .WithMany(x => x.MGuests)
                .HasForeignKey(x => x.GuestProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.IntroducedBy)
                .WithMany(x => x.MGuestsAsIntroducedBy)
                .HasForeignKey(x => x.IntroducedByProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.GuestStatus)
                .WithMany(x => x.MGuests)
                .HasForeignKey(x => x.GuestStatusId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MDependant>(entity =>
        {
            entity.HasKey(x => x.DependantId);

            entity.HasOne(x => x.Principal)
                .WithMany(x => x.MDependants)
                .HasForeignKey(x => x.ProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.DependantProfile)
                .WithMany(x => x.MDependantsAsDependantProfile)
                .HasForeignKey(x => x.DependantProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.RelationshipType)
                .WithMany(x => x.MDependants)
                .HasForeignKey(x => x.RelationshipTypeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberAviationDetail>(entity =>
        {
            entity.HasKey(x => x.MemberAviationDetailId);

            entity.HasOne(x => x.Profile)
                .WithMany(x => x.MemberAviationDetails)
                .HasForeignKey(x => x.ProfileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberLicense>(entity =>
        {
            entity.HasKey(x => x.MemberLicenseId);

            entity.HasOne(x => x.Profile)
                .WithMany(x => x.MemberLicenses)
                .HasForeignKey(x => x.ProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.LicenseType)
                .WithMany(x => x.MemberLicenses)
                .HasForeignKey(x => x.LicenseTypeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberAircraft>(entity =>
        {
            entity.HasKey(x => x.MemberAircraftId);

            entity.HasOne(x => x.Profile)
                .WithMany(x => x.MemberAircrafts)
                .HasForeignKey(x => x.ProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.AircraftType)
                .WithMany(x => x.MemberAircrafts)
                .HasForeignKey(x => x.AircraftTypeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberClubAffiliation>(entity =>
        {
            entity.HasKey(x => x.MemberClubAffiliationId);

            entity.HasOne(x => x.Profile)
                .WithMany(x => x.MemberClubAffiliations)
                .HasForeignKey(x => x.ProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Club)
                .WithMany(x => x.MemberClubAffiliations)
                .HasForeignKey(x => x.ClubId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.AffiliationType)
                .WithMany(x => x.MemberClubAffiliations)
                .HasForeignKey(x => x.AffiliationTypeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberEmergencyContact>(entity =>
        {
            entity.HasKey(x => x.MemberEmergencyContactId);

            entity.HasOne(x => x.Profile)
                .WithMany(x => x.MemberEmergencyContacts)
                .HasForeignKey(x => x.ProfileId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.RelationshipType)
                .WithMany(x => x.MemberEmergencyContacts)
                .HasForeignKey(x => x.RelationshipTypeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MProfile>(entity =>
        {
            entity.HasKey(x => x.ProfileId);

            entity.HasOne(x => x.Nationality)
                .WithMany(x => x.MProfiles)
                .HasForeignKey(x => x.NationalityId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.CountryOfResidence)
                .WithMany(x => x.MProfilesAsCountryOfResidence)
                .HasForeignKey(x => x.CountryOfResidenceId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Country)
                .WithMany(x => x.MProfilesAsCountry)
                .HasForeignKey(x => x.CountryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberStatusHistory>(entity =>
        {
            entity.HasKey(x => x.MemberStatusHistoryId);

            entity.HasOne(x => x.Account)
                .WithMany(x => x.MemberStatusHistories)
                .HasForeignKey(x => x.AccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.FromStatus)
                .WithMany(x => x.MemberStatusHistories)
                .HasForeignKey(x => x.FromStatusId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.ToStatus)
                .WithMany(x => x.MemberStatusHistoriesAsToStatus)
                .HasForeignKey(x => x.ToStatusId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<FeeWaiver>(entity =>
        {
            entity.HasKey(x => x.FeeWaiverId);

            entity.HasOne(x => x.Account)
                .WithMany(x => x.FeeWaivers)
                .HasForeignKey(x => x.AccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.ParentAccount)
                .WithMany(x => x.FeeWaiversAsParentAccount)
                .HasForeignKey(x => x.ParentAccountId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.FeeType)
                .WithMany(x => x.FeeWaivers)
                .HasForeignKey(x => x.FeeTypeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MReceiptMaster>(entity =>
        {
            entity.HasKey(x => x.ReceiptId);

            entity.HasOne(r => r.Transaction)
                .WithOne(t => t.Receipt)
                .HasForeignKey<MReceiptMaster>(r => r.TransactionId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(x => x.ReceiptNumber).IsUnique();
        });

        ConfigureLifecycle(modelBuilder);
        ConfigureIndexes(modelBuilder);
        ConfigureTenantFilters(modelBuilder);
    }

    private static void ConfigureLifecycle(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MAccount>(entity =>
        {
            entity.HasKey(x => x.AccountId);
            entity.HasIndex(x => new { x.TenantId, x.MembershipNo }).IsUnique();
            entity.HasOne(x => x.Profile).WithMany(x => x.MAccounts).HasForeignKey(x => x.ProfileId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Application).WithMany(x => x.MAccounts).HasForeignKey(x => x.ApplicationId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.MembershipType).WithMany(x => x.MAccounts).HasForeignKey(x => x.MembershipTypeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ElectionType).WithMany(x => x.MAccounts).HasForeignKey(x => x.ElectionTypeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.CurrentMemberStatus).WithMany(x => x.MAccounts).HasForeignKey(x => x.CurrentMemberStatusId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.HasKey(x => x.SubscriptionId);
            entity.HasIndex(x => new { x.AccountId, x.SubscriptionYear }).IsUnique();
            entity.HasOne(x => x.Account).WithMany(x => x.Subscriptions).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Status).WithMany(x => x.Subscriptions).HasForeignKey(x => x.SubscriptionStatusId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MTransaction>(entity =>
        {
            entity.HasKey(x => x.TransactionId);
            entity.HasOne(x => x.Profile).WithMany(x => x.MTransactions).HasForeignKey(x => x.ProfileId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Account).WithMany(x => x.MTransactions).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Subscription).WithMany(x => x.MTransactions).HasForeignKey(x => x.SubscriptionId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.FeeType).WithMany(x => x.MTransactions).HasForeignKey(x => x.FeeTypeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.PaymentMethod).WithMany(x => x.MTransactions).HasForeignKey(x => x.PaymentMethodId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.PaymentStatus).WithMany(x => x.MTransactions).HasForeignKey(x => x.PaymentStatusId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Arrears>(entity =>
        {
            entity.HasKey(x => x.ArrearsId);
            entity.HasOne(x => x.Account).WithMany(x => x.Arrearses).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Subscription).WithMany(x => x.Arrearses).HasForeignKey(x => x.SubscriptionId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.SettledByTransaction).WithMany(x => x.Arrearses).HasForeignKey(x => x.SettledByTransactionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MVisit>(entity =>
        {
            entity.HasKey(x => x.VisitId);
            entity.HasOne(x => x.Guest).WithMany(x => x.MVisits).HasForeignKey(x => x.GuestId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Visitor).WithMany(x => x.MVisits).HasForeignKey(x => x.VisitingProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ReciprocalUsage>(entity =>
        {
            entity.HasKey(x => x.ReciprocalUsageId);
            entity.HasOne(x => x.Profile).WithMany(x => x.ReciprocalUsages).HasForeignKey(x => x.ProfileId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.HomeClub).WithMany(x => x.ReciprocalUsages).HasForeignKey(x => x.HomeClubId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.HasKey(x => x.UserAccountId);
            entity.HasIndex(x => x.Username).IsUnique();
            entity.HasOne(x => x.Profile).WithMany(x => x.UserAccounts).HasForeignKey(x => x.ProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.HasKey(x => x.UserRoleId);
            entity.HasIndex(x => new { x.UserAccountId, x.RoleId }).IsUnique();
            entity.HasOne(x => x.UserAccount).WithMany(x => x.UserRoles).HasForeignKey(x => x.UserAccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Role).WithMany(x => x.UserRoles).HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ClubSetting>(entity =>
        {
            entity.HasKey(x => x.ClubSettingId);
            entity.HasIndex(x => x.SettingKey).IsUnique();
            entity.HasOne(x => x.AuthorizingResolution).WithMany(x => x.ClubSettings).HasForeignKey(x => x.AuthorizingResolutionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MembershipFeeSchedule>(entity =>
        {
            entity.HasKey(x => x.MembershipFeeScheduleId);
            entity.HasIndex(x => new { x.MembershipTypeId, x.EffectiveDate }).IsUnique();
            entity.HasOne(x => x.MembershipType).WithMany().HasForeignKey(x => x.MembershipTypeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(x => x.NotificationId);
            entity.HasOne(x => x.Account).WithMany(x => x.Notifications).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.NotificationType).WithMany(x => x.Notifications).HasForeignKey(x => x.NotificationTypeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CommitteeMember>(entity =>
        {
            entity.HasKey(x => x.CommitteeMemberId);
            entity.HasOne(x => x.Committee).WithMany(x => x.CommitteeMembers).HasForeignKey(x => x.CommitteeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Member).WithMany(x => x.CommitteeMembers).HasForeignKey(x => x.ProfileId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.CommitteeRole).WithMany(x => x.CommitteeMembers).HasForeignKey(x => x.CommitteeRoleId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CommitteeMeeting>(entity =>
        {
            entity.HasKey(x => x.CommitteeMeetingId);
            entity.HasOne(x => x.Committee).WithMany(x => x.CommitteeMeetings).HasForeignKey(x => x.CommitteeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.MeetingType).WithMany(x => x.CommitteeMeetings).HasForeignKey(x => x.MeetingTypeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Chair).WithMany(x => x.CommitteeMeetings).HasForeignKey(x => x.ChairProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MeetingAttendance>(entity =>
        {
            entity.HasKey(x => x.MeetingAttendanceId);
            entity.HasOne(x => x.CommitteeMeeting).WithMany(x => x.MeetingAttendances).HasForeignKey(x => x.CommitteeMeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.CommitteeMember).WithMany(x => x.MeetingAttendances).HasForeignKey(x => x.CommitteeMemberId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Resolution>(entity =>
        {
            entity.HasKey(x => x.ResolutionId);
            entity.HasOne(x => x.CommitteeMeeting).WithMany(x => x.Resolutions).HasForeignKey(x => x.CommitteeMeetingId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ResolutionType).WithMany(x => x.Resolutions).HasForeignKey(x => x.ResolutionTypeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AccommodationBooking>(entity =>
        {
            entity.HasKey(x => x.AccommodationBookingId);
            entity.HasOne(x => x.Account).WithMany(x => x.AccommodationBookings).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CreditFacility>(entity =>
        {
            entity.HasKey(x => x.CreditFacilityId);
            entity.HasOne(x => x.Account).WithMany(x => x.CreditFacilities).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ApprovedBy).WithMany(x => x.CreditFacilities).HasForeignKey(x => x.ApprovedByProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<DisciplinaryAction>(entity =>
        {
            entity.HasKey(x => x.DisciplinaryActionId);
            entity.HasOne(x => x.Account).WithMany(x => x.DisciplinaryActions).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ActionType).WithMany(x => x.DisciplinaryActions).HasForeignKey(x => x.ActionTypeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ImposedByMeeting).WithMany(x => x.DisciplinaryActions).HasForeignKey(x => x.ImposedByMeetingId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ApprovedBy).WithMany(x => x.DisciplinaryActions).HasForeignKey(x => x.ApprovedByProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Reinstatement>(entity =>
        {
            entity.HasKey(x => x.ReinstatementId);
            entity.HasOne(x => x.Account).WithMany(x => x.Reinstatements).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.DisciplinaryAction).WithMany(x => x.Reinstatements).HasForeignKey(x => x.DisciplinaryActionId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Reapplication).WithMany(x => x.Reinstatements).HasForeignKey(x => x.ReapplicationId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ApprovedBy).WithMany(x => x.Reinstatements).HasForeignKey(x => x.ApprovedByProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Complaint>(entity =>
        {
            entity.HasKey(x => x.ComplaintId);
            entity.HasOne(x => x.Complainant).WithMany(x => x.Complaints).HasForeignKey(x => x.ComplainantProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<DataSharingConsent>(entity =>
        {
            entity.HasKey(x => x.DataSharingConsentId);
            entity.HasOne(x => x.Profile).WithMany(x => x.DataSharingConsents).HasForeignKey(x => x.ProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberGuarantorship>(entity =>
        {
            entity.HasKey(x => x.MemberGuarantorshipId);
            entity.HasOne(x => x.TemporaryAccount).WithMany(x => x.MemberGuarantorships).HasForeignKey(x => x.TemporaryAccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Guarantor).WithMany(x => x.MemberGuarantorships).HasForeignKey(x => x.GuarantorProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberStatusOverride>(entity =>
        {
            entity.HasKey(x => x.MemberStatusOverrideId);
            entity.HasOne(x => x.Account).WithMany(x => x.MemberStatusOverrides).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.ApprovedBy).WithMany(x => x.MemberStatusOverrides).HasForeignKey(x => x.ApprovedByProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(x => x.AuditLogId);
        });

        modelBuilder.Entity<Club>(entity =>
        {
            entity.HasOne(x => x.ClubType).WithMany(x => x.Clubs).HasForeignKey(x => x.ClubTypeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Country).WithMany(x => x.Clubs).HasForeignKey(x => x.CountryId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GeneralMeeting>(entity =>
        {
            entity.HasKey(x => x.GeneralMeetingId);
            entity.HasOne(x => x.Chairman).WithMany(x => x.GeneralMeetings).HasForeignKey(x => x.ChairmanProfileId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.AdjournedFrom).WithMany(x => x.GeneralMeetings).HasForeignKey(x => x.AdjournedFromMeetingId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MeetingAgendaItem>(entity =>
        {
            entity.HasKey(x => x.MeetingAgendaItemId);
            entity.HasOne(x => x.GeneralMeeting).WithMany(x => x.MeetingAgendaItems).HasForeignKey(x => x.GeneralMeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Resolution).WithMany(x => x.MeetingAgendaItems).HasForeignKey(x => x.ResolutionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MemberVote>(entity =>
        {
            entity.HasKey(x => x.MemberVoteId);
            entity.HasOne(x => x.GeneralMeeting).WithMany(x => x.MemberVotes).HasForeignKey(x => x.GeneralMeetingId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.BusinessItem).WithMany(x => x.MemberVotes).HasForeignKey(x => x.GeneralMeetingBusinessItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Voter).WithMany(x => x.MemberVotes).HasForeignKey(x => x.VoterProfileId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.CastViaProxy).WithMany(x => x.MemberVotes).HasForeignKey(x => x.CastViaProxyId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Proxy>(entity =>
        {
            entity.HasOne(x => x.GeneralMeeting).WithMany(x => x.Proxies).HasForeignKey(x => x.GeneralMeetingId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CommitteeBallotItem>(entity =>
        {
            entity.HasKey(x => x.CommitteeBallotItemId);
            entity.HasIndex(x => new { x.CommitteeMeetingId, x.ApplicationId }).IsUnique();
            entity.HasOne(x => x.CommitteeMeeting).WithMany(x => x.BallotItems).HasForeignKey(x => x.CommitteeMeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Application).WithMany().HasForeignKey(x => x.ApplicationId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CommitteeBallotVote>(entity =>
        {
            entity.HasKey(x => x.CommitteeBallotVoteId);
            entity.HasIndex(x => new { x.CommitteeBallotItemId, x.VoterProfileId }).IsUnique();
            entity.HasOne(x => x.Item).WithMany(x => x.Votes).HasForeignKey(x => x.CommitteeBallotItemId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Voter).WithMany().HasForeignKey(x => x.VoterProfileId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ElectionNomination>(entity =>
        {
            entity.HasKey(x => x.ElectionNominationId);
            entity.HasOne(x => x.GeneralMeeting).WithMany(x => x.Nominations).HasForeignKey(x => x.GeneralMeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Nominee).WithMany().HasForeignKey(x => x.NomineeProfileId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Proposer).WithMany().HasForeignKey(x => x.ProposerProfileId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Seconder).WithMany().HasForeignKey(x => x.SeconderProfileId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private void ConfigureTenantFilters(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Tenant>().HasIndex(x => x.Code).IsUnique();

        modelBuilder.Entity<UserAccount>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<MProfile>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<MAccount>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<MApplication>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<MembershipType>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<ClubSetting>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<Committee>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
    }

    public override int SaveChanges()
    {
        StampTenantIds();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        StampTenantIds();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void StampTenantIds()
    {
        if (_tenant is not { IsResolved: true }) return;
        var tid = _tenant.TenantId!.Value;
        foreach (var entry in ChangeTracker.Entries<ITenantScoped>())
        {
            if (entry.State == EntityState.Added && entry.Entity.TenantId <= 0)
                entry.Entity.TenantId = tid;
        }
    }

    private static void ConfigureIndexes(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MApplication>().HasIndex(x => new { x.TenantId, x.ApplicationNo }).IsUnique();
        modelBuilder.Entity<MApplication>().HasIndex(x => x.ApplicationStatusId);
        modelBuilder.Entity<MApplication>().HasIndex(x => x.ApplicantProfileId);
        modelBuilder.Entity<MProfile>().HasIndex(x => new { x.TenantId, x.Email });
        modelBuilder.Entity<MProfile>().HasIndex(x => x.IdPassportNo);
        modelBuilder.Entity<MAccount>().HasIndex(x => x.CurrentMemberStatusId);
        modelBuilder.Entity<MAccount>().HasIndex(x => x.ProfileId);
        modelBuilder.Entity<MAccount>().HasIndex(x => new { x.TenantId, x.MembershipNo }).IsUnique();
        modelBuilder.Entity<UserAccount>().HasIndex(x => new { x.TenantId, x.Username }).IsUnique();
        modelBuilder.Entity<MTransaction>().HasIndex(x => x.PaymentDate);
        modelBuilder.Entity<MTransaction>().HasIndex(x => x.MpesaCode);
        modelBuilder.Entity<MVisit>().HasIndex(x => new { x.VisitingProfileId, x.VisitDate });
        modelBuilder.Entity<MVisit>().HasIndex(x => new { x.GuestId, x.VisitDate });
        modelBuilder.Entity<ReciprocalUsage>().HasIndex(x => new { x.ProfileId, x.VisitDate });
        modelBuilder.Entity<AuditLog>().HasIndex(x => new { x.TableName, x.RecordId });
        modelBuilder.Entity<AuditLog>().HasIndex(x => x.ChangedAt);
        modelBuilder.Entity<Endorsement>().HasIndex(x => new { x.ApplicationId, x.EndorserRole });
        modelBuilder.Entity<Gender>().HasIndex(x => x.Code).IsUnique();
        modelBuilder.Entity<MembershipType>().HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        modelBuilder.Entity<ApplicationStatus>().HasIndex(x => x.Code).IsUnique();
        modelBuilder.Entity<MemberStatus>().HasIndex(x => x.Code).IsUnique();
        modelBuilder.Entity<SystemRole>().HasIndex(x => x.Code).IsUnique();
        modelBuilder.Entity<ClubSetting>().HasIndex(x => new { x.TenantId, x.SettingKey });
    }
}
