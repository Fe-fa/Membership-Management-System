using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Common;
using ClubManagement.DTOs.MembershipAccount;
using ClubManagement.Entities;
using ClubManagement.Entities.Facilities;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Services.Finance;
using ClubManagement.Services.MembershipApplication;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ClubManagement.Services.MembershipAccount;

public interface IMemberDashboardService
{
    Task<MemberDashboardDto?> GetMineAsync(long profileId, CancellationToken cancellationToken);
    Task<MemberSubscriptionDto?> GetSubscriptionAsync(long profileId, CancellationToken cancellationToken);
    Task<PaymentRowDto> PaySubscriptionAsync(long profileId, MemberPayRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<MpesaStkPushResultDto> InitiateMpesaStkAsync(long profileId, MpesaStkPushRequest request, CancellationToken cancellationToken);
    Task<IReadOnlyList<EndorsementInviteDto>> ListInvitesAsync(long profileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MemberNotificationDto>> ListNotificationsAsync(long profileId, CancellationToken cancellationToken);
    Task MarkNotificationReadAsync(long profileId, long notificationId, CancellationToken cancellationToken);
    Task MarkAllNotificationsReadAsync(long profileId, CancellationToken cancellationToken);
    Task DismissNotificationAsync(long profileId, long notificationId, CancellationToken cancellationToken);
    Task DismissAllNotificationsAsync(long profileId, CancellationToken cancellationToken);
    Task<PagedResult<EndorsementHistoryDto>> ListHistoryAsync(long profileId, PagedRequest paging, CancellationToken cancellationToken);
    Task<IReadOnlyList<EndorsementHistoryDto>> SearchHistoryAsync(long profileId, string? query, CancellationToken cancellationToken);
    Task<EndorsementHistoryDto> GetHistoryAsync(long profileId, long endorsementId, CancellationToken cancellationToken);
    Task<EndorsementHistoryDto> UpdateHistoryAsync(long profileId, long endorsementId, UpdateEndorsementHistoryRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task HideHistoryAsync(long profileId, long endorsementId, CancellationToken cancellationToken);
    Task RestoreHistoryAsync(long profileId, long endorsementId, CancellationToken cancellationToken);
    Task CompleteEndorsementAsync(long profileId, long applicationId, CompleteEndorsementRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task DeclineEndorsementAsync(long profileId, long applicationId, DeclineEndorsementRequest request, long? actorUserId, CancellationToken cancellationToken);
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
    private readonly INonMembershipBillingService _nmBilling;
    private readonly IMemberAccountProvisioner _accounts;
    private readonly IEndorsementInviteService _endorsementInvites;
    private readonly IManagerStageService _managerStage;

    public MemberDashboardService(
        ApplicationModuleDbContext db,
        IFinanceService finance,
        INonMembershipBillingService nmBilling,
        IMemberAccountProvisioner accounts,
        IEndorsementInviteService endorsementInvites,
        IManagerStageService managerStage)
    {
        _db = db;
        _finance = finance;
        _nmBilling = nmBilling;
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
        var pendingProxies = await _db.Proxies.AsNoTracking()
            .CountAsync(p =>
                p.ProxyProfileId == profileId
                && p.GeneralMeeting.Status != "CANCELLED"
                && p.GeneralMeeting.Status != "HELD",
                cancellationToken);
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
            PendingProxies = pendingProxies,
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
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var due = new DateOnly(year, 1, 1);
        var posting = new DateOnly(year, 2, 28);
        var removal = new DateOnly(year, 4, 30);
        var years = YearsBetween(account.JoinedDate ?? account.StartDate, today);
        var age = account.Profile?.DateOfBirth is DateOnly dob ? YearsBetween(dob, today) : (int?)null;
        var typeCode = (account.MembershipType.Code ?? "").Trim().ToUpperInvariant();
        var isLifeExempt = typeCode is "LIFE" or "SENIOR_LIFE" or "HONORARY"
            || (!pays && hard.PaysSubscription == false);
        var isSeniorByRules = (age is >= 55 && years >= 25)
            || typeCode is "SENIOR" or "SENIOR_LIFE";
        var discount = isLifeExempt
            ? 0
            : typeCode == "SENIOR" || (isSeniorByRules && typeCode != "SENIOR_LIFE")
                ? 50
                : priv.SubscriptionDiscountPercent;

        var asOf = new DateOnly(year, 1, 1);
        var schedule = await _db.MembershipFeeSchedules.AsNoTracking()
            .Where(x => x.IsActive && x.MembershipTypeId == account.MembershipTypeId && x.EffectiveDate <= asOf)
            .OrderByDescending(x => x.EffectiveDate)
            .FirstOrDefaultAsync(cancellationToken);
        var fullAnnual = schedule?.AnnualSubscription ?? 0m;

        var joined = account.JoinedDate ?? account.StartDate;
        var halfYear = joined is DateOnly jd
            && jd.Year == year
            && jd > new DateOnly(year, 6, 30);

        var joining = await ResolveJoiningDuesAsync(account, cancellationToken);
        decimal amountDue = 0, amountPaid = 0, outstanding = 0;
        string standingCode;
        string detail;

        if (!pays || isLifeExempt)
        {
            standingCode = "NotApplicable";
            detail = isLifeExempt
                ? "Life / Senior Life members are exempt from annual subscription (Ksh 0)."
                : "This membership class does not pay an annual subscription.";
        }
        else
        {
            await _finance.ReconcileAccountDuesAsync(account.AccountId, cancellationToken);
            await EnsureYearSubscriptionAsync(account.AccountId, account.MembershipTypeId, discount, year, cancellationToken);
            // Mid-year joiners (after 30 June) show half-rate indicator and adjust unpaid schedule once.
            if (halfYear)
            {
                var subAdj = await _db.Subscriptions
                    .FirstOrDefaultAsync(s => s.AccountId == account.AccountId && s.SubscriptionYear == year, cancellationToken);
                if (subAdj is not null && subAdj.AmountPaid == 0 && fullAnnual > 0)
                {
                    var half = Math.Round(fullAnnual * (100 - discount) / 100m * 0.5m, 2, MidpointRounding.AwayFromZero);
                    if (subAdj.AmountDue != half)
                    {
                        subAdj.AmountDue = half;
                        subAdj.ArrearsAmount = Math.Max(0, half - subAdj.AmountPaid);
                        await _db.SaveChangesAsync(cancellationToken);
                    }
                }
            }

            var sub = await _db.Subscriptions.AsNoTracking()
                .FirstOrDefaultAsync(s => s.AccountId == account.AccountId && s.SubscriptionYear == year, cancellationToken);
            amountDue = sub?.AmountDue ?? 0;
            amountPaid = sub?.AmountPaid ?? 0;
            outstanding = Math.Max(0, amountDue - amountPaid);
            var standing = await ResolveStandingAsync(account.AccountId, priv, account.CurrentMemberStatus.Code, cancellationToken);
            standingCode = standing.Code;
            detail = standing.Detail;
        }

        var clubCredit = Math.Max(0, joining.Paid - joining.Due) + Math.Max(0, amountPaid - amountDue);
        var upcomingYear = (int?)null;
        decimal upcomingDue = 0, upcomingPaid = 0, upcomingOutstanding = 0;
        if (pays && !isLifeExempt)
        {
            var upcoming = await _db.Subscriptions.AsNoTracking()
                .Where(s => s.AccountId == account.AccountId && s.SubscriptionYear > year)
                .OrderBy(s => s.SubscriptionYear)
                .FirstOrDefaultAsync(cancellationToken);
            if (upcoming is not null)
            {
                upcomingYear = upcoming.SubscriptionYear;
                upcomingDue = upcoming.AmountDue;
                upcomingPaid = upcoming.AmountPaid;
                upcomingOutstanding = Math.Max(0, upcoming.AmountDue - upcoming.AmountPaid);
            }
        }

        var duesBalance = outstanding + joining.Outstanding + upcomingOutstanding;
        var canVote = account.MembershipType.CanVote;
        var votingBlocked = canVote && duesBalance > 0;

        // Heal stale POSTED/REMOVED flags once the ledger is fully paid.
        if (duesBalance <= 0)
        {
            var statusCode = (account.CurrentMemberStatus?.Code ?? "").Trim().ToUpperInvariant();
            if (statusCode is "REMOVED" or "POSTED")
            {
                var active = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "ACTIVE", cancellationToken);
                if (active is not null)
                {
                    account.CurrentMemberStatusId = active.MemberStatusId;
                    account.IsActive = true;
                    account.EndDate = null;
                    await _db.SaveChangesAsync(cancellationToken);
                    account.CurrentMemberStatus = active;
                }
            }
            if (standingCode is "AtRiskOfRemoval" or "Posted" or "Unpaid")
            {
                standingCode = "InGoodStanding";
                detail = "Joining fee and current-year subscription are settled.";
            }
        }
        else if (upcomingOutstanding > 0 && outstanding <= 0 && joining.Outstanding <= 0)
        {
            detail = $"{upcomingYear} annual subscription has been generated and is unpaid ({upcomingOutstanding:0.##} KES).";
        }

        return new MemberSubscriptionDto
        {
            Standing = standingCode,
            Detail = detail,
            PaysSubscription = pays && !isLifeExempt,
            Year = year,
            AmountDue = amountDue,
            AmountPaid = amountPaid,
            Outstanding = outstanding,
            DueDate = due,
            PostingDeadline = posting,
            RemovalDeadline = removal,
            DiscountPercent = discount,
            JoiningFeeDue = joining.Due,
            JoiningPaid = joining.Paid,
            JoiningOutstanding = joining.Outstanding,
            EntranceFeeWaived = joining.Waived,
            Balance = duesBalance,
            MembershipNo = account.MembershipNo,
            MembershipTypeCode = account.MembershipType.Code,
            MembershipTypeName = account.MembershipType.Name,
            FullAnnualRate = fullAnnual,
            IsLifeExempt = isLifeExempt,
            IsSeniorMember = isSeniorByRules,
            HalfYearProrated = halfYear,
            CanVote = canVote,
            VotingBlockedByArrears = votingBlocked,
            ClubCreditBalance = clubCredit,
            ContinuousMembershipYears = years,
            AgeYears = age,
            StatusCode = account.CurrentMemberStatus?.Code ?? "",
            UpcomingYear = upcomingYear,
            UpcomingAmountDue = upcomingDue,
            UpcomingAmountPaid = upcomingPaid,
            UpcomingOutstanding = upcomingOutstanding,
            UpcomingPaymentStatus = upcomingYear is null
                ? "Unpaid"
                : await ResolveLiveFeeStatusAsync(
                    account.AccountId,
                    "ANNUAL",
                    upcomingDue,
                    upcomingPaid,
                    upcomingOutstanding,
                    waived: false,
                    cancellationToken),
            AnnualPaymentStatus = await ResolveLiveFeeStatusAsync(
                account.AccountId,
                "ANNUAL",
                amountDue,
                amountPaid,
                outstanding,
                waived: isLifeExempt,
                cancellationToken),
            JoiningPaymentStatus = await ResolveLiveFeeStatusAsync(
                account.AccountId,
                "JOINING",
                joining.Due,
                joining.Paid,
                joining.Outstanding,
                waived: joining.Waived,
                cancellationToken)
        };
    }

    public async Task<MpesaStkPushResultDto> InitiateMpesaStkAsync(
        long profileId,
        MpesaStkPushRequest request,
        CancellationToken cancellationToken)
    {
        var account = await LoadAccountAsync(profileId, cancellationToken)
            ?? throw new InvalidOperationException("Membership account was not found.");
        if (request.Amount <= 0)
            throw new InvalidOperationException("STK amount must be greater than zero.");

        var phone = NormalizeKenyaMpesaPhone(request.Phone)
            ?? throw new InvalidOperationException("Enter a valid Kenyan M-Pesa phone (07… / 01… / 254…).");

        // Gateway integration point: until Safaricom Daraja credentials are configured,
        // return a simulated checkout id so the portal can complete the STK UX flow.
        var token = Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
        var checkoutId = $"ws_CO_{DateTime.UtcNow:yyyyMMddHHmmss}_{token}";
        var merchantId = $"ACEA-{account.MembershipNo ?? account.AccountId.ToString()}-{token}";
        var reference = string.IsNullOrWhiteSpace(request.AccountReference)
            ? account.MembershipNo ?? $"ACEA-{account.AccountId}"
            : request.AccountReference.Trim();

        return new MpesaStkPushResultDto
        {
            CheckoutRequestId = checkoutId,
            MerchantRequestId = merchantId,
            CustomerMessage = $"STK push sent to {phone} for {request.Amount:0.00} KES ({reference}). Approve on your phone, then enter the M-Pesa code below.",
            Status = "PENDING",
            Phone = phone,
            Amount = request.Amount
        };
    }

    public async Task<PaymentRowDto> PaySubscriptionAsync(long profileId, MemberPayRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await LoadAccountAsync(profileId, cancellationToken)
            ?? throw new InvalidOperationException("Membership account was not found.");

        var feeCode = (request.FeeTypeCode ?? "ANNUAL").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        if (feeCode is "SUBSCRIPTION" or "ANNUAL_SUBSCRIPTION") feeCode = "ANNUAL";
        if (feeCode is "ENTRANCE" or "ENTRANCE_FEE" or "JOINING_FEE") feeCode = "JOINING";
        if (feeCode is "ROOM" or "ACCOM" or "ACCOMMODATION_FEE") feeCode = "ACCOMMODATION";
        if (feeCode is "CUSTOM" or "MISC" or "OTHER_FEE") feeCode = "OTHER";
        if (feeCode is "OUTSIDE_FOOD" or "OUTSIDE_CATERING") feeCode = "CORKAGE";

        var allowed = feeCode is "JOINING" or "ANNUAL" or "ACCOMMODATION" or "CORKAGE" or "OTHER";
        if (!allowed)
            throw new InvalidOperationException("Fee type must be JOINING, ANNUAL, ACCOMMODATION, CORKAGE or OTHER.");

        if (feeCode == "ANNUAL" && !account.MembershipType.CanAccessSubscriptions)
            throw new InvalidOperationException("This membership class does not pay subscriptions.");

        var fee = await _db.FeeTypes.FirstOrDefaultAsync(
                x => x.Code == feeCode || x.Code == request.FeeTypeCode,
                cancellationToken);
        if (fee is null)
        {
            fee = new Entities.Lookups.FeeType
            {
                Code = feeCode,
                Name = feeCode switch
                {
                    "ACCOMMODATION" => "Accommodation / room",
                    "CORKAGE" => "Corkage / outside food",
                    "OTHER" => "Other club charge",
                    _ => feeCode
                },
                SortOrder = 50,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.FeeTypes.Add(fee);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var method = await _db.PaymentMethods.AsNoTracking()
            .FirstOrDefaultAsync(x => x.PaymentMethodId == request.PaymentMethodId, cancellationToken)
            ?? throw new InvalidOperationException("Payment method was not found.");
        var methodCode = (method.Code ?? "").Trim().ToUpperInvariant().Replace("-", "_");

        if (methodCode is "CLUB_CARD" or "ACCOUNT_BALANCE" or "CLUB_CREDIT" or "MEMBER_ACCOUNT")
        {
            var subSnapshot = await GetSubscriptionAsync(profileId, cancellationToken);
            var credit = subSnapshot?.ClubCreditBalance ?? 0;
            if (request.Amount > credit)
                throw new InvalidOperationException(
                    $"Club card balance is {credit:0.00} KES — not enough to cover {request.Amount:0.00} KES.");
            request.PaymentStatusCode = "PAID";
        }

        var note = request.ReferenceNote;
        if (!string.IsNullOrWhiteSpace(request.LineDescription))
        {
            var line = request.LineDescription.Trim();
            note = string.IsNullOrWhiteSpace(note) ? line : $"{line} | {note}";
        }
        if (request.NmChargeId is long nmId && feeCode is "ACCOMMODATION" or "CORKAGE" or "OTHER")
        {
            var kind = feeCode switch
            {
                "ACCOMMODATION" => "accommodation",
                "CORKAGE" => "corkage",
                _ => "custom",
            };
            var tag = $"nm:{kind}:{nmId}";
            note = string.IsNullOrWhiteSpace(note) ? tag : $"{note} | {tag}";
        }
        if (!string.IsNullOrWhiteSpace(request.MpesaPhone))
        {
            var phoneNote = $"M-Pesa phone: {request.MpesaPhone.Trim()}";
            note = string.IsNullOrWhiteSpace(note) ? phoneNote : $"{note} | {phoneNote}";
        }

        var row = await _finance.RecordPaymentAsync(new RecordPaymentRequest(
            account.AccountId,
            account.ApplicationId,
            fee.FeeTypeId,
            request.PaymentMethodId,
            request.Amount,
            request.PaymentDate,
            request.ChequeNo,
            request.MpesaCode,
            note,
            request.PaymentStatusCode,
            request.ChequeBankName,
            request.ChequeBankCode,
            request.ChequeDate,
            request.ChequeFileName,
            request.ChequeFileUrl,
            request.SubscriptionYear), actorUserId, cancellationToken);

        var statusCode = (row.StatusCode ?? row.Status ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        if (statusCode is "PAID" or "SETTLED" or "WAIVED" or "PARTIALLY_PAID"
            && feeCode is "ACCOMMODATION" or "CORKAGE" or "OTHER")
        {
            try
            {
                await _nmBilling.SettleFromMemberPaymentAsync(
                    account.AccountId,
                    feeCode,
                    request.Amount,
                    method.Code ?? "CASH",
                    request.MpesaCode ?? request.ChequeNo ?? request.ReferenceNote,
                    request.NmChargeId,
                    actorUserId,
                    cancellationToken);
            }
            catch (InvalidOperationException)
            {
                // Payment recorded; charge may already be settled or not found.
            }
        }

        return row;
    }

    private static string? NormalizeKenyaMpesaPhone(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = new string(raw.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("0") && digits.Length == 10)
            digits = "254" + digits[1..];
        if (digits.StartsWith("7") && digits.Length == 9)
            digits = "254" + digits;
        if (digits.StartsWith("1") && digits.Length == 9)
            digits = "254" + digits;
        if (digits.Length == 12 && digits.StartsWith("254"))
            return digits;
        return null;
    }

    private async Task<(decimal Due, decimal Paid, decimal Outstanding, bool Waived)> ResolveJoiningDuesAsync(
        Entities.MembershipAccount.MAccount account,
        CancellationToken cancellationToken)
    {
        var waived = account.EntranceFeeWaivedFlag;
        decimal due = waived ? 0 : (account.EntranceFeeAmount ?? 0);
        if (!waived && due <= 0 && account.Profile?.DateOfBirth is DateOnly dob)
        {
            try
            {
                var quote = await _finance.QuoteAsync(
                    account.MembershipTypeId,
                    dob,
                    DateOnly.FromDateTime(DateTime.UtcNow),
                    cancellationToken);
                due = quote.PayableJoining;
            }
            catch
            {
                // Keep due at 0 when no fee schedule exists.
            }
        }

        var joiningFee = await _db.FeeTypes.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Code == "JOINING" || x.Code == "Joining", cancellationToken);
        decimal paid = 0;
        if (joiningFee is not null)
        {
            paid = await _db.Transactions.AsNoTracking()
                .Where(t =>
                    t.AccountId == account.AccountId
                    && t.FeeTypeId == joiningFee.FeeTypeId
                    && t.Amount > 0
                    && (t.PaymentStatus.Code == "PAID"
                        || t.PaymentStatus.Code == "WAIVED"
                        || t.PaymentStatus.Code == "PARTIALLY_PAID"
                        || t.PaymentStatus.Code == "SETTLED"
                        || t.PaymentStatus.Code == "REFUNDED"))
                .SumAsync(t => (decimal?)t.Amount, cancellationToken) ?? 0;
        }

        var outstanding = Math.Max(0, due - paid);
        return (due, paid, outstanding, waived);
    }

    private async Task<string> ResolveLiveFeeStatusAsync(
        long accountId,
        string feeCode,
        decimal due,
        decimal paid,
        decimal outstanding,
        bool waived,
        CancellationToken cancellationToken)
    {
        if (waived && outstanding <= 0) return "Waived";
        var hasPending = await _db.Transactions.AsNoTracking()
            .AnyAsync(t =>
                t.AccountId == accountId
                && t.FeeType != null
                && (t.FeeType.Code == feeCode
                    || (feeCode == "JOINING" && t.FeeType.Code == "ENTRANCE")
                    || (feeCode == "ANNUAL" && (t.FeeType.Code == "SUBSCRIPTION" || t.FeeType.Code == "ANNUAL_SUBSCRIPTION")))
                && (t.PaymentStatus.Code == "PENDING"
                    || t.PaymentStatus.Code == "INITIATED"
                    || t.PaymentStatus.Code == "UNCLEARED"),
                cancellationToken);
        if (hasPending) return "PendingVerification";
        if (outstanding <= 0.01m && (paid > 0.01m || due <= 0.01m)) return "Paid";
        if (paid > 0.01m && outstanding > 0.01m) return "PartiallyPaid";
        return "Unpaid";
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

    public async Task<PagedResult<EndorsementHistoryDto>> ListHistoryAsync(
        long profileId,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var rows = await LoadHistoryRowsAsync(profileId, includeHidden: false, cancellationToken);
        var ordered = rows
            .Where(r => !r.Hidden)
            .OrderByDescending(r => r.CompletedAt)
            .ToList();
        return Paging.FromList(ordered, paging);
    }

    public async Task<IReadOnlyList<EndorsementHistoryDto>> SearchHistoryAsync(long profileId, string? query, CancellationToken cancellationToken)
    {
        var q = (query ?? "").Trim();
        var rows = await LoadHistoryRowsAsync(profileId, includeHidden: true, cancellationToken);
        IEnumerable<EndorsementHistoryDto> filtered = rows;
        if (q.Length == 0)
            filtered = rows.Where(r => r.Hidden);
        else if (q.Length >= 2)
        {
            filtered = rows.Where(r =>
                ContainsInsensitive(r.ApplicantName, q)
                || ContainsInsensitive(r.ApplicationNo, q)
                || ContainsInsensitive(r.Role, q)
                || ContainsInsensitive(r.Outcome, q)
                || ContainsInsensitive(r.MembershipType, q)
                || ContainsInsensitive(r.PersonalKnowledge, q)
                || ContainsInsensitive(r.DeclineReason, q)
                || ContainsInsensitive(r.LastRejectionReason, q));
        }
        else
            return Array.Empty<EndorsementHistoryDto>();

        return filtered
            .OrderByDescending(r => r.Hidden)
            .ThenByDescending(r => r.CompletedAt)
            .Take(50)
            .ToList();
    }

    public async Task<EndorsementHistoryDto> GetHistoryAsync(long profileId, long endorsementId, CancellationToken cancellationToken)
    {
        var endorsement = await LoadOwnedEndorsementAsync(profileId, endorsementId, cancellationToken);
        return MapHistory(endorsement, endorsement.HiddenFromEndorser);
    }

    public async Task<EndorsementHistoryDto> UpdateHistoryAsync(long profileId, long endorsementId, UpdateEndorsementHistoryRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var endorsement = await LoadOwnedEndorsementAsync(profileId, endorsementId, cancellationToken);
        if (!HistoryHasContent(endorsement))
            throw new InvalidOperationException("There is no endorsement statement to update.");

        var declined = endorsement.IsDeclined;
        var canEdit = CanEditHistory(endorsement);
        if (!canEdit)
            throw new InvalidOperationException("This record can no longer be edited because the application has moved on. You can still view or retrieve it.");

        if (declined)
        {
            var reason = (request.DeclineReason ?? "").Trim();
            if (reason.Length < 5)
                throw new InvalidOperationException("Enter a rejection reason of at least 5 characters.");
            endorsement.DeclineReason = reason;
            endorsement.PersonalKnowledge = Endorsement.DeclinedPrefix + " " + reason;
            endorsement.DeclinedAt ??= DateTime.UtcNow;
            endorsement.Status = Endorsement.StatusDeclined;
        }
        else
        {
            var personal = (request.PersonalKnowledge ?? "").Trim();
            var professional = (request.ProfessionalKnowledge ?? "").Trim();
            var value = (request.ValueAddition ?? "").Trim();
            if (personal.Length == 0 || professional.Length == 0 || value.Length == 0)
                throw new InvalidOperationException("Personal, professional, and value-addition statements are required.");
            endorsement.YearsKnownCandidate = request.YearsKnownCandidate;
            endorsement.PersonalKnowledge = personal;
            endorsement.ProfessionalKnowledge = professional;
            endorsement.ValueAddition = value;
            endorsement.Status = Endorsement.StatusComplete;
        }

        endorsement.UpdatedByUserId = actorUserId;
        endorsement.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return MapHistory(endorsement, endorsement.HiddenFromEndorser);
    }

    public async Task HideHistoryAsync(long profileId, long endorsementId, CancellationToken cancellationToken)
    {
        var endorsement = await LoadOwnedEndorsementAsync(profileId, endorsementId, cancellationToken);
        endorsement.HiddenFromEndorser = true;
        endorsement.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task RestoreHistoryAsync(long profileId, long endorsementId, CancellationToken cancellationToken)
    {
        var endorsement = await LoadOwnedEndorsementAsync(profileId, endorsementId, cancellationToken);
        endorsement.HiddenFromEndorser = false;
        endorsement.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
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
            && RolesMatch(e.EndorserRole, role)
            && !e.IsDeclined);

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
            existing.Status = Endorsement.StatusComplete;
            existing.DeclinedAt = null;
            existing.DeclineReason = null;
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
                Status = Endorsement.StatusComplete,
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

    public async Task DeclineEndorsementAsync(long profileId, long applicationId, DeclineEndorsementRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var reason = (request.Reason ?? "").Trim();
        if (reason.Length < 5)
            throw new InvalidOperationException("Enter a rejection reason of at least 5 characters.");

        var application = await _db.Applications
            .Include(a => a.Endorsements)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");

        var role = ResolveNamedEndorserRole(application, profileId, request.EndorserRole)
            ?? throw new InvalidOperationException("You are not named as proposer or seconder on this application.");
        if (IsEndorsementComplete(application, role))
            throw new InvalidOperationException("This endorsement is already complete.");

        var joiningYear = await JoiningYearAsync(profileId, cancellationToken);
        var profile = await _db.Profiles.FirstAsync(p => p.ProfileId == profileId, cancellationToken);
        var declinedAt = DateTime.UtcNow;

        var stub = application.Endorsements.FirstOrDefault(e =>
            e.EndorserProfileId == profileId
            && RolesMatch(e.EndorserRole, role)
            && !e.IsDeclined
            && string.IsNullOrWhiteSpace(e.PersonalKnowledge)
            && string.IsNullOrWhiteSpace(e.ProfessionalKnowledge)
            && string.IsNullOrWhiteSpace(e.ValueAddition));

        if (stub is not null)
        {
            stub.EndorserRole = role;
            stub.YearsKnownCandidate = null;
            stub.PersonalKnowledge = Endorsement.DeclinedPrefix + " " + reason;
            stub.ProfessionalKnowledge = null;
            stub.ValueAddition = null;
            stub.Status = Endorsement.StatusDeclined;
            stub.DeclinedAt = declinedAt;
            stub.DeclineReason = reason;
            stub.EndorserYearOfJoining = joiningYear;
            stub.EndorserPhone = profile.Mobile;
            stub.EndorserEmail = profile.Email;
            stub.UpdatedByUserId = actorUserId;
            stub.UpdatedAt = declinedAt;
        }
        else
        {
            _db.Endorsements.Add(new Endorsement
            {
                ApplicationId = applicationId,
                EndorserProfileId = profileId,
                EndorserRole = role,
                PersonalKnowledge = Endorsement.DeclinedPrefix + " " + reason,
                Status = Endorsement.StatusDeclined,
                DeclinedAt = declinedAt,
                DeclineReason = reason,
                EndorserYearOfJoining = joiningYear,
                EndorserPhone = profile.Mobile,
                EndorserEmail = profile.Email,
                CreatedAt = declinedAt,
                CreatedByUserId = actorUserId
            });
        }

        if (NormalizeEndorserRole(role) == "PROPOSER")
            application.ProposerProfileId = null;
        else
            application.SeconderProfileId = null;

        ClearSupporterFromForm(application, role);
        application.UpdatedByUserId = actorUserId;
        application.UpdatedAt = DateTime.UtcNow;

        _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
        {
            ApplicationId = applicationId,
            FromStatusId = application.ApplicationStatusId,
            ToStatusId = application.ApplicationStatusId,
            ChangedAt = DateTime.UtcNow,
            ChangedByUserId = actorUserId,
            Reason = $"{ToRoleLabel(role)} declined to endorse: {reason}",
            Action = "ENDORSEMENT_DECLINED"
        });

        await _db.SaveChangesAsync(cancellationToken);

        var endorserName = string.Join(" ", new[] { profile.FirstName, profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));
        try
        {
            await _endorsementInvites.NotifyEndorsementDeclinedAsync(
                applicationId,
                ToRoleLabel(role),
                endorserName,
                reason,
                cancellationToken);
        }
        catch { /* keep the decline even if notify fails */ }
    }

    public async Task<IReadOnlyList<MemberNotificationDto>> ListNotificationsAsync(long profileId, CancellationToken cancellationToken)
    {
        await EnsureNotificationFlagsAsync(cancellationToken);

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
            .Where(n => n.DismissedAt == null)
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
                n.RelatedEntityId,
                n.ReadAt
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
                IsRead = n.ReadAt is not null,
                RelatedEntityType = n.RelatedEntityType,
                RelatedEntityId = n.RelatedEntityId
            };
        }).ToList();
    }

    public async Task MarkNotificationReadAsync(long profileId, long notificationId, CancellationToken cancellationToken)
    {
        await EnsureNotificationFlagsAsync(cancellationToken);
        var row = await FindOwnedNotificationAsync(profileId, notificationId, cancellationToken)
            ?? throw new InvalidOperationException("Notification not found.");
        if (row.ReadAt is null)
        {
            row.ReadAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task DismissNotificationAsync(long profileId, long notificationId, CancellationToken cancellationToken)
    {
        await EnsureNotificationFlagsAsync(cancellationToken);
        var row = await FindOwnedNotificationAsync(profileId, notificationId, cancellationToken)
            ?? throw new InvalidOperationException("Notification not found.");
        row.DismissedAt = DateTime.UtcNow;
        row.ReadAt ??= row.DismissedAt;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<IQueryable<Entities.Engagement.Notification>> OwnedNotificationsQueryAsync(
        long profileId,
        CancellationToken cancellationToken)
    {
        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);
        var email = await _db.Profiles.AsNoTracking()
            .Where(p => p.ProfileId == profileId)
            .Select(p => p.Email)
            .FirstOrDefaultAsync(cancellationToken);

        return _db.Notifications.Where(n =>
            (accountId != null && n.AccountId == accountId)
            || (!string.IsNullOrWhiteSpace(email) && n.Recipient == email)
            || n.Recipient == profileId.ToString());
    }

    private async Task<Entities.Engagement.Notification?> FindOwnedNotificationAsync(
        long profileId,
        long notificationId,
        CancellationToken cancellationToken)
    {
        var query = await OwnedNotificationsQueryAsync(profileId, cancellationToken);
        return await query.FirstOrDefaultAsync(n => n.NotificationId == notificationId, cancellationToken);
    }

    public async Task MarkAllNotificationsReadAsync(long profileId, CancellationToken cancellationToken)
    {
        await EnsureNotificationFlagsAsync(cancellationToken);
        var query = await OwnedNotificationsQueryAsync(profileId, cancellationToken);
        var rows = await query
            .Where(n => n.DismissedAt == null && n.ReadAt == null)
            .ToListAsync(cancellationToken);
        if (rows.Count == 0) return;
        var now = DateTime.UtcNow;
        foreach (var row in rows) row.ReadAt = now;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task DismissAllNotificationsAsync(long profileId, CancellationToken cancellationToken)
    {
        await EnsureNotificationFlagsAsync(cancellationToken);
        var query = await OwnedNotificationsQueryAsync(profileId, cancellationToken);
        var rows = await query
            .Where(n => n.DismissedAt == null)
            .ToListAsync(cancellationToken);
        if (rows.Count == 0) return;
        var now = DateTime.UtcNow;
        foreach (var row in rows)
        {
            row.DismissedAt = now;
            row.ReadAt ??= now;
        }
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureNotificationFlagsAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(
            """
            IF COL_LENGTH(N'dbo.Notification', N'read_at') IS NULL
                ALTER TABLE dbo.Notification ADD read_at DATETIME2 NULL;
            IF COL_LENGTH(N'dbo.Notification', N'dismissed_at') IS NULL
                ALTER TABLE dbo.Notification ADD dismissed_at DATETIME2 NULL;
            """,
            cancellationToken);
    }

    private static readonly HashSet<string> ManagerActionTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "MANAGER_PAYMENT_REQUEST",
        "MANAGER_DOCUMENT_REQUEST",
        "MANAGER_DETAILS_REQUEST",
        "MANAGER_ENDORSEMENT_REQUEST",
        "MANAGER_ENDORSEMENT_FOLLOWUP",
        "APPLICATION_PAYMENT_REQUIRED",
        "APPLICATION_PAYMENT_REJECTED",
        "APPLICATION_PENDING_ITEMS",
        "ENDORSEMENT_DECLINED"
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
        return c.Contains("ELECTION") || c.Contains("BALLOT") || c.Contains("AGM") || c.Contains("EGM") || c.Contains("PROXY");
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
            NightlyRate = request.NightlyRate,
            Status = "BOOKED",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId,
            UpdatedAt = DateTime.UtcNow,
            UpdatedByUserId = actorUserId
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
        booking.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<List<EndorsementHistoryDto>> LoadHistoryRowsAsync(long profileId, bool includeHidden, CancellationToken cancellationToken)
    {
        var endorsements = await _db.Endorsements
            .Include(e => e.Application).ThenInclude(a => a.Applicant)
            .Include(e => e.Application).ThenInclude(a => a.Status)
            .Include(e => e.Application).ThenInclude(a => a.ElectionType)
            .Include(e => e.Application).ThenInclude(a => a.ApplicationStatusHistories).ThenInclude(h => h.ToStatus)
            .Where(e => e.EndorserProfileId == profileId)
            .ToListAsync(cancellationToken);
        endorsements = endorsements.Where(HistoryHasContent).ToList();

        var rows = new List<EndorsementHistoryDto>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var endorsement in endorsements)
        {
            if (!includeHidden && endorsement.HiddenFromEndorser) continue;
            var row = MapHistory(endorsement, endorsement.HiddenFromEndorser);
            rows.Add(row);
            seen.Add(HistoryKey(row.ApplicationId, row.Role));
        }

        var namedApps = await _db.Applications
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .Include(a => a.ElectionType)
            .Include(a => a.ApplicationStatusHistories).ThenInclude(h => h.ToStatus)
            .Where(a => a.ProposerProfileId == profileId || a.SeconderProfileId == profileId)
            .ToListAsync(cancellationToken);

        foreach (var app in namedApps)
        {
            var pendingStage = IsPendingEndorsementStage(app.Status?.Code);
            if (app.ProposerProfileId == profileId)
                TryAddNamedHistory(rows, seen, app, "PROPOSER", pendingStage, endorsements);
            if (app.SeconderProfileId == profileId)
                TryAddNamedHistory(rows, seen, app, "SECONDER", pendingStage, endorsements);
        }

        return rows;
    }

    private static void TryAddNamedHistory(
        List<EndorsementHistoryDto> rows,
        HashSet<string> seen,
        MApplication app,
        string role,
        bool pendingStage,
        List<Endorsement> endorsements)
    {
        var key = HistoryKey(app.ApplicationId, role);
        if (seen.Contains(key)) return;
        var matching = endorsements.Where(e =>
            e.ApplicationId == app.ApplicationId && RolesMatch(e.EndorserRole, role)).ToList();
        if (matching.Count > 0) return;
        if (pendingStage) return;
        rows.Add(MapNamedHistory(app, role));
        seen.Add(key);
    }

    private async Task<Endorsement> LoadOwnedEndorsementAsync(long profileId, long endorsementId, CancellationToken cancellationToken)
    {
        return await _db.Endorsements
            .Include(e => e.Application).ThenInclude(a => a.Applicant)
            .Include(e => e.Application).ThenInclude(a => a.Status)
            .Include(e => e.Application).ThenInclude(a => a.ElectionType)
            .Include(e => e.Application).ThenInclude(a => a.ApplicationStatusHistories).ThenInclude(h => h.ToStatus)
            .FirstOrDefaultAsync(e => e.EndorsementId == endorsementId && e.EndorserProfileId == profileId, cancellationToken)
            ?? throw new InvalidOperationException("That endorsement history was not found.");
    }

    private static EndorsementHistoryDto MapHistory(Endorsement endorsement, bool hidden)
    {
        var app = endorsement.Application;
        var declined = endorsement.IsDeclined;
        var statusCode = app?.Status?.Code;
        return new EndorsementHistoryDto
        {
            EndorsementId = endorsement.EndorsementId,
            ApplicationId = endorsement.ApplicationId,
            ApplicationNo = app?.ApplicationNo ?? "",
            ApplicantName = ApplicantDisplayName(app?.Applicant),
            ApplicantPhotoUrl = app?.Applicant?.PhotoUrl,
            Role = ToRoleLabel(endorsement.EndorserRole),
            Outcome = declined ? "Declined" : (app?.Status?.Name ?? "Recorded"),
            ApplicationStatusCode = statusCode,
            MembershipType = MembershipTypeFromDraft(app?.FormDataJson) ?? app?.ElectionType?.Name,
            CompletedAt = endorsement.DeclinedAt ?? endorsement.UpdatedAt ?? endorsement.CreatedAt,
            YearsKnownCandidate = endorsement.YearsKnownCandidate,
            PersonalKnowledge = declined ? null : endorsement.PersonalKnowledge,
            ProfessionalKnowledge = declined ? null : endorsement.ProfessionalKnowledge,
            ValueAddition = declined ? null : endorsement.ValueAddition,
            DeclineReason = declined
                ? (endorsement.DeclineReason ?? StripDeclinedPrefix(endorsement.PersonalKnowledge))
                : null,
            DeclinedAt = endorsement.DeclinedAt,
            LastRejectionReason = LatestApplicationRejectionReason(app),
            CanEdit = CanEditHistory(endorsement),
            CanDelete = true,
            Hidden = hidden
        };
    }

    private static EndorsementHistoryDto MapNamedHistory(MApplication app, string role)
    {
        var code = app.Status?.Code;
        return new EndorsementHistoryDto
        {
            EndorsementId = null,
            ApplicationId = app.ApplicationId,
            ApplicationNo = app.ApplicationNo,
            ApplicantName = ApplicantDisplayName(app.Applicant),
            ApplicantPhotoUrl = app.Applicant?.PhotoUrl,
            Role = ToRoleLabel(role),
            Outcome = app.Status?.Name ?? "Recorded",
            ApplicationStatusCode = code,
            MembershipType = MembershipTypeFromDraft(app.FormDataJson) ?? app.ElectionType?.Name,
            CompletedAt = app.UpdatedAt ?? app.CreatedAt,
            LastRejectionReason = LatestApplicationRejectionReason(app),
            CanEdit = false,
            CanDelete = false,
            Hidden = false
        };
    }

    private static bool HistoryHasContent(Endorsement e) =>
        e.IsDeclined
        || !string.IsNullOrWhiteSpace(e.PersonalKnowledge)
        || !string.IsNullOrWhiteSpace(e.ProfessionalKnowledge)
        || !string.IsNullOrWhiteSpace(e.ValueAddition);

    private static bool CanEditHistory(Endorsement endorsement)
    {
        if (!HistoryHasContent(endorsement)) return false;
        if (endorsement.IsDeclined) return true;
        return IsPendingEndorsementStage(endorsement.Application?.Status?.Code);
    }

    private static bool IsPendingEndorsementStage(string? statusCode) =>
        string.Equals(statusCode, "Endorsement", StringComparison.OrdinalIgnoreCase)
        || string.Equals(statusCode, "EndorsementReview", StringComparison.OrdinalIgnoreCase);

    private static string HistoryKey(long applicationId, string role) =>
        applicationId + ":" + NormalizeEndorserRole(role);

    private static string ApplicantDisplayName(MProfile? profile) =>
        profile is null
            ? "Applicant"
            : string.Join(" ", new[] { profile.FirstName, profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v)));

    private static string? StripDeclinedPrefix(string? personalKnowledge)
    {
        var text = (personalKnowledge ?? "").Trim();
        if (!text.StartsWith(Endorsement.DeclinedPrefix, StringComparison.OrdinalIgnoreCase))
            return string.IsNullOrWhiteSpace(text) ? null : text;
        return text[Endorsement.DeclinedPrefix.Length..].Trim();
    }

    private static string? LatestApplicationRejectionReason(MApplication? app)
    {
        if (app?.ApplicationStatusHistories is null || app.ApplicationStatusHistories.Count == 0)
            return null;
        return app.ApplicationStatusHistories
            .Where(h =>
                string.Equals(h.Action, "REJECT", StringComparison.OrdinalIgnoreCase)
                || string.Equals(h.Action, "HANDBACK", StringComparison.OrdinalIgnoreCase)
                || string.Equals(h.ToStatus?.Code, "Rejected", StringComparison.OrdinalIgnoreCase)
                || string.Equals(h.ToStatus?.Code, "NotElected", StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrWhiteSpace(h.Reason)
                    && (app.Status?.Code is "Rejected" or "NotElected")))
            .OrderByDescending(h => h.ChangedAt)
            .Select(h => h.Reason)
            .FirstOrDefault(r => !string.IsNullOrWhiteSpace(r));
    }

    private static bool ContainsInsensitive(string? value, string query) =>
        !string.IsNullOrWhiteSpace(value)
        && value.Contains(query, StringComparison.OrdinalIgnoreCase);

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
            // A prior decline by someone else in this role must not hide the newly named member.
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
            && !Endorsement.IsDeclinedRecord(e.Status, e.PersonalKnowledge)
            && !string.IsNullOrWhiteSpace(e.PersonalKnowledge)
            && !string.IsNullOrWhiteSpace(e.ProfessionalKnowledge)
            && !string.IsNullOrWhiteSpace(e.ValueAddition));
    }

    private static string ToRoleLabel(string role) =>
        NormalizeEndorserRole(role) switch
        {
            "PROPOSER" => "Proposer",
            "SECONDER" => "Seconder",
            _ => string.IsNullOrWhiteSpace(role) ? "endorser" : role.Trim(),
        };

    private static void ClearSupporterFromForm(MApplication app, string role)
    {
        if (string.IsNullOrWhiteSpace(app.FormDataJson)) return;
        try
        {
            var node = JsonNode.Parse(app.FormDataJson);
            if (node is not JsonObject root) return;
            if (root["supporters"] is not JsonObject supporters) return;
            var key = NormalizeEndorserRole(role) == "PROPOSER" ? "proposer" : "seconder";
            supporters[key] = new JsonObject();
            app.FormDataJson = root.ToJsonString();
        }
        catch (JsonException)
        {
            /* leave the draft as-is if it cannot be parsed */
        }
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

        var year = DateTime.UtcNow.Year;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var sub = await _db.Subscriptions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == year, cancellationToken);
        var outstanding = sub is null ? 0 : Math.Max(0, sub.AmountDue - sub.AmountPaid);

        // Paid-up members are in good standing even if account status was not yet restored.
        if (outstanding <= 0)
            return ("InGoodStanding", "Subscription for the current year is settled.");

        if (string.Equals(statusCode, "POSTED", StringComparison.OrdinalIgnoreCase))
            return ("Posted", "Posted (in arrears) after the 28 February posting deadline.");

        if (today >= new DateOnly(year, 4, 30))
            return ("Unpaid", "Annual subscription is unpaid. Membership remains active.");
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
