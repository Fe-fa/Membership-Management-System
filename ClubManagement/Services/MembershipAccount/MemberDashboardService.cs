using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.MembershipAccount;
using ClubManagement.Entities;
using ClubManagement.Entities.Facilities;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Services.Finance;
using ClubManagement.Services.MembershipApplication;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace ClubManagement.Services.MembershipAccount;

public interface IMemberDashboardService
{
    Task<MemberDashboardDto?> GetMineAsync(long profileId, CancellationToken cancellationToken);
    Task<MemberSubscriptionDto?> GetSubscriptionAsync(long profileId, CancellationToken cancellationToken);
    Task<PaymentRowDto> PaySubscriptionAsync(long profileId, MemberPayRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<EndorsementInviteDto>> ListInvitesAsync(long profileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MemberNotificationDto>> ListNotificationsAsync(long profileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<EndorsementHistoryDto>> ListHistoryAsync(long profileId, CancellationToken cancellationToken);
    Task CompleteEndorsementAsync(long profileId, long applicationId, CompleteEndorsementRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<MemberDocumentsDto> GetDocumentsAsync(long profileId, CancellationToken cancellationToken);
    Task WithdrawConsentAsync(long profileId, long? actorUserId, CancellationToken cancellationToken);
    Task<ReciprocalSummaryDto> ReciprocalSummaryAsync(long profileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<AccommodationBookingDto>> ListBookingsAsync(long profileId, CancellationToken cancellationToken);
    Task<AccommodationBookingDto> BookAsync(long profileId, CreateAccommodationBookingRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task CancelBookingAsync(long profileId, long bookingId, CancellationToken cancellationToken);
}

public class MemberDashboardService : IMemberDashboardService
{
    private readonly ApplicationModuleDbContext _db;
    private readonly IFinanceService _finance;
    private readonly IMemberAccountProvisioner _accounts;
    private readonly IEndorsementInviteService _endorsementInvites;
    private readonly IManagerStageService _managerStage;

    public MemberDashboardService(
        ApplicationModuleDbContext db,
        IFinanceService finance,
        IMemberAccountProvisioner accounts,
        IEndorsementInviteService endorsementInvites,
        IManagerStageService managerStage)
    {
        _db = db;
        _finance = finance;
        _accounts = accounts;
        _endorsementInvites = endorsementInvites;
        _managerStage = managerStage;
    }

    public async Task<MemberDashboardDto?> GetMineAsync(long profileId, CancellationToken cancellationToken)
    {
        await _accounts.EnsureForMemberRoleAsync(profileId, null, cancellationToken);
        var account = await LoadAccountAsync(profileId, cancellationToken);
        if (account is null) return null;

        var mt = account.MembershipType;
        var hard = MemberClassPrivileges.ForCode(mt.Code);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var years = YearsBetween(account.JoinedDate ?? account.StartDate, today);
        // Align hard-coded matrix pays/guests with DB so standing/subscription helpers stay consistent.
        var priv = hard with
        {
            PaysSubscription = mt.CanAccessSubscriptions,
            CanVote = mt.CanVote,
            CanRunForOffice = mt.CanRunForOffice,
            CanIntroduceGuests = mt.CanIntroduceGuests,
            CommitteeMode = !mt.CanAccessCommittee
                ? "hidden"
                : mt.CanRunForOffice
                    ? "full"
                    : "readonly"
        };
        var standing = await ResolveStandingAsync(account.AccountId, priv, account.CurrentMemberStatus.Code, cancellationToken);
        var pending = await CountPendingInvitesAsync(profileId, cancellationToken);
        var children21 = account.Profile.MDependants.Count(d =>
            string.Equals(d.RelationshipType?.Code, "CHILD", StringComparison.OrdinalIgnoreCase)
            && YearsBetween(d.DependantDob, today) >= 21);

        var guestsCard = mt.CanIntroduceGuests || mt.ReciprocationAllowed;
        var paysSubscription = mt.CanAccessSubscriptions;
        var discount = string.Equals(mt.Code, "SENIOR", StringComparison.OrdinalIgnoreCase)
            ? 50
            : hard.SubscriptionDiscountPercent;

        var sittingCommittee = await _db.CommitteeMembers.AsNoTracking().AnyAsync(
            m => m.IsActive && m.ProfileId == profileId && m.Committee.IsActive,
            cancellationToken);

        return new MemberDashboardDto
        {
            IsElectedMember = true,
            AccountId = account.AccountId,
            ProfileId = account.ProfileId,
            MembershipNo = account.MembershipNo ?? "",
            FullName = string.Join(" ", new[] { account.Profile.Title, account.Profile.FirstName, account.Profile.MiddleName, account.Profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
            PhotoUrl = account.Profile.PhotoUrl,
            ClassCode = mt.Code,
            ClassName = mt.Name,
            Status = account.CurrentMemberStatus.Name,
            StatusCode = account.CurrentMemberStatus.Code,
            DateElected = account.JoinedDate,
            ContinuousMembershipYears = years,
            Cards = new MemberCardFlagsDto
            {
                Profile = true,
                Subscriptions = paysSubscription,
                Guests = guestsCard,
                Committee = mt.CanAccessCommittee,
                CommitteeMode = priv.CommitteeMode,
                Election = mt.CanVote,
                Accommodation = mt.CanAccessAccommodation,
                Endorsements = mt.CanAccessEndorsements,
                Documents = mt.CanAccessDocuments,
                CommitteeBallot = sittingCommittee
            },
            Privileges = new MemberPrivilegeFlagsDto
            {
                CanVote = mt.CanVote,
                CanRunForOffice = mt.CanRunForOffice,
                CanIntroduceGuests = mt.CanIntroduceGuests,
                ReciprocationAllowed = mt.ReciprocationAllowed,
                PaysSubscription = paysSubscription,
                SubscriptionDiscountPercent = discount
            },
            Standing = standing.Code,
            StandingDetail = standing.Detail,
            PendingEndorsements = pending,
            ChildrenRequiringOwnMembership = children21
        };
    }

    public async Task<MemberSubscriptionDto?> GetSubscriptionAsync(long profileId, CancellationToken cancellationToken)
    {
        var account = await LoadAccountAsync(profileId, cancellationToken);
        if (account is null) return null;
        var hard = MemberClassPrivileges.ForCode(account.MembershipType.Code);
        var pays = account.MembershipType.CanAccessSubscriptions;
        var priv = hard with { PaysSubscription = pays };
        var year = DateTime.UtcNow.Year;
        var due = new DateOnly(year, 1, 1);
        var posting = new DateOnly(year, 2, 28);
        var removal = new DateOnly(year, 4, 30);
        var discount = string.Equals(account.MembershipType.Code, "SENIOR", StringComparison.OrdinalIgnoreCase) ? 50 : priv.SubscriptionDiscountPercent;

        if (!pays)
        {
            return new MemberSubscriptionDto
            {
                Standing = "NotApplicable",
                Detail = "This membership class does not pay an annual subscription.",
                PaysSubscription = false,
                Year = year,
                DueDate = due,
                PostingDeadline = posting,
                RemovalDeadline = removal,
                DiscountPercent = discount
            };
        }

        await EnsureYearSubscriptionAsync(account.AccountId, account.MembershipTypeId, discount, year, cancellationToken);
        var sub = await _db.Subscriptions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.AccountId == account.AccountId && s.SubscriptionYear == year, cancellationToken);
        var standing = await ResolveStandingAsync(account.AccountId, priv, account.CurrentMemberStatus.Code, cancellationToken);
        return new MemberSubscriptionDto
        {
            Standing = standing.Code,
            Detail = standing.Detail,
            PaysSubscription = true,
            Year = year,
            AmountDue = sub?.AmountDue ?? 0,
            AmountPaid = sub?.AmountPaid ?? 0,
            Outstanding = Math.Max(0, (sub?.AmountDue ?? 0) - (sub?.AmountPaid ?? 0)),
            DueDate = due,
            PostingDeadline = posting,
            RemovalDeadline = removal,
            DiscountPercent = discount
        };
    }

    public async Task<PaymentRowDto> PaySubscriptionAsync(long profileId, MemberPayRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await LoadAccountAsync(profileId, cancellationToken)
            ?? throw new InvalidOperationException("Membership account was not found.");
        var priv = MemberClassPrivileges.ForCode(account.MembershipType.Code);
        if (!priv.PaysSubscription)
            throw new InvalidOperationException("This membership class does not pay subscriptions.");

        var fee = await _db.FeeTypes.FirstAsync(x => x.Code == "ANNUAL", cancellationToken);
        return await _finance.RecordPaymentAsync(new RecordPaymentRequest(
            account.AccountId, account.ApplicationId, fee.FeeTypeId, request.PaymentMethodId,
            request.Amount, request.PaymentDate, request.ChequeNo, request.MpesaCode, request.ReferenceNote,
            request.PaymentStatusCode), actorUserId, cancellationToken);
    }

    public async Task<IReadOnlyList<EndorsementInviteDto>> ListInvitesAsync(long profileId, CancellationToken cancellationToken)
    {
        var year = await JoiningYearAsync(profileId, cancellationToken);
        var profile = await _db.Profiles.AsNoTracking().FirstOrDefaultAsync(p => p.ProfileId == profileId, cancellationToken);
        var membershipNo = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => a.MembershipNo)
            .FirstOrDefaultAsync(cancellationToken);
        var apps = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.ElectionType)
            .Include(a => a.Endorsements)
            .Include(a => a.Status)
            .Where(a => a.ProposerProfileId == profileId || a.SeconderProfileId == profileId)
            .OrderByDescending(a => a.UpdatedAt)
            .Take(50)
            .ToListAsync(cancellationToken);

        var rows = new List<EndorsementInviteDto>();
        foreach (var app in apps)
        {
            var code = app.Status?.Code ?? "";
            var atEndorsement = string.Equals(code, "Endorsement", StringComparison.OrdinalIgnoreCase)
                || string.Equals(code, "EndorsementReview", StringComparison.OrdinalIgnoreCase);
            if (!atEndorsement) continue;
            if (app.ProposerProfileId == profileId)
                rows.Add(Invite(app, "Proposer", year, membershipNo, profile));
            if (app.SeconderProfileId == profileId)
                rows.Add(Invite(app, "Seconder", year, membershipNo, profile));
        }

        var pending = rows.Where(r => r.Status == "Pending").ToList();
        // Backfill in-app notifications for already-authorized applications.
        foreach (var applicationId in pending.Select(p => p.ApplicationId).Distinct())
            await _endorsementInvites.NotifyNamedEndorsersAsync(applicationId, cancellationToken);

        return pending;
    }

    public async Task<IReadOnlyList<EndorsementHistoryDto>> ListHistoryAsync(long profileId, CancellationToken cancellationToken)
    {
        return await _db.Endorsements.AsNoTracking()
            .Where(e => e.EndorserProfileId == profileId
                && e.PersonalKnowledge != null && e.PersonalKnowledge != ""
                && e.ProfessionalKnowledge != null && e.ProfessionalKnowledge != ""
                && e.ValueAddition != null && e.ValueAddition != "")
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new EndorsementHistoryDto
            {
                ApplicationId = e.ApplicationId,
                ApplicationNo = e.Application.ApplicationNo,
                ApplicantName = e.Application.Applicant.FirstName + " " + e.Application.Applicant.LastName,
                Role = e.EndorserRole,
                Outcome = e.Application.Status.Name,
                CompletedAt = e.CreatedAt
            })
            .Take(50)
            .ToListAsync(cancellationToken);
    }

    public async Task CompleteEndorsementAsync(long profileId, long applicationId, CompleteEndorsementRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        if (!request.IntegrityConfirmed)
            throw new InvalidOperationException("You must confirm you are satisfied as to the candidate's integrity in public life.");
        if (string.IsNullOrWhiteSpace(request.PersonalKnowledge) || string.IsNullOrWhiteSpace(request.ProfessionalKnowledge) || string.IsNullOrWhiteSpace(request.ValueAddition))
            throw new InvalidOperationException("Personal, professional, and value-addition statements are required.");
        if (string.IsNullOrWhiteSpace(request.SignatureImageUrl))
            throw new InvalidOperationException("A signature is required.");

        var application = await _db.Applications
            .Include(a => a.Endorsements)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");

        // Role is taken from who is named on the application — never trust the client alone.
        var role = ResolveNamedEndorserRole(application, profileId, request.EndorserRole)
            ?? throw new InvalidOperationException("You are not named as proposer or seconder on this application.");
        if (IsEndorsementComplete(application, role))
            throw new InvalidOperationException("This endorsement is already complete.");

        var joiningYear = await JoiningYearAsync(profileId, cancellationToken);
        var profile = await _db.Profiles.FirstAsync(p => p.ProfileId == profileId, cancellationToken);

        var existing = application.Endorsements.FirstOrDefault(e =>
            e.EndorserProfileId == profileId
            && RolesMatch(e.EndorserRole, role));

        if (existing is not null)
        {
            existing.EndorserRole = role; // normalize PROPOSER / SECONDER
            existing.YearsKnownCandidate = request.YearsKnownCandidate;
            existing.PersonalKnowledge = request.PersonalKnowledge.Trim();
            existing.ProfessionalKnowledge = request.ProfessionalKnowledge.Trim();
            existing.ValueAddition = request.ValueAddition.Trim();
            existing.EndorserYearOfJoining = joiningYear;
            existing.EndorserPhone = profile.Mobile;
            existing.EndorserEmail = profile.Email;
            existing.UpdatedByUserId = actorUserId;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _db.Endorsements.Add(new Endorsement
            {
                ApplicationId = applicationId,
                EndorserProfileId = profileId,
                EndorserRole = role,
                YearsKnownCandidate = request.YearsKnownCandidate,
                PersonalKnowledge = request.PersonalKnowledge.Trim(),
                ProfessionalKnowledge = request.ProfessionalKnowledge.Trim(),
                ValueAddition = request.ValueAddition.Trim(),
                EndorserYearOfJoining = joiningYear,
                EndorserPhone = profile.Mobile,
                EndorserEmail = profile.Email,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            });
        }

        _db.ApplicationSignatures.Add(new ApplicationSignature
        {
            ApplicationId = applicationId,
            SignatoryProfileId = profileId,
            SignatoryRole = role,
            SignatureImageUrl = request.SignatureImageUrl,
            SignedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);
        try { await _managerStage.OnEndorsementsPossiblyCompleteAsync(applicationId, cancellationToken); }
        catch { /* do not fail endorsement on notify errors */ }
    }

    public async Task<IReadOnlyList<MemberNotificationDto>> ListNotificationsAsync(long profileId, CancellationToken cancellationToken)
    {
        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);
        var email = await _db.Profiles.AsNoTracking()
            .Where(p => p.ProfileId == profileId)
            .Select(p => p.Email)
            .FirstOrDefaultAsync(cancellationToken);

        var myApplicationIds = await _db.Applications.AsNoTracking()
            .Where(a => a.ApplicantProfileId == profileId)
            .Select(a => a.ApplicationId)
            .ToListAsync(cancellationToken);
        var committeeIds = await _db.CommitteeMembers.AsNoTracking()
            .Where(m => m.ProfileId == profileId && m.IsActive)
            .Select(m => m.CommitteeId)
            .ToListAsync(cancellationToken);
        var meetingIdsAsMember = committeeIds.Count == 0
            ? new List<long>()
            : await _db.CommitteeMeetings.AsNoTracking()
                .Where(m => committeeIds.Contains(m.CommitteeId))
                .Select(m => m.CommitteeMeetingId)
                .ToListAsync(cancellationToken);
        var meetingIdsAsApplicant = myApplicationIds.Count == 0
            ? new List<long>()
            : await _db.Interviews.AsNoTracking()
                .Where(i => myApplicationIds.Contains(i.ApplicationId) && i.CommitteeMeetingId != null)
                .Select(i => i.CommitteeMeetingId!.Value)
                .Distinct()
                .ToListAsync(cancellationToken);
        var allowedMeetingIds = meetingIdsAsMember.Concat(meetingIdsAsApplicant).Distinct().ToList();

        var query = _db.Notifications.AsNoTracking()
            .Include(n => n.NotificationType)
            .Where(n =>
                (accountId != null && n.AccountId == accountId)
                || (!string.IsNullOrWhiteSpace(email) && n.Recipient == email)
                || n.Recipient == profileId.ToString())
            .Where(n =>
                (n.NotificationType.Code != "MEETING_LINK" && n.NotificationType.Code != "INTERVIEW_MEETING")
                || (n.RelatedEntityType == "APPLICATION"
                    && n.RelatedEntityId != null
                    && myApplicationIds.Contains(n.RelatedEntityId.Value))
                || (n.RelatedEntityType == "COMMITTEE_MEETING"
                    && n.RelatedEntityId != null
                    && allowedMeetingIds.Contains(n.RelatedEntityId.Value)));

        var rows = await query
            .OrderByDescending(n => n.SentDate ?? n.CreatedAt)
            .Take(80)
            .Select(n => new
            {
                n.NotificationId,
                TypeCode = n.NotificationType.Code,
                TypeName = n.NotificationType.Name,
                n.Content,
                n.Channel,
                SentDate = n.SentDate ?? n.CreatedAt,
                n.CreatedAt,
                n.RelatedEntityType,
                n.RelatedEntityId
            })
            .ToListAsync(cancellationToken);

        var apps = await _db.Applications.AsNoTracking()
            .Where(a => a.ApplicantProfileId == profileId)
            .Select(a => new AppNoticeState(a.ApplicationId, a.UpdatedAt, a.Status.Code))
            .ToListAsync(cancellationToken);
        var appById = apps.ToDictionary(a => a.ApplicationId);

        var interviewSittings = myApplicationIds.Count == 0
            ? new List<InterviewSittingState>()
            : (await _db.Interviews.AsNoTracking()
                .Where(i => myApplicationIds.Contains(i.ApplicationId))
                .Select(i => new
                {
                    i.ApplicationId,
                    i.CommitteeMeetingId,
                    i.ConductedAt,
                    i.AttendedFlag,
                    Date = i.CommitteeMeeting != null ? (DateOnly?)i.CommitteeMeeting.MeetingDate : null,
                    Time = i.CommitteeMeeting != null ? i.CommitteeMeeting.MeetingTime : null,
                    Status = i.CommitteeMeeting != null ? i.CommitteeMeeting.Status : null,
                    i.ScheduledAt
                })
                .ToListAsync(cancellationToken))
                .Select(i => new InterviewSittingState(
                    i.ApplicationId, i.CommitteeMeetingId, i.ConductedAt, i.AttendedFlag, i.Date, i.Time, i.Status, i.ScheduledAt))
                .ToList();

        var extraMeetingIds = rows
            .Where(n => n.RelatedEntityType == "COMMITTEE_MEETING" && n.RelatedEntityId != null)
            .Select(n => n.RelatedEntityId!.Value)
            .Distinct()
            .ToList();
        var meetingsById = extraMeetingIds.Count == 0
            ? new Dictionary<long, (DateOnly Date, string? Time, string Status)>()
            : (await _db.CommitteeMeetings.AsNoTracking()
                .Where(m => extraMeetingIds.Contains(m.CommitteeMeetingId))
                .Select(m => new { m.CommitteeMeetingId, m.MeetingDate, m.MeetingTime, m.Status })
                .ToListAsync(cancellationToken))
                .ToDictionary(m => m.CommitteeMeetingId, m => (m.MeetingDate, m.MeetingTime, m.Status));

        var kenyaNow = KenyaNow();

        return rows
            .Where(n => NotificationStillActive(
                n.TypeCode,
                n.RelatedEntityType,
                n.RelatedEntityId,
                n.CreatedAt,
                appById,
                interviewSittings,
                meetingsById,
                kenyaNow))
            .Select(n =>
        {
            var content = (n.Content ?? "").Trim();
            string title;
            string body;
            var split = content.IndexOf("\n\n", StringComparison.Ordinal);
            if (split > 0)
            {
                title = content[..split].Trim();
                body = content[(split + 2)..].Trim();
            }
            else
            {
                title = string.IsNullOrWhiteSpace(content) ? n.TypeName : content;
                body = content;
            }
            return new MemberNotificationDto
            {
                NotificationId = n.NotificationId,
                TypeCode = n.TypeCode,
                Title = title,
                Body = body,
                Channel = n.Channel,
                SentDate = n.SentDate,
                CreatedAtUtc = n.CreatedAt,
                IsRead = false,
                RelatedEntityType = n.RelatedEntityType,
                RelatedEntityId = n.RelatedEntityId
            };
        }).ToList();
    }

    private static readonly HashSet<string> ManagerActionTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "MANAGER_PAYMENT_REQUEST",
        "MANAGER_DOCUMENT_REQUEST",
        "MANAGER_DETAILS_REQUEST",
        "MANAGER_ENDORSEMENT_REQUEST",
        "MANAGER_ENDORSEMENT_FOLLOWUP",
        "APPLICATION_PAYMENT_REQUIRED",
        "APPLICATION_PENDING_ITEMS"
    };

    private static readonly HashSet<string> MeetingNoticeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "MEETING_LINK",
        "INTERVIEW_MEETING"
    };

    private static bool NotificationStillActive(
        string typeCode,
        string? relatedType,
        long? relatedId,
        DateTime createdAt,
        Dictionary<long, AppNoticeState> appById,
        List<InterviewSittingState> sittings,
        Dictionary<long, (DateOnly Date, string? Time, string Status)> meetingsById,
        DateTime kenyaNow)
    {
        AppNoticeState? relatedApp = relatedType == "APPLICATION" && relatedId is long appId && appById.TryGetValue(appId, out var app)
            ? app
            : null;
        var status = relatedApp?.Status;

        if (ManagerActionTypes.Contains(typeCode))
        {
            if (relatedApp != null)
            {
                if (relatedApp.UpdatedAt is DateTime ua && ua > createdAt) return false;
                if (StatusPastEndorsement(status)) return false;
            }
            return true;
        }

        if (MeetingNoticeTypes.Contains(typeCode))
        {
            if (relatedType == "APPLICATION" && relatedId is long aid)
            {
                if (StatusPastInterview(status)) return false;
                var mine = sittings.Where(s => s.ApplicationId == aid).ToList();
                if (mine.Any(s => s.ConductedAt != null || s.Attended)) return false;
                if (mine.Any(s => MeetingHasEnded(s.Date, s.Time, s.Status, s.ScheduledAt, kenyaNow))) return false;
            }
            if (relatedType == "COMMITTEE_MEETING" && relatedId is long mid)
            {
                if (meetingsById.TryGetValue(mid, out var meeting)
                    && MeetingHasEnded(meeting.Date, meeting.Time, meeting.Status, null, kenyaNow))
                    return false;
                if (sittings.Any(s => s.MeetingId == mid && MeetingHasEnded(s.Date, s.Time, s.Status, s.ScheduledAt, kenyaNow)))
                    return false;
            }
            return true;
        }

        if (IsElectionNotice(typeCode) && StatusElectionFinished(status))
            return false;

        return true;
    }

    private static bool IsElectionNotice(string typeCode)
    {
        if (string.IsNullOrWhiteSpace(typeCode)) return false;
        var c = typeCode.ToUpperInvariant();
        return c.Contains("ELECTION") || c.Contains("BALLOT") || c.Contains("AGM") || c.Contains("EGM");
    }

    private static bool StatusPastEndorsement(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return false;
        return status is "Interview" or "InterviewReview" or "Waitlist" or "ElectionReview"
            or "TemporaryMember" or "Committee" or "CommitteeReview" or "Approved" or "NotElected" or "Rejected";
    }

    private static bool StatusPastInterview(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return false;
        return status is "InterviewReview" or "Waitlist" or "ElectionReview"
            or "TemporaryMember" or "Committee" or "CommitteeReview" or "Approved" or "NotElected" or "Rejected";
    }

    private static bool StatusElectionFinished(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return false;
        return status is "Committee" or "CommitteeReview" or "Approved" or "NotElected" or "Rejected" or "TemporaryMember";
    }

    private static bool MeetingHasEnded(
        DateOnly? date,
        string? time,
        string? status,
        DateTime? scheduledAt,
        DateTime kenyaNow)
    {
        if (status is "HELD" or "CANCELLED" or "CLOSED" or "COMPLETED") return true;
        if (scheduledAt is DateTime scheduled)
        {
            var local = scheduled.Kind == DateTimeKind.Utc
                ? TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(scheduled, DateTimeKind.Utc), KenyaTimeZone())
                : scheduled;
            if (kenyaNow >= local) return true;
        }
        if (date is not DateOnly d) return false;
        var tod = TimeOnly.MinValue;
        if (string.IsNullOrWhiteSpace(time) || !TimeOnly.TryParse(time.Trim(), out tod))
            tod = new TimeOnly(23, 59);
        return kenyaNow >= d.ToDateTime(tod);
    }

    private static DateTime KenyaNow() =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, KenyaTimeZone());

    private static TimeZoneInfo KenyaTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("E. Africa Standard Time"); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("Africa/Nairobi"); }
    }

    private sealed record AppNoticeState(long ApplicationId, DateTime? UpdatedAt, string Status);

    private sealed record InterviewSittingState(
        long ApplicationId,
        long? MeetingId,
        DateTime? ConductedAt,
        bool Attended,
        DateOnly? Date,
        string? Time,
        string? Status,
        DateTime? ScheduledAt);

    public async Task<MemberDocumentsDto> GetDocumentsAsync(long profileId, CancellationToken cancellationToken)
    {
        var profile = await _db.Profiles.FirstAsync(p => p.ProfileId == profileId, cancellationToken);
        var withdrawn = await _db.DataSharingConsents.AsNoTracking()
            .Where(c => c.ProfileId == profileId && c.WithdrawnAt != null)
            .OrderByDescending(c => c.WithdrawnAt)
            .Select(c => c.WithdrawnAt)
            .FirstOrDefaultAsync(cancellationToken);

        var account = await LoadAccountAsync(profileId, cancellationToken);
        var receipts = account is null
            ? []
            : (await _finance.ListPaymentsAsync(account.AccountId, cancellationToken))
                .Select(p => new PaymentRowLite { ReceiptNumber = p.ReceiptNumber, Amount = p.Amount, PaymentDate = p.PaymentDate, Method = p.Method })
                .ToList();

        return new MemberDocumentsDto
        {
            DataConsentGiven = profile.DataConsentGiven,
            PrivacyPolicyAcceptedAt = profile.PrivacyPolicyAcceptedAt,
            ConsentWithdrawnAt = withdrawn,
            Receipts = receipts,
            Circulars =
            [
                new MemberCircularDto { Title = "Members Privacy Policy", Kind = "Policy", Summary = "Data Protection Act, 2019 — how the Club processes member personal data." },
                new MemberCircularDto { Title = "AGM notice", Kind = "Meeting", Summary = "General Meeting notices are issued with at least 14 clear days (Article 52); EGMs with 21 clear days where required." },
                new MemberCircularDto { Title = "Club circular", Kind = "Circular", Summary = "House notices, facility hours, and seasonal events." }
            ]
        };
    }

    public async Task WithdrawConsentAsync(long profileId, long? actorUserId, CancellationToken cancellationToken)
    {
        var profile = await _db.Profiles.FirstAsync(p => p.ProfileId == profileId, cancellationToken);
        profile.DataConsentGiven = false;
        profile.UpdatedByUserId = actorUserId;
        _db.DataSharingConsents.Add(new Entities.Settings.DataSharingConsent
        {
            ProfileId = profileId,
            ThirdPartyName = "Aero Club of East Africa",
            Purpose = "Membership administration (Data Protection Act, 2019). Withdrawal does not affect prior lawful processing.",
            ConsentedFlag = false,
            ConsentedAt = profile.PrivacyPolicyAcceptedAt,
            WithdrawnAt = DateTime.UtcNow,
            PrivacyPolicyVersion = "2019",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<ReciprocalSummaryDto> ReciprocalSummaryAsync(long profileId, CancellationToken cancellationToken)
    {
        var windowStart = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-12);
        var visits = await _db.ReciprocalUsages.AsNoTracking()
            .Include(x => x.HomeClub)
            .Where(x => x.ProfileId == profileId && x.VisitDate >= windowStart)
            .OrderByDescending(x => x.VisitDate)
            .ToListAsync(cancellationToken);
        var clubs = await _db.Clubs.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.ClubName)
            .Select(c => new ClubOptionDto { ClubId = c.ClubId, ClubName = c.ClubName })
            .ToListAsync(cancellationToken);
        return new ReciprocalSummaryDto
        {
            DaysUsedIn12Months = visits.Sum(v => v.DaysUsed),
            MaxDays = 30,
            Visits = visits.Select(v => new ReciprocalUsageDto
            {
                ReciprocalUsageId = v.ReciprocalUsageId,
                HomeClubId = v.HomeClubId,
                HomeClubName = v.HomeClub.ClubName,
                VisitDate = v.VisitDate,
                DaysUsed = v.DaysUsed
            }).ToList(),
            Clubs = clubs
        };
    }

    public async Task<IReadOnlyList<AccommodationBookingDto>> ListBookingsAsync(long profileId, CancellationToken cancellationToken)
    {
        var account = await LoadAccountAsync(profileId, cancellationToken)
            ?? throw new InvalidOperationException("Membership account was not found.");
        return await _db.AccommodationBookings.AsNoTracking()
            .Where(b => b.AccountId == account.AccountId)
            .OrderByDescending(b => b.CheckInDate)
            .Select(b => new AccommodationBookingDto
            {
                AccommodationBookingId = b.AccommodationBookingId,
                CheckInDate = b.CheckInDate,
                CheckOutDate = b.CheckOutDate,
                RoomType = b.RoomType,
                Status = b.Status,
                CancellationFee = b.CancellationFee
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<AccommodationBookingDto> BookAsync(long profileId, CreateAccommodationBookingRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await LoadAccountAsync(profileId, cancellationToken)
            ?? throw new InvalidOperationException("Membership account was not found.");
        if (request.CheckOutDate <= request.CheckInDate)
            throw new InvalidOperationException("Check-out must be after check-in.");

        var nights = request.CheckOutDate.DayNumber - request.CheckInDate.DayNumber;
        var windowStart = request.CheckInDate.AddMonths(-12);
        var used = await _db.AccommodationBookings
            .Where(b => b.AccountId == account.AccountId && b.Status != "CANCELLED" && b.CheckInDate >= windowStart)
            .SumAsync(b => (int?)(b.CheckOutDate.DayNumber - b.CheckInDate.DayNumber), cancellationToken) ?? 0;
        if (used + nights > 90)
            throw new InvalidOperationException("Club accommodation is limited to three months in any 12-month period.");

        var booking = new AccommodationBooking
        {
            AccountId = account.AccountId,
            CheckInDate = request.CheckInDate,
            CheckOutDate = request.CheckOutDate,
            RoomType = string.IsNullOrWhiteSpace(request.RoomType) ? "Standard" : request.RoomType.Trim(),
            Status = "BOOKED",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.AccommodationBookings.Add(booking);
        await _db.SaveChangesAsync(cancellationToken);
        return new AccommodationBookingDto
        {
            AccommodationBookingId = booking.AccommodationBookingId,
            CheckInDate = booking.CheckInDate,
            CheckOutDate = booking.CheckOutDate,
            RoomType = booking.RoomType,
            Status = booking.Status
        };
    }

    public async Task CancelBookingAsync(long profileId, long bookingId, CancellationToken cancellationToken)
    {
        var account = await LoadAccountAsync(profileId, cancellationToken)
            ?? throw new InvalidOperationException("Membership account was not found.");
        var booking = await _db.AccommodationBookings.FirstOrDefaultAsync(b => b.AccommodationBookingId == bookingId && b.AccountId == account.AccountId, cancellationToken)
            ?? throw new InvalidOperationException("Booking was not found.");
        if (booking.Status == "CANCELLED") return;
        var hours = (booking.CheckInDate.ToDateTime(TimeOnly.MinValue) - DateTime.UtcNow).TotalHours;
        if (hours < 24)
            booking.CancellationFee ??= 0;
        booking.Status = "CANCELLED";
        await _db.SaveChangesAsync(cancellationToken);
    }

    private EndorsementInviteDto Invite(MApplication app, string role, int? joiningYear, string? membershipNo, MProfile? profile)
    {
        var done = IsEndorsementComplete(app, role);
        var membershipType = MembershipTypeFromDraft(app.FormDataJson) ?? app.ElectionType?.Name ?? "Membership";
        return new EndorsementInviteDto
        {
            ApplicationId = app.ApplicationId,
            ApplicationNo = app.ApplicationNo,
            ApplicantName = string.Join(" ", new[] { app.Applicant.FirstName, app.Applicant.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
            ApplicantPhotoUrl = app.Applicant.PhotoUrl,
            MembershipType = membershipType,
            Role = role,
            Status = done ? "Complete" : "Pending",
            EndorserYearOfJoining = joiningYear,
            EndorserMembershipNo = membershipNo ?? profile?.MembershipNo,
            EndorserName = profile is null ? null : string.Join(" ", new[] { profile.FirstName, profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
            EndorserPhone = profile?.Mobile,
            EndorserEmail = profile?.Email
        };
    }

    /// <summary>
    /// Returns PROPOSER or SECONDER from the application naming, optionally disambiguated
    /// by the requested role when the same member was incorrectly named for both slots.
    /// </summary>
    private static string? ResolveNamedEndorserRole(MApplication app, long profileId, string? requestedRole)
    {
        var asProposer = app.ProposerProfileId == profileId;
        var asSeconder = app.SeconderProfileId == profileId;
        if (!asProposer && !asSeconder) return null;
        if (asProposer && !asSeconder) return "PROPOSER";
        if (asSeconder && !asProposer) return "SECONDER";

        var requested = NormalizeEndorserRole(requestedRole);
        if (requested is "PROPOSER" or "SECONDER") return requested;
        throw new InvalidOperationException(
            "You are named as both proposer and seconder on this application. Open the matching request and try again.");
    }

    private static string NormalizeEndorserRole(string? role)
    {
        var raw = (role ?? "").Trim().ToUpperInvariant().Replace(" ", "").Replace("-", "").Replace("_", "");
        return raw switch
        {
            "PROPOSER" or "PROPOSE" => "PROPOSER",
            "SECONDER" or "SECOND" => "SECONDER",
            _ => raw,
        };
    }

    private static bool RolesMatch(string? stored, string expected) =>
        string.Equals(NormalizeEndorserRole(stored), NormalizeEndorserRole(expected), StringComparison.Ordinal);

    private static bool IsEndorsementComplete(MApplication app, string role)
    {
        var normalized = NormalizeEndorserRole(role);
        var namedId = normalized == "PROPOSER" ? app.ProposerProfileId : app.SeconderProfileId;
        // Empty nomination stubs (created by older submit flows) do not count as complete.
        return app.Endorsements.Any(e =>
            e.EndorserProfileId == namedId
            && RolesMatch(e.EndorserRole, normalized)
            && !string.IsNullOrWhiteSpace(e.PersonalKnowledge)
            && !string.IsNullOrWhiteSpace(e.ProfessionalKnowledge)
            && !string.IsNullOrWhiteSpace(e.ValueAddition));
    }

    private static string? MembershipTypeFromDraft(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("membership", out var membership)
                && membership.TryGetProperty("membershipType", out var type))
                return type.GetString();
        }
        catch (JsonException)
        {
            /* ignore malformed drafts */
        }
        return null;
    }

    private async Task<int> CountPendingInvitesAsync(long profileId, CancellationToken cancellationToken)
    {
        var invites = await ListInvitesAsync(profileId, cancellationToken);
        return invites.Count;
    }

    private async Task<int?> JoiningYearAsync(long profileId, CancellationToken cancellationToken)
    {
        var joined = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => a.JoinedDate ?? a.StartDate)
            .FirstOrDefaultAsync(cancellationToken);
        return joined?.Year;
    }

    private async Task<(string Code, string Detail)> ResolveStandingAsync(long accountId, MemberPrivilegeSet priv, string statusCode, CancellationToken cancellationToken)
    {
        if (!priv.PaysSubscription)
            return ("NotApplicable", "No annual subscription is payable for this class.");
        if (string.Equals(statusCode, "REMOVED", StringComparison.OrdinalIgnoreCase))
            return ("AtRiskOfRemoval", "Membership has been removed for unpaid subscription (30 April deadline).");
        if (string.Equals(statusCode, "POSTED", StringComparison.OrdinalIgnoreCase))
            return ("Posted", "Posted (in arrears) after the 28 February posting deadline.");

        var year = DateTime.UtcNow.Year;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var sub = await _db.Subscriptions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == year, cancellationToken);
        var outstanding = sub is null ? 0 : Math.Max(0, sub.AmountDue - sub.AmountPaid);
        if (outstanding <= 0)
            return ("InGoodStanding", "Subscription for the current year is settled.");
        if (today >= new DateOnly(year, 4, 1))
            return ("AtRiskOfRemoval", "Unpaid subscription — at risk of removal on 30 April.");
        if (today >= new DateOnly(year, 2, 1))
            return ("Posted", "Reminder: unpaid members are posted after 28 February.");
        return ("InGoodStanding", "Annual subscription is due 1 January.");
    }

    private async Task EnsureYearSubscriptionAsync(long accountId, long membershipTypeId, int discount, int year, CancellationToken cancellationToken)
    {
        if (await _db.Subscriptions.AnyAsync(s => s.AccountId == accountId && s.SubscriptionYear == year, cancellationToken))
            return;
        var asOf = new DateOnly(year, 1, 1);
        var schedule = await _db.MembershipFeeSchedules.AsNoTracking()
            .Where(x => x.IsActive && x.MembershipTypeId == membershipTypeId && x.EffectiveDate <= asOf)
            .OrderByDescending(x => x.EffectiveDate)
            .FirstOrDefaultAsync(cancellationToken);
        var amount = schedule?.AnnualSubscription ?? 0;
        if (discount > 0) amount = Math.Round(amount * (100 - discount) / 100m, 2);
        var dueStatus = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "DUE", cancellationToken)
            ?? await _db.MemberStatuses.FirstAsync(cancellationToken);
        _db.Subscriptions.Add(new Subscription
        {
            AccountId = accountId,
            SubscriptionYear = year,
            AmountDue = amount,
            AmountPaid = 0,
            ArrearsAmount = amount,
            DueDate = asOf,
            SubscriptionStatusId = dueStatus.MemberStatusId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<Entities.MembershipAccount.MAccount?> LoadAccountAsync(long profileId, CancellationToken cancellationToken) =>
        await _db.Accounts
            .Include(a => a.Profile).ThenInclude(p => p.MDependants).ThenInclude(d => d.RelationshipType)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .OrderByDescending(a => a.IsActive)
            .FirstOrDefaultAsync(cancellationToken);

    private static int YearsBetween(DateOnly? from, DateOnly today)
    {
        if (from is null) return 0;
        var years = today.Year - from.Value.Year;
        if (today < from.Value.AddYears(years)) years--;
        return Math.Max(years, 0);
    }
}
