using System.Data;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClubManagement.DTOs.Common;
using ClubManagement.Entities;
using ClubManagement.Entities.Facilities;
using ClubManagement.Entities.Finance;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Services.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClubManagement.Services.Finance;

public partial class FinanceService
{
    private readonly IEmailSender _email = null!;
    private readonly ILogger<FinanceService> _logger = null!;

    internal static class StatementLineKind
    {
        public const string Invoice = "INVOICE";
        public const string Payment = "PAYMENT";
        public const string Refund = "REFUND";
    }

    internal static bool RecognizesPayment(string? code)
    {
        var c = NormalizeStatus(code);
        return c is "PAID" or "WAIVED" or "PARTIALLY_PAID" or "SETTLED";
    }

    /// <summary>Money paid into the club: settled receipts, including ones later refunded or reversed.</summary>
    internal static bool IsMoneyInTransaction(string? statusCode, decimal amount)
    {
        if (amount <= 0) return false;
        var c = NormalizeStatus(statusCode);
        return RecognizesPayment(c) || c is "REFUNDED" or "REVERSED";
    }

    /// <summary>Money leaving the club: refund credit notes and reversal contras (negative postings).</summary>
    internal static bool IsMoneyOutTransaction(string? statusCode, decimal amount)
    {
        if (amount >= 0) return false;
        var c = NormalizeStatus(statusCode);
        return c is "REFUNDED" or "REVERSED";
    }

    private static StatementLineDto CreateStatementLine(
        DateOnly? date,
        string? fee,
        string? method,
        string? receipt,
        string? status,
        decimal amount,
        string kind,
        long? transactionId = null,
        bool informational = false)
        => new(date, fee, method, receipt, status, Math.Abs(amount), kind, transactionId, informational);

    /// <summary>Joining and annual invoices billed to a company, not to the member personally.</summary>
    private static bool IsSponsoredSubscriptionFee(string? feeType)
    {
        var code = (feeType ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        return code is "ANNUAL" or "SUBSCRIPTION" or "ANNUAL_SUBSCRIPTION"
            or "JOINING" or "ENTRANCE" or "JOINING_FEE" or "ENTRANCE_FEE";
    }

    private static int StatementLineSort(string? kind) => kind switch
    {
        StatementLineKind.Invoice => 0,
        StatementLineKind.Payment => 1,
        _ => 2,
    };

    internal static bool CountsTowardDues(string? code)
    {
        var c = NormalizeStatus(code);
        return RecognizesPayment(c);
    }

    internal static bool IsSettledOrReturned(string? code)
    {
        var c = NormalizeStatus(code);
        return RecognizesPayment(c) || c is "REFUNDED" or "REVERSED";
    }

    internal static string ReceiptDisplayStatus(string? code, string? name)
    {
        var c = NormalizeStatus(code);
        return c switch
        {
            "REVERSED" or "VOIDED" => "Voided",
            "REFUNDED" => "Refunded",
            _ => string.IsNullOrWhiteSpace(name) ? (code ?? "") : name
        };
    }

    internal static bool HoldsObligation(string? code)
    {
        var c = NormalizeStatus(code);
        return RecognizesPayment(c) || c is "PENDING" or "INITIATED" or "UNCLEARED";
    }

    internal static bool IsSettledDeskStatus(string? code)
    {
        var c = NormalizeStatus(code);
        return c is "PAID" or "WAIVED" or "PARTIALLY_PAID" or "REFUNDED" or "REVERSED" or "SETTLED";
    }

    internal static bool MatchesAnnualYear(MTransaction tx, int year, long? subscriptionId)
    {
        if (tx.SubscriptionId is long sid)
            return subscriptionId is long expected && sid == expected;
        return (tx.PaymentDate ?? DateOnly.FromDateTime(tx.CreatedAt)).Year == year;
    }

    internal static decimal SubscriptionUnpaid(Subscription s) =>
        s.WaivedFlag ? 0m : Math.Max(0m, s.AmountDue - s.AmountPaid);

    internal static decimal PriorYearUnpaid(IEnumerable<Subscription> subs, int year) =>
        subs.Where(s => s.SubscriptionYear < year).Sum(SubscriptionUnpaid);

    /// <summary>
    /// Apply annual receipts oldest year first so an unpaid 2026 balance is cleared
    /// before 2027, and leftover debt stays visible on the current year.
    /// </summary>
    internal static void ApplyAnnualPaymentWaterfall(IReadOnlyList<Subscription> subs, decimal paidPool)
    {
        var remaining = Math.Max(0m, paidPool);
        foreach (var sub in subs.OrderBy(s => s.SubscriptionYear))
        {
            var due = sub.WaivedFlag ? 0m : Math.Max(0m, sub.AmountDue);
            var applied = Math.Min(due, remaining);
            sub.AmountPaid = applied;
            sub.ArrearsAmount = Math.Max(0m, due - applied);
            remaining -= applied;
        }
    }

    private static string? NormalizeCreditOwner(string? value)
    {
        var code = (value ?? "").Trim().ToUpperInvariant();
        return code is "MEMBER" or "CORPORATE" ? code : null;
    }

    private static string NormalizeStatus(string? code) =>
        (code ?? "").Trim().ToUpperInvariant().Replace(" ", " ").Replace(" ", " ");

    private static string ObligationLabel(decimal due, decimal paid, decimal remaining)
    {
        if (due <= 0.01m && remaining <= 0.01m) return "Paid";
        if (remaining <= 0.01m) return "Paid";
        if (paid > 0.01m) return "PartiallyPaid";
        return "Unpaid";
    }

    private async Task<PaymentStatus> EnsurePaymentStatusAsync(
        string code,
        string name,
        int sortOrder,
        CancellationToken cancellationToken)
    {
        var existing = await _db.PaymentStatuses.FirstOrDefaultAsync(x => x.Code == code, cancellationToken);
        if (existing is not null) return existing;

        existing = new PaymentStatus
        {
            Code = code,
            Name = name,
            SortOrder = sortOrder,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.PaymentStatuses.Add(existing);
        await _db.SaveChangesAsync(cancellationToken);
        return existing;
    }

    private sealed record FeeObligation(decimal Due, decimal RecognizedPaid, decimal PendingHeld, decimal RemainingCap);

    private async Task<FeeObligation?> TryGetFeeObligationAsync(
        long? accountId,
        long? profileId,
        long feeTypeId,
        int? subscriptionYear,
        long? excludeTransactionId,
        CancellationToken cancellationToken,
        long? applicationId = null)
    {
        var fee = await _db.FeeTypes.AsNoTracking()
            .FirstOrDefaultAsync(f => f.FeeTypeId == feeTypeId, cancellationToken);
        if (fee is null || IsNmFee(fee.Code)) return null;

        var isAnnual = IsAnnualFee(fee.Code);
        var isJoining = IsJoiningFee(fee.Code);
        if (!isAnnual && !isJoining) return null;

        decimal due = 0;
        decimal recognizedPaid = 0;
        if (isAnnual && accountId is long annualAccountId)
        {
            var year = subscriptionYear ?? DateTime.UtcNow.Year;
            var subs = await _db.Subscriptions.AsNoTracking()
                .Where(s => s.AccountId == annualAccountId && s.SubscriptionYear <= year)
                .ToListAsync(cancellationToken);
            if (subs.Count == 0) return null;
            due = subs.Where(s => !s.WaivedFlag).Sum(s => s.AmountDue);
        }
        else if (isAnnual)
        {
            var appId = applicationId;
            if (appId is null && profileId is long annualProfileId)
            {
                appId = await _db.Applications.AsNoTracking()
                    .Where(a => a.ApplicantProfileId == annualProfileId)
                    .OrderByDescending(a => a.ApplicationId)
                    .Select(a => (long?)a.ApplicationId)
                    .FirstOrDefaultAsync(cancellationToken);
            }
            if (appId is long annualAppId)
            {
                var dues = await GetApplicationDuesAsync(annualAppId, cancellationToken);
                if (dues.AnnualInvoiced)
                    due = dues.AnnualSubscription;
            }
        }
            else if (isJoining)
        {
            if (accountId is long joiningAccountId)
            {
                var hasJoiningInvoice = await _db.BillingDocuments.AsNoTracking()
                    .AnyAsync(d =>
                        d.Kind == "INVOICE"
                        && d.FeeType == "JOINING"
                        && (d.Status == "APPROVED" || d.Status == "PUBLISHED")
                        && d.AccountId == joiningAccountId,
                        cancellationToken);
                if (!hasJoiningInvoice)
                {
                    due = 0;
                }
                else
                {
                    var account = await _db.Accounts.AsNoTracking()
                        .Include(a => a.Profile)
                        .FirstOrDefaultAsync(a => a.AccountId == joiningAccountId && !a.IsDeleted, cancellationToken);
                    if (account is null) return null;
                    due = account.EntranceFeeWaivedFlag ? 0 : (account.EntranceFeeAmount ?? 0);
                    if (!account.EntranceFeeWaivedFlag && due <= 0 && account.Profile?.DateOfBirth is DateOnly dob)
                    {
                        try
                        {
                            var quote = await QuoteAsync(
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
                }
            }
            else if (profileId is long pid)
            {
                var app = await _db.Applications.AsNoTracking()
                    .Where(a => a.ApplicantProfileId == pid)
                    .OrderByDescending(a => a.ApplicationId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (app is not null)
                {
                    var dues = await GetApplicationDuesAsync(app.ApplicationId, cancellationToken);
                    if (dues.JoiningInvoiced)
                    {
                        due = dues.JoiningFee;
                        recognizedPaid = dues.JoiningPaid;
                    }
                }
            }
        }

        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Where(t => t.FeeTypeId == feeTypeId)
            .Where(t => excludeTransactionId == null || t.TransactionId != excludeTransactionId)
            .Where(t =>
                (accountId != null && t.AccountId == accountId)
                || (profileId != null && t.ProfileId == profileId))
            .ToListAsync(cancellationToken);

        if (isAnnual && subscriptionYear is int annualYear && accountId is long aid)
        {
            var subIds = await _db.Subscriptions.AsNoTracking()
                .Where(s => s.AccountId == aid && s.SubscriptionYear <= annualYear)
                .Select(s => s.SubscriptionId)
                .ToListAsync(cancellationToken);
            txs = txs.Where(t =>
                    (t.SubscriptionId is long sid && subIds.Contains(sid))
                    || (t.SubscriptionId is null
                        && (t.PaymentDate ?? DateOnly.FromDateTime(t.CreatedAt)).Year <= annualYear))
                .ToList();
        }

        recognizedPaid = txs
            .Where(t => CountsTowardDues(t.PaymentStatus?.Code) && t.Amount > 0)
            .Sum(t => t.Amount);

        var pendingHeld = txs
            .Where(t =>
            {
                var c = NormalizeStatus(t.PaymentStatus?.Code);
                return c is "PENDING" or "INITIATED" or "UNCLEARED";
            })
            .Sum(t => t.Amount);

        var remaining = Math.Max(0, due - recognizedPaid - pendingHeld);
        return new FeeObligation(due, recognizedPaid, pendingHeld, remaining);
    }

    private sealed record PaymentSlice(long FeeTypeId, decimal Amount, string? ReferenceNote);

    /// <summary>
    /// Pays the selected fee up to its balance, then any other open joining or annual balance.
    /// Money still left on a member account is recorded as advance credit, not as another annual receipt.
    /// Once the receipt is cleared, <see cref="AutoAllocateReceiptsToInvoicesAsync"/> pins it to open
    /// membership invoices without changing the receipt amount.
    /// </summary>
    private async Task<IReadOnlyList<PaymentSlice>> BuildPaymentAllocationsAsync(
        RecordPaymentRequest request,
        long? profileId,
        CancellationToken cancellationToken)
    {
        var fee = await _db.FeeTypes.AsNoTracking()
            .FirstOrDefaultAsync(f => f.FeeTypeId == request.FeeTypeId, cancellationToken);
        if (fee is null || (!IsAnnualFee(fee.Code) && !IsJoiningFee(fee.Code)))
            return [new PaymentSlice(request.FeeTypeId, request.Amount, request.ReferenceNote)];

        var primary = await TryGetFeeObligationAsync(
            request.AccountId,
            profileId,
            request.FeeTypeId,
            request.SubscriptionYear,
            null,
            cancellationToken,
            request.ApplicationId);
        var room = Math.Max(0, primary?.RemainingCap ?? request.Amount);
        var applied = Math.Min(request.Amount, room);
        var extra = request.Amount - applied;

        long? otherFeeId = null;
        var otherApplied = 0m;
        if (extra > 0.009m)
        {
            var feeTypes = await _db.FeeTypes.AsNoTracking().ToListAsync(cancellationToken);
            var other = feeTypes.FirstOrDefault(f =>
                IsAnnualFee(fee.Code) ? IsJoiningFee(f.Code) : IsAnnualFee(f.Code));
            if (other is not null)
            {
                var otherCap = await TryGetFeeObligationAsync(
                    request.AccountId,
                    profileId,
                    other.FeeTypeId,
                    request.SubscriptionYear,
                    null,
                    cancellationToken,
                    request.ApplicationId);
                if (otherCap is not null && otherCap.RemainingCap > 0.009m)
                {
                    otherApplied = Math.Min(extra, otherCap.RemainingCap);
                    extra -= otherApplied;
                    otherFeeId = other.FeeTypeId;
                }
            }
        }

        var slices = new List<PaymentSlice>();
        var primaryAmount = decimal.Round(applied, 2, MidpointRounding.AwayFromZero);
        if (primaryAmount > 0.009m)
            slices.Add(new PaymentSlice(request.FeeTypeId, primaryAmount, request.ReferenceNote));
        if (otherFeeId is long otherId && otherApplied > 0.009m)
            slices.Add(new PaymentSlice(otherId, decimal.Round(otherApplied, 2, MidpointRounding.AwayFromZero), request.ReferenceNote));
        if (extra > 0.009m && request.AccountId is not null)
        {
            var advanceFee = await _db.FeeTypes.AsNoTracking()
                .FirstOrDefaultAsync(f => f.Code == "ADVANCE", cancellationToken);
            if (advanceFee is not null)
            {
                var surplus = decimal.Round(extra, 2, MidpointRounding.AwayFromZero);
                var note = string.IsNullOrWhiteSpace(request.ReferenceNote)
                    ? "Advance payment — held as credit"
                    : request.ReferenceNote;
                slices.Add(new PaymentSlice(advanceFee.FeeTypeId, surplus, note));
                extra = 0;
            }
        }
        if (extra > 0.009m)
        {
            var surplus = decimal.Round(extra, 2, MidpointRounding.AwayFromZero);
            if (slices.Count > 0)
            {
                var last = slices[^1];
                slices[^1] = last with { Amount = last.Amount + surplus };
            }
            else
                slices.Add(new PaymentSlice(request.FeeTypeId, surplus, request.ReferenceNote));
        }
        if (slices.Count == 0)
            slices.Add(new PaymentSlice(request.FeeTypeId, request.Amount, request.ReferenceNote));
        return slices;
    }

    private async Task FinalizeRecognizedStatusAsync(
        MTransaction tx,
        decimal remainingAfter,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var current = NormalizeStatus(tx.PaymentStatus?.Code);
        if (current is "WAIVED") return;
        if (remainingAfter > 0.01m)
        {
            var partial = await EnsurePaymentStatusAsync("PARTIALLY_PAID", "Partially paid", 25, cancellationToken);
            tx.PaymentStatusId = partial.PaymentStatusId;
            tx.PaymentStatus = partial;
            tx.UpdatedByUserId = actorUserId;
            await _db.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task<PaymentRowDto> AttachObligationAsync(
        PaymentRowDto row,
        long? accountId,
        long? profileId,
        long feeTypeId,
        int? subscriptionYear,
        CancellationToken cancellationToken)
    {
        var obligation = await TryGetFeeObligationAsync(
            accountId,
            profileId,
            feeTypeId,
            subscriptionYear,
            null,
            cancellationToken);
        if (obligation is null) return row;
        return row with
        {
            FeeDue = obligation.Due,
            FeePaidToDate = obligation.RecognizedPaid,
            FeeOutstanding = obligation.RemainingCap,
            ObligationStatus = ObligationLabel(obligation.Due, obligation.RecognizedPaid, obligation.RemainingCap)
        };
    }

    private static bool IsJoiningFee(string? feeCode)
    {
        var code = (feeCode ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        return code is "JOINING" or "ENTRANCE" or "ENTRANCE_FEE";
    }

    public async Task<PaymentRowDto> ReversePaymentAsync(
        long transactionId,
        ReversePaymentRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new InvalidOperationException("A reversal reason is required.");

        var tx = await _db.Transactions
            .Include(t => t.PaymentMethod)
            .Include(t => t.PaymentStatus)
            .Include(t => t.FeeType)
            .Include(t => t.Receipt)
            .Include(t => t.Profile)
            .Include(t => t.Account)
                .ThenInclude(a => a!.Profile)
            .FirstOrDefaultAsync(t => t.TransactionId == transactionId, cancellationToken)
            ?? throw new InvalidOperationException("Payment was not found.");

        var current = NormalizeStatus(tx.PaymentStatus?.Code);
        if (current is "REVERSED")
        {
            if (tx.AccountId is long reversedAccountId)
                await ReconcileAccountDuesAsync(reversedAccountId, cancellationToken);
            return await MapApprovedRow(tx, cancellationToken);
        }
        if (current is "REFUNDED")
            throw new InvalidOperationException("Refunded payments cannot be reversed. The refund already returned the money.");
        if (current is not ("PAID" or "WAIVED" or "PARTIALLY_PAID"))
            throw new InvalidOperationException($"Only settled payments can be reversed (current status: {tx.PaymentStatus?.Name ?? current}).");

        var already = await _db.ReversalEntries.AsNoTracking()
            .AnyAsync(r => r.SourceTransactionId == transactionId, cancellationToken);
        if (already)
            throw new InvalidOperationException("This payment has already been reversed.");

        var reversedStatus = await EnsurePaymentStatusAsync("REVERSED", "Reversed", 97, cancellationToken);
        var reason = request.Reason.Trim();
        var receiptNo = tx.Receipt?.ReceiptNumber;

        var contra = new MTransaction
        {
            AccountId = tx.AccountId,
            ProfileId = tx.ProfileId,
            SubscriptionId = tx.SubscriptionId,
            FeeTypeId = tx.FeeTypeId,
            PaymentMethodId = tx.PaymentMethodId,
            PaymentStatusId = reversedStatus.PaymentStatusId,
            Amount = -Math.Abs(tx.Amount),
            PaymentDate = DateOnly.FromDateTime(DateTime.UtcNow),
            ReferenceNote = $"Reversal of {(receiptNo ?? $"TX-{tx.TransactionId}")}: {reason}",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.Transactions.Add(contra);
        await _db.SaveChangesAsync(cancellationToken);

        tx.PaymentStatusId = reversedStatus.PaymentStatusId;
        tx.PaymentStatus = reversedStatus;
        tx.ReferenceNote = string.IsNullOrWhiteSpace(tx.ReferenceNote)
            ? $"REVERSED: {reason}"
            : $"{tx.ReferenceNote} | REVERSED: {reason}";
        tx.UpdatedByUserId = actorUserId;

        _db.ReversalEntries.Add(new ReversalEntry
        {
            SourceTransactionId = tx.TransactionId,
            ReversalTransactionId = contra.TransactionId,
            AccountId = tx.AccountId,
            Reason = reason,
            ReversedAt = DateTime.UtcNow,
            ReversedByUserId = actorUserId,
            CreatedAt = DateTime.UtcNow
        });

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransaction",
            RecordId = tx.TransactionId,
            Action = "UPDATE",
            NewValues = $"status=REVERSED; contra={contra.TransactionId}; reason={reason}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (tx.AccountId is long accountId)
            await ReconcileAccountDuesAsync(accountId, cancellationToken);

        return await MapApprovedRow(tx, cancellationToken);
    }

    public async Task<InvoiceDocumentDto> IssueSubscriptionInvoiceAsync(
        long accountId,
        int? year,
        bool sendEmail,
        long? actorUserId,
        CancellationToken cancellationToken,
        bool publishToMember = true,
        string? invoiceHtml = null)
    {
        var y = year ?? DateTime.UtcNow.Year;
        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CorporateCompany)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Member account was not found.");
        var delivery = InvoiceDeliveryPlan.For(account);
        if (publishToMember)
            publishToMember = delivery.PublishToMember;

        var sub = await _db.Subscriptions
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == y, cancellationToken)
            ?? throw new InvalidOperationException($"No {y} subscription was found for this member. Run annual renewal first.");

        var billedAmount = sub.WaivedFlag ? 0m : sub.AmountDue;
        var yearUnpaid = Math.Max(0m, billedAmount - sub.AmountPaid);

        var invoice = await _db.MembershipInvoices
            .FirstOrDefaultAsync(i => i.AccountId == accountId && i.Year == y, cancellationToken);
        if (invoice is null)
        {
            invoice = new MembershipInvoice
            {
                InvoiceNo = $"INV-{y}-{accountId:D6}",
                AccountId = accountId,
                SubscriptionId = sub.SubscriptionId,
                Year = y,
                IssuedAt = DateTime.UtcNow,
                DueDate = InvoiceDueDate(y),
                Amount = billedAmount,
                Status = yearUnpaid <= 0.009m ? "PAID" : sub.AmountPaid > 0 ? "PARTIAL" : "ISSUED",
                PublishedToMember = publishToMember,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.MembershipInvoices.Add(invoice);
            await _db.SaveChangesAsync(cancellationToken);
        }
        else
        {
            invoice.Amount = billedAmount;
            invoice.SubscriptionId = sub.SubscriptionId;
            invoice.Status = yearUnpaid <= 0.009m ? "PAID" : sub.AmountPaid > 0 ? "PARTIAL" : "ISSUED";
            invoice.DueDate = InvoiceDueDate(y);
            if (publishToMember)
                invoice.PublishedToMember = true;
            await _db.SaveChangesAsync(cancellationToken);
        }

        if (invoice.PublishedToMember)
            await ReconcileAccountDuesAsync(accountId, cancellationToken);

        var dto = await MapInvoiceAsync(invoice, account, sub, cancellationToken);
        if (sendEmail)
            await TryEmailInvoiceAsync(invoice, dto, delivery, invoiceHtml, cancellationToken);
        return invoice.SentAt is not null ? await MapInvoiceAsync(invoice, account, sub, cancellationToken) : dto;
    }

    public async Task<InvoiceDocumentDto?> GetSubscriptionInvoiceAsync(
        long accountId,
        int? year,
        CancellationToken cancellationToken,
        bool memberPortalOnly = false)
    {
        var y = year ?? DateTime.UtcNow.Year;
        var invoice = await _db.MembershipInvoices
            .FirstOrDefaultAsync(i => i.AccountId == accountId && i.Year == y, cancellationToken);
        if (invoice is null) return null;
        if (memberPortalOnly && !invoice.PublishedToMember) return null;

        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .FirstOrDefaultAsync(a => a.AccountId == accountId, cancellationToken)
            ?? throw new InvalidOperationException("Member account was not found.");
        var sub = await _db.Subscriptions
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == y, cancellationToken);
        return await MapInvoiceAsync(invoice, account, sub, cancellationToken);
    }

    public async Task<PagedResult<InvoiceQueueRowDto>> ListInvoiceQueueAsync(
        SubscriptionListFilter filter,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var y = filter.Year ?? DateTime.UtcNow.Year;
        var deliveredAccountIds = DeliveredInvoiceAccountIds(y);
        var activityAccountIds = AnnualPaymentActivityAccountIds();
        var query = InvoiceArrearsQuery(y, filter.MembershipType, filter.Search)
            .Where(s =>
                !deliveredAccountIds.Contains(s.AccountId)
                || activityAccountIds.Contains(s.AccountId));

        var total = await query.CountAsync(cancellationToken);
        var rows = await query
            .Include(s => s.Account)
                .ThenInclude(a => a.Profile)
            .Include(s => s.Account)
                .ThenInclude(a => a.MembershipType)
            .OrderByDescending(s => s.ArrearsAmount)
            .ThenBy(s => s.Account.MembershipNo)
            .Skip(paging.Skip)
            .Take(paging.PageSize)
            .ToListAsync(cancellationToken);

        var accountIds = rows.Select(s => s.AccountId).Distinct().ToList();
        var invoices = accountIds.Count == 0
            ? new Dictionary<long, string>()
            : (await _db.MembershipInvoices.AsNoTracking()
                .Where(i => i.Year == y && accountIds.Contains(i.AccountId))
                .Select(i => new { i.AccountId, i.InvoiceNo })
                .ToListAsync(cancellationToken))
                .GroupBy(i => i.AccountId)
                .ToDictionary(g => g.Key, g => g.First().InvoiceNo);

        var items = rows.Select(s =>
        {
            var name = $"{s.Account.Profile?.FirstName} {s.Account.Profile?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name))
                name = s.Account.MembershipNo ?? "Member";
            invoices.TryGetValue(s.AccountId, out var invoiceNo);
            return new InvoiceQueueRowDto(
                s.AccountId,
                s.SubscriptionId,
                s.Account.MembershipNo ?? "",
                name,
                s.Account.MembershipType?.Name,
                s.Account.MembershipType?.Code,
                s.AmountDue,
                s.AmountPaid,
                s.ArrearsAmount,
                s.Account.Profile?.Email,
                invoiceNo,
                InvoiceEmailSent: false);
        }).ToList();

        return Paging.Create(items, paging, total);
    }

    public async Task<PagedResult<InvoiceRosterRowDto>> ListInvoiceRosterAsync(
        SubscriptionListFilter filter,
        PagedRequest paging,
        bool? received,
        CancellationToken cancellationToken)
    {
        var y = filter.Year ?? DateTime.UtcNow.Year;
        var deliveredAccountIds = DeliveredInvoiceAccountIds(y);
        var query = InvoiceArrearsQuery(y, filter.MembershipType, filter.Search);
        if (received == true)
            query = query.Where(s => deliveredAccountIds.Contains(s.AccountId));
        else if (received == false)
            query = query.Where(s => !deliveredAccountIds.Contains(s.AccountId));

        var total = await query.CountAsync(cancellationToken);
        var rows = await query
            .Include(s => s.Account)
                .ThenInclude(a => a.Profile)
            .Include(s => s.Account)
                .ThenInclude(a => a.MembershipType)
            .OrderBy(s => s.Account.MembershipType != null ? s.Account.MembershipType.Name : "")
            .ThenBy(s => s.Account.MembershipNo)
            .Skip(paging.Skip)
            .Take(paging.PageSize)
            .ToListAsync(cancellationToken);

        var accountIds = rows.Select(s => s.AccountId).Distinct().ToList();
        var invoices = accountIds.Count == 0
            ? new Dictionary<long, string>()
            : (await _db.MembershipInvoices.AsNoTracking()
                .Where(i => i.Year == y && accountIds.Contains(i.AccountId))
                .Select(i => new { i.AccountId, i.InvoiceNo })
                .ToListAsync(cancellationToken))
                .GroupBy(i => i.AccountId)
                .ToDictionary(g => g.Key, g => g.First().InvoiceNo);
        var delivered = await deliveredAccountIds.Distinct().ToListAsync(cancellationToken);
        var deliveredSet = delivered.ToHashSet();

        var items = rows.Select(s =>
        {
            var name = $"{s.Account.Profile?.FirstName} {s.Account.Profile?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name))
                name = s.Account.MembershipNo ?? "Member";
            invoices.TryGetValue(s.AccountId, out var invoiceNo);
            return new InvoiceRosterRowDto(
                s.AccountId,
                s.SubscriptionId,
                s.Account.MembershipNo ?? "",
                name,
                s.Account.MembershipType?.Name,
                s.Account.MembershipType?.Code,
                s.AmountDue,
                s.AmountPaid,
                s.ArrearsAmount,
                s.Account.Profile?.Email,
                invoiceNo,
                deliveredSet.Contains(s.AccountId));
        }).ToList();

        return Paging.Create(items, paging, total);
    }

    public async Task<InvoiceRunStatsDto> GetInvoiceRunStatsAsync(
        int year,
        string? membershipType,
        CancellationToken cancellationToken)
    {
        var arrears = InvoiceArrearsQuery(year, membershipType, search: null);
        var membersInArrears = await arrears.Select(s => s.AccountId).Distinct().CountAsync(cancellationToken);
        var totalArrears = membersInArrears == 0
            ? 0
            : await arrears.SumAsync(s => s.ArrearsAmount, cancellationToken);
        var deliveredAccountIds = DeliveredInvoiceAccountIds(year);
        var membersReceived = await arrears
            .Where(s => deliveredAccountIds.Contains(s.AccountId))
            .Select(s => s.AccountId)
            .Distinct()
            .CountAsync(cancellationToken);
        return new InvoiceRunStatsDto(
            membersInArrears,
            membersReceived,
            Math.Max(0, membersInArrears - membersReceived),
            totalArrears);
    }

    public async Task<InvoiceIssueBatchResult> IssueAnnualInvoicesForYearAsync(
        int year,
        long? actorUserId,
        bool sendEmail,
        CancellationToken cancellationToken,
        IReadOnlyList<long>? accountIds = null,
        bool publishToMember = true,
        IReadOnlyDictionary<long, string>? invoiceHtmlByAccountId = null)
    {
        if (!sendEmail && !publishToMember)
            throw new InvalidOperationException("Choose email, member dashboard, or both.");

        var query = InvoiceArrearsQuery(year, null, null);
        if (accountIds is { Count: > 0 })
        {
            var ids = accountIds.Distinct().ToList();
            query = query.Where(s => ids.Contains(s.AccountId));
        }

        var targets = await query.Select(s => s.AccountId).Distinct().ToListAsync(cancellationToken);

        var issued = 0;
        var emailed = 0;
        var published = 0;
        var skippedNoEmail = 0;
        foreach (var accountId in targets)
        {
            try
            {
                string? invoiceHtml = null;
                invoiceHtmlByAccountId?.TryGetValue(accountId, out invoiceHtml);
                var dto = await IssueSubscriptionInvoiceAsync(
                    accountId,
                    year,
                    sendEmail,
                    actorUserId,
                    cancellationToken,
                    publishToMember,
                    invoiceHtml);
                issued++;
                if (publishToMember) published++;
                if (sendEmail)
                {
                    if (dto.EmailSent) emailed++;
                    else skippedNoEmail++;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not issue {Year} invoice for account {AccountId}", year, accountId);
            }
        }
        return new InvoiceIssueBatchResult(issued, emailed, published, skippedNoEmail);
    }

    public async Task ReconcileAccountDuesAsync(long accountId, CancellationToken cancellationToken)
    {
        var annualIds = await _db.FeeTypes.AsNoTracking()
            .Where(f => f.Code == "ANNUAL" || f.Code == "SUBSCRIPTION" || f.Code == "ANNUAL_SUBSCRIPTION")
            .Select(f => f.FeeTypeId)
            .ToListAsync(cancellationToken);
        if (annualIds.Count == 0) return;

        var subs = await _db.Subscriptions
            .Where(s => s.AccountId == accountId)
            .ToListAsync(cancellationToken);
        if (subs.Count == 0) return;

        await AutoAllocateReceiptsToInvoicesAsync(accountId, cancellationToken);

        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Where(t => t.AccountId == accountId && annualIds.Contains(t.FeeTypeId) && t.Amount > 0)
            .ToListAsync(cancellationToken);

        var unpaid = await _db.MemberStatuses.FirstOrDefaultAsync(
            s => s.Code == "UNPAID" || s.Code == "ARREARS" || s.Code == "DUE",
            cancellationToken);
        var paidStatus = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "PAID", cancellationToken);

        foreach (var sub in subs)
        {
            sub.AmountPaid = 0m;
            sub.ArrearsAmount = sub.WaivedFlag ? 0m : Math.Max(0m, sub.AmountDue);
        }

        var recognized = new[] { "PAID", "WAIVED", "PARTIALLY_PAID", "SETTLED" };
        var annualPayments = txs
            .Where(t => recognized.Contains(t.PaymentStatus?.Code ?? "", StringComparer.OrdinalIgnoreCase))
            .OrderBy(t => t.PaymentDate)
            .ThenBy(t => t.TransactionId)
            .ToList();
        var invoicedYears = (await _db.MembershipInvoices.AsNoTracking()
            .Where(i => i.AccountId == accountId && i.PublishedToMember)
            .Select(i => i.Year)
            .ToListAsync(cancellationToken)).ToHashSet();
        var paymentIds = annualPayments.Select(t => t.TransactionId).ToList();
        var explicitAllocations = new List<(long TransactionId, int Year, decimal Amount)>();
        if (paymentIds.Count > 0)
        {
            var explicitRaw = await (
                from allocation in _db.TransactionAllocations.AsNoTracking()
                join invoice in _db.MembershipInvoices.AsNoTracking() on allocation.InvoiceId equals invoice.InvoiceId
                where paymentIds.Contains(allocation.TransactionId)
                select new { allocation.TransactionId, invoice.Year, allocation.Amount }
            ).ToListAsync(cancellationToken);
            explicitAllocations = explicitRaw.Select(x => (x.TransactionId, x.Year, x.Amount)).ToList();
        }

        foreach (var payment in annualPayments)
        {
            var reserved = explicitAllocations.Where(a => a.TransactionId == payment.TransactionId).Sum(a => a.Amount);
            var auto = Math.Max(0m, payment.Amount - reserved);
            var payYear = payment.PaymentDate?.Year ?? payment.CreatedAt.Year;
            foreach (var sub in subs.OrderBy(s => s.SubscriptionYear))
            {
                // Invoiced years are covered by MTransactionAllocation rows, not by this remainder.
                if (sub.WaivedFlag || sub.SubscriptionYear > payYear || auto <= 0.009m) continue;
                if (invoicedYears.Contains(sub.SubscriptionYear)) continue;
                var due = Math.Max(0m, sub.AmountDue);
                var room = Math.Max(0m, due - sub.AmountPaid);
                var take = Math.Min(room, auto);
                if (take <= 0) continue;
                sub.AmountPaid += take;
                auto -= take;
            }
        }

        foreach (var allocation in explicitAllocations)
        {
            var sub = subs.FirstOrDefault(s => s.SubscriptionYear == allocation.Year && !s.WaivedFlag);
            if (sub is null) continue;
            sub.AmountPaid += allocation.Amount;
        }

        await ApplyAdvanceAllocationsAsync(accountId, annualIds, subs, cancellationToken);

        var awaitingRefund = await _db.InvoiceCreditNotes.AsNoTracking()
            .Where(c => c.AccountId == accountId)
            .SumAsync(c => (decimal?)c.AwaitingRefundAmount, cancellationToken) ?? 0m;
        if (awaitingRefund > 0.01m)
        {
            var left = awaitingRefund;
            foreach (var sub in subs.OrderByDescending(s => s.SubscriptionYear))
            {
                var take = Math.Min(left, Math.Max(0m, sub.AmountPaid));
                sub.AmountPaid -= take;
                left -= take;
                if (left <= 0.01m) break;
            }
        }

        foreach (var sub in subs)
        {
            var due = sub.WaivedFlag ? 0m : Math.Max(0m, sub.AmountDue);
            sub.ArrearsAmount = Math.Max(0m, due - sub.AmountPaid);
        }
        foreach (var sub in subs)
        {
            if (sub.ArrearsAmount > 0.01m && unpaid is not null)
                sub.SubscriptionStatusId = unpaid.MemberStatusId;
            else if (sub.ArrearsAmount <= 0.01m && paidStatus is not null)
                sub.SubscriptionStatusId = paidStatus.MemberStatusId;
        }

        var arrearsRows = await _db.Arrearses
            .Where(a => a.AccountId == accountId)
            .ToListAsync(cancellationToken);
        foreach (var row in arrearsRows)
        {
            var sub = subs.FirstOrDefault(s => s.SubscriptionId == row.SubscriptionId);
            if (sub is null) continue;
            if (sub.ArrearsAmount > 0.01m && row.Status == "SETTLED")
            {
                row.Status = "OPEN";
                row.SettledDate = null;
                row.SettledByTransactionId = null;
            }
            else if (sub.ArrearsAmount <= 0.01m && row.Status == "OPEN")
            {
                row.Status = "SETTLED";
                row.SettledDate = DateOnly.FromDateTime(DateTime.UtcNow);
            }
        }

        var invoices = await _db.MembershipInvoices
            .Where(i => i.AccountId == accountId)
            .ToListAsync(cancellationToken);
        foreach (var invoice in invoices)
        {
            var sub = subs.FirstOrDefault(s => s.SubscriptionYear == invoice.Year);
            if (sub is null) continue;
            var remaining = sub.ArrearsAmount;
            invoice.Status = remaining <= 0.01m ? "PAID" : sub.AmountPaid > 0.01m ? "PARTIAL" : "ISSUED";
        }

        await _db.SaveChangesAsync(cancellationToken);
        await TryRestoreActiveMembershipAsync(accountId, null, cancellationToken);
    }

    /// <summary>
    /// Pins cleared annual and advance receipts to published invoices, oldest receipt and oldest
    /// invoice first. The receipt amount is never reduced. Money that does not fit an invoice
    /// stays unallocated and is available credit. An annual receipt cannot fund an invoice year
    /// after its payment year; an advance receipt can fund any open invoice.
    /// </summary>
    private async Task AutoAllocateReceiptsToInvoicesAsync(long accountId, CancellationToken cancellationToken)
    {
        var recognized = new[] { "PAID", "WAIVED", "PARTIALLY_PAID", "SETTLED", "REFUNDED" };
        var stale = await (
            from allocation in _db.TransactionAllocations
            join payment in _db.Transactions on allocation.TransactionId equals payment.TransactionId
            join status in _db.PaymentStatuses on payment.PaymentStatusId equals status.PaymentStatusId
            where payment.AccountId == accountId
                && (payment.Amount <= 0 || !recognized.Contains(status.Code))
            select allocation
        ).ToListAsync(cancellationToken);
        if (stale.Count > 0)
        {
            _db.TransactionAllocations.RemoveRange(stale);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var invoiceTo = await _db.Accounts.AsNoTracking()
            .Where(a => a.AccountId == accountId)
            .Select(a => a.InvoiceTo)
            .FirstOrDefaultAsync(cancellationToken);
        var corporateBilled = InvoiceDeliveryPlan.Normalize(invoiceTo) is "CORPORATE" or "BOTH";
        var payable = new[] { "PAID", "WAIVED", "PARTIALLY_PAID", "SETTLED" };
        var payments = await _db.Transactions
            .Include(t => t.PaymentStatus)
            .Include(t => t.FeeType)
            .Where(t => t.AccountId == accountId && t.Amount > 0)
            .OrderBy(t => t.PaymentDate)
            .ThenBy(t => t.TransactionId)
            .ToListAsync(cancellationToken);
        payments = payments
            .Where(t => payable.Contains(t.PaymentStatus?.Code ?? "", StringComparer.OrdinalIgnoreCase))
            .Where(t => IsAnnualFee(t.FeeType?.Code) || IsAdvanceFee(t.FeeType?.Code))
            .Where(t =>
            {
                var corporate = string.Equals(t.CreditOwner, "CORPORATE", StringComparison.OrdinalIgnoreCase);
                return corporate ? corporateBilled : !corporate;
            })
            .ToList();
        if (payments.Count == 0)
            return;

        var invoices = await _db.MembershipInvoices
            .Where(i => i.AccountId == accountId && i.PublishedToMember && i.Amount > 0)
            .OrderBy(i => i.Year)
            .ThenBy(i => i.InvoiceId)
            .ToListAsync(cancellationToken);
        if (invoices.Count == 0)
            return;

        var paymentIds = payments.Select(p => p.TransactionId).ToList();
        var invoiceIds = invoices.Select(i => i.InvoiceId).ToList();
        var existing = await _db.TransactionAllocations
            .Where(a => paymentIds.Contains(a.TransactionId) || invoiceIds.Contains(a.InvoiceId))
            .Select(a => new { a.TransactionId, a.InvoiceId, a.Amount })
            .ToListAsync(cancellationToken);
        var usedOnPayment = existing
            .Where(a => paymentIds.Contains(a.TransactionId))
            .GroupBy(a => a.TransactionId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
        var usedOnInvoice = existing
            .Where(a => invoiceIds.Contains(a.InvoiceId))
            .GroupBy(a => a.InvoiceId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));

        var pools = payments
            .Select(p =>
            {
                usedOnPayment.TryGetValue(p.TransactionId, out var used);
                var left = Math.Round(Math.Max(0m, p.Amount - used), 2, MidpointRounding.AwayFromZero);
                var advance = IsAdvanceFee(p.FeeType?.Code);
                var payYear = p.PaymentDate?.Year ?? p.CreatedAt.Year;
                return (Id: p.TransactionId, Left: left, Advance: advance, PayYear: payYear);
            })
            .Where(p => p.Left > 0.009m)
            .ToList();
        if (pools.Count == 0)
            return;

        var added = false;
        foreach (var invoice in invoices)
        {
            usedOnInvoice.TryGetValue(invoice.InvoiceId, out var already);
            var room = Math.Round(Math.Max(0m, invoice.Amount - already), 2, MidpointRounding.AwayFromZero);
            if (room <= 0.009m) continue;

            for (var i = 0; i < pools.Count && room > 0.009m; i++)
            {
                var pool = pools[i];
                if (pool.Left <= 0.009m) continue;
                if (!pool.Advance && invoice.Year > pool.PayYear) continue;
                var take = Math.Round(Math.Min(room, pool.Left), 2, MidpointRounding.AwayFromZero);
                if (take <= 0.009m) continue;
                _db.TransactionAllocations.Add(new MTransactionAllocation
                {
                    TransactionId = pool.Id,
                    InvoiceId = invoice.InvoiceId,
                    Amount = take,
                    AllocatedAt = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                });
                _db.AuditLogs.Add(new AuditLog
                {
                    TableName = "MTransactionAllocation",
                    RecordId = pool.Id,
                    Action = "INSERT",
                    NewValues = $"auto; transaction={pool.Id}; invoice={invoice.InvoiceId}; amount={take}",
                    ChangedAt = DateTime.UtcNow
                });
                pools[i] = (pool.Id, Math.Round(pool.Left - take, 2, MidpointRounding.AwayFromZero), pool.Advance, pool.PayYear);
                room = Math.Round(room - take, 2, MidpointRounding.AwayFromZero);
                added = true;
            }
        }

        if (added)
            await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task SettleAdvanceAgainstOpenInvoicesAsync(CancellationToken cancellationToken)
    {
        foreach (var accountId in await AccountsWithUnappliedAdvanceAsync(cancellationToken))
        {
            try
            {
                await ReconcileAccountDuesAsync(accountId, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not apply advance credit for account {AccountId}", accountId);
            }
        }
    }

    private async Task<List<long>> AccountsWithUnappliedAdvanceAsync(CancellationToken cancellationToken)
    {
        var recognized = new[] { "PAID", "WAIVED", "PARTIALLY_PAID", "SETTLED" };
        var payments = await _db.Transactions.AsNoTracking()
            .Where(t =>
                t.AccountId != null
                && t.Amount > 0
                && (t.FeeType.Code == "ADVANCE"
                    || t.FeeType.Code == "ANNUAL"
                    || t.FeeType.Code == "SUBSCRIPTION"
                    || t.FeeType.Code == "ANNUAL_SUBSCRIPTION")
                && recognized.Contains(t.PaymentStatus.Code))
            .Select(t => new { AccountId = t.AccountId!.Value, t.TransactionId, t.Amount })
            .ToListAsync(cancellationToken);
        if (payments.Count == 0) return [];

        var paymentIds = payments.Select(p => p.TransactionId).ToList();
        var used = await _db.TransactionAllocations.AsNoTracking()
            .Where(a => paymentIds.Contains(a.TransactionId))
            .GroupBy(a => a.TransactionId)
            .Select(g => new { TransactionId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);
        var usedById = used.ToDictionary(x => x.TransactionId, x => x.Amount);
        var accountIds = payments
            .Where(p =>
            {
                usedById.TryGetValue(p.TransactionId, out var allocated);
                return p.Amount - allocated > 0.009m;
            })
            .Select(p => p.AccountId)
            .Distinct()
            .ToList();
        if (accountIds.Count == 0) return [];

        var invoices = await _db.MembershipInvoices.AsNoTracking()
            .Where(i => accountIds.Contains(i.AccountId) && i.PublishedToMember && i.Amount > 0)
            .Select(i => new { i.InvoiceId, i.AccountId, i.Year, i.Amount })
            .ToListAsync(cancellationToken);
        if (invoices.Count == 0) return [];

        var invoiceIds = invoices.Select(i => i.InvoiceId).ToList();
        var invoiceUsed = await _db.TransactionAllocations.AsNoTracking()
            .Where(a => invoiceIds.Contains(a.InvoiceId))
            .GroupBy(a => a.InvoiceId)
            .Select(g => new { InvoiceId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);
        var invoiceUsedById = invoiceUsed.ToDictionary(x => x.InvoiceId, x => x.Amount);

        return invoices
            .Where(invoice =>
            {
                invoiceUsedById.TryGetValue(invoice.InvoiceId, out var allocated);
                return invoice.Amount - allocated > 0.009m;
            })
            .Select(invoice => invoice.AccountId)
            .Distinct()
            .ToList();
    }

    private async Task<Dictionary<long, decimal>> MemberAdvanceCreditAsync(
        IReadOnlyCollection<long> accountIds,
        CancellationToken cancellationToken)
    {
        if (accountIds.Count == 0) return [];
        var recognized = new[] { "PAID", "WAIVED", "PARTIALLY_PAID", "SETTLED" };
        var payments = await _db.Transactions.AsNoTracking()
            .Where(t =>
                t.AccountId != null
                && accountIds.Contains(t.AccountId.Value)
                && t.Amount > 0
                && (t.FeeType.Code == "ADVANCE"
                    || t.FeeType.Code == "ANNUAL"
                    || t.FeeType.Code == "SUBSCRIPTION"
                    || t.FeeType.Code == "ANNUAL_SUBSCRIPTION")
                && recognized.Contains(t.PaymentStatus.Code)
                && (t.CreditOwner == null || t.CreditOwner != "CORPORATE"))
            .Select(t => new
            {
                AccountId = t.AccountId!.Value,
                t.TransactionId,
                t.Amount,
                t.CreditOwner,
                FeeCode = t.FeeType.Code,
                t.PaymentDate,
            })
            .ToListAsync(cancellationToken);
        payments = payments
            .Where(t => !string.Equals(t.CreditOwner, "CORPORATE", StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (payments.Count == 0) return [];

        var ids = payments.Select(p => p.TransactionId).ToList();
        var used = await _db.TransactionAllocations.AsNoTracking()
            .Where(a => ids.Contains(a.TransactionId))
            .GroupBy(a => a.TransactionId)
            .Select(g => new { TransactionId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);
        var usedById = used.ToDictionary(x => x.TransactionId, x => x.Amount);
        var invoiced = await _db.MembershipInvoices.AsNoTracking()
            .Where(i => accountIds.Contains(i.AccountId) && i.PublishedToMember)
            .Select(i => new { i.AccountId, i.Year })
            .ToListAsync(cancellationToken);
        var invoicedYears = invoiced.Select(i => (i.AccountId, i.Year)).ToHashSet();
        var legacyPaidRows = await _db.Subscriptions.AsNoTracking()
            .Where(s => accountIds.Contains(s.AccountId) && !s.WaivedFlag)
            .Select(s => new { s.AccountId, s.SubscriptionYear, s.AmountPaid })
            .ToListAsync(cancellationToken);
        var legacyRoom = legacyPaidRows
            .Where(s => !invoicedYears.Contains((s.AccountId, s.SubscriptionYear)))
            .GroupBy(s => s.AccountId)
            .ToDictionary(g => g.Key, g => g.Sum(s => Math.Max(0m, s.AmountPaid)));

        var credit = new Dictionary<long, decimal>();
        foreach (var group in payments.GroupBy(p => p.AccountId))
        {
            legacyRoom.TryGetValue(group.Key, out var room);
            decimal available = 0m;
            foreach (var payment in group.OrderBy(p => p.PaymentDate).ThenBy(p => p.TransactionId))
            {
                usedById.TryGetValue(payment.TransactionId, out var allocated);
                var raw = Math.Max(0m, payment.Amount - allocated);
                if (IsAnnualFee(payment.FeeCode))
                {
                    var legacyTake = Math.Min(raw, Math.Max(0m, room));
                    room -= legacyTake;
                    available += raw - legacyTake;
                }
                else
                    available += raw;
            }
            credit[group.Key] = Math.Round(available, 2, MidpointRounding.AwayFromZero);
        }
        return credit;
    }

    internal static string AccountFinancialStatus(decimal outstanding, decimal availableCredit, decimal paid)
    {
        if (outstanding > 0.009m)
            return paid > 0.009m ? "PARTIALLY_PAID" : "UNPAID";
        return availableCredit > 0.009m ? "ADVANCE_CREDIT" : "PAID";
    }

    private async Task ApplyAdvanceAllocationsAsync(
        long accountId,
        IReadOnlyCollection<long> annualFeeTypeIds,
        IReadOnlyList<Subscription> subs,
        CancellationToken cancellationToken)
    {
        var recognized = new[] { "PAID", "WAIVED", "PARTIALLY_PAID", "SETTLED" };
        var appliedByYear = await (
            from allocation in _db.TransactionAllocations.AsNoTracking()
            join payment in _db.Transactions.AsNoTracking() on allocation.TransactionId equals payment.TransactionId
            join invoice in _db.MembershipInvoices.AsNoTracking() on allocation.InvoiceId equals invoice.InvoiceId
            where payment.AccountId == accountId
                && payment.Amount > 0
                && !annualFeeTypeIds.Contains(payment.FeeTypeId)
                && recognized.Contains(payment.PaymentStatus.Code)
            group allocation by invoice.Year
            into yearGroup
            select new { Year = yearGroup.Key, Amount = yearGroup.Sum(x => x.Amount) }
        ).ToListAsync(cancellationToken);

        foreach (var bucket in appliedByYear)
        {
            var sub = subs.FirstOrDefault(s => s.SubscriptionYear == bucket.Year);
            if (sub is null || sub.WaivedFlag) continue;
            var due = Math.Max(0m, sub.AmountDue);
            var room = Math.Max(0m, due - sub.AmountPaid);
            var take = Math.Min(bucket.Amount, room);
            if (take <= 0.009m) continue;
            sub.AmountPaid += take;
            sub.ArrearsAmount = Math.Max(0m, due - sub.AmountPaid);
        }
    }

    private async Task HealReversedLedgersAsync(CancellationToken cancellationToken)
    {
        var accountIds = await _db.Transactions.AsNoTracking()
            .Where(t =>
                t.AccountId != null
                && t.Amount > 0
                && (t.PaymentStatus.Code == "REVERSED" || t.PaymentStatus.Code == "REFUNDED"))
            .Select(t => t.AccountId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);
        foreach (var accountId in accountIds)
        {
            try
            {
                await ReconcileAccountDuesAsync(accountId, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not rebuild dues after reversal/refund for account {AccountId}", accountId);
            }
        }
    }

    public async Task<StatementDocumentDto> GetMemberStatementAsync(
        long accountId,
        DateOnly from,
        DateOnly to,
        CancellationToken cancellationToken)
    {
        if (to < from)
            throw new InvalidOperationException("Statement end date must be on or after the start date.");

        await ReconcileAccountDuesAsync(accountId, cancellationToken);

        var account = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CorporateCompany)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Member account was not found.");

        var companyLiable = InvoiceDeliveryPlan.Normalize(account.InvoiceTo) == "CORPORATE"
            && account.CorporateCompanyId != null;
        var payerName = account.CorporateCompany?.Name?.Trim();
        if (string.IsNullOrWhiteSpace(payerName)) payerName = "the corporate company";

        var opening = await SignedInvoiceBalanceAsOfAsync(
            accountId, account.ApplicationId, account.ProfileId, from.AddDays(-1), cancellationToken, companyLiable);
        var closing = await SignedInvoiceBalanceAsOfAsync(
            accountId, account.ApplicationId, account.ProfileId, to, cancellationToken, companyLiable);

        var lines = await BuildMemberLedgerStatementLinesAsync(
            accountId,
            account.ApplicationId,
            account.ProfileId,
            from,
            to,
            cancellationToken,
            companyLiable ? payerName : null);

        var memberName = $"{account.Profile?.FirstName} {account.Profile?.LastName}".Trim();
        if (string.IsNullOrWhiteSpace(memberName))
            memberName = account.MembershipNo ?? "Member";
        var club = await ClubHeaderAsync(cancellationToken);
        var credit = await MemberAdvanceCreditAsync([accountId], cancellationToken);
        credit.TryGetValue(accountId, out var availableCredit);
        var outstanding = await InvoicedSubscriptionOutstandingAsync(accountId, cancellationToken);
        return new StatementDocumentDto(
            accountId,
            memberName,
            account.MembershipNo,
            account.MembershipType?.Name,
            from,
            to,
            opening,
            closing,
            string.IsNullOrWhiteSpace(club.ClubName) ? "Aero Club of East Africa" : club.ClubName,
            lines,
            account.ApplicationId,
            "MEMBER",
            account.Profile?.Email,
            outstanding,
            availableCredit);
    }

    private async Task<decimal> InvoicedSubscriptionOutstandingAsync(long accountId, CancellationToken cancellationToken)
    {
        var years = await _db.MembershipInvoices.AsNoTracking()
            .Where(i => i.AccountId == accountId && i.PublishedToMember)
            .Select(i => i.Year)
            .Distinct()
            .ToListAsync(cancellationToken);
        if (years.Count == 0) return 0m;
        var rows = await _db.Subscriptions.AsNoTracking()
            .Where(s => s.AccountId == accountId && years.Contains(s.SubscriptionYear) && !s.WaivedFlag)
            .Select(s => new { s.AmountDue, s.AmountPaid })
            .ToListAsync(cancellationToken);
        return Math.Round(rows.Sum(s => Math.Max(0m, s.AmountDue - s.AmountPaid)), 2, MidpointRounding.AwayFromZero);
    }

    public async Task<StatementDocumentDto> GetCorporateStatementAsync(
        long companyId,
        DateOnly from,
        DateOnly to,
        CancellationToken cancellationToken)
    {
        if (to < from)
            throw new InvalidOperationException("Statement end date must be on or after the start date.");

        var company = await _db.CorporateCompanies.AsNoTracking()
            .FirstOrDefaultAsync(c => c.CorporateCompanyId == companyId, cancellationToken)
            ?? throw new InvalidOperationException("Corporate company was not found.");

        var accounts = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Where(a => !a.IsDeleted && a.CorporateCompanyId == companyId)
            .ToListAsync(cancellationToken);
        accounts = accounts
            .Where(a => InvoiceDeliveryPlan.Normalize(a.InvoiceTo) is "CORPORATE" or "BOTH")
            .ToList();

        decimal opening = 0;
        decimal closing = 0;
        var lines = new List<StatementLineDto>();
        foreach (var account in accounts)
        {
            var memberName = $"{account.Profile?.FirstName} {account.Profile?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(memberName))
                memberName = account.MembershipNo ?? "Member";
            opening += await SponsoredBalanceAsOfAsync(account, from.AddDays(-1), cancellationToken);
            closing += await SponsoredBalanceAsOfAsync(account, to, cancellationToken);
            lines.AddRange(await BuildSponsoredStatementLinesAsync(account, memberName, from, to, cancellationToken));
        }

        var club = await ClubHeaderAsync(cancellationToken);
        return new StatementDocumentDto(
            0,
            company.Name,
            company.Code,
            "Corporate account",
            from,
            to,
            opening,
            closing,
            string.IsNullOrWhiteSpace(club.ClubName) ? "Aero Club of East Africa" : club.ClubName,
            lines
                .OrderBy(l => l.Date)
                .ThenBy(l => StatementLineSort(l.Kind))
                .ThenBy(l => l.Receipt)
                .ToList(),
            null,
            "CORPORATE",
            company.Email);
    }

    private async Task<decimal> SponsoredBalanceAsOfAsync(
        Entities.MembershipAccount.MAccount account,
        DateOnly asOfInclusive,
        CancellationToken cancellationToken)
    {
        var charged = (await ListPublishedInvoiceEntriesAsync(account.AccountId, account.ApplicationId, cancellationToken))
            .Where(e => e.IssuedOn <= asOfInclusive && e.Amount > 0 && IsSponsoredSubscriptionFee(e.FeeType))
            .Sum(e => e.Amount);
        var paid = await SumSponsoredPaymentsAsOfAsync(account.AccountId, account.ProfileId, asOfInclusive, cancellationToken);
        return charged - paid;
    }

    private async Task<List<StatementLineDto>> BuildSponsoredStatementLinesAsync(
        Entities.MembershipAccount.MAccount account,
        string memberName,
        DateOnly from,
        DateOnly to,
        CancellationToken cancellationToken)
    {
        var lines = new List<StatementLineDto>();
        var who = string.IsNullOrWhiteSpace(account.MembershipNo)
            ? memberName
            : $"{memberName} ({account.MembershipNo})";
        foreach (var entry in (await ListPublishedInvoiceEntriesAsync(account.AccountId, account.ApplicationId, cancellationToken))
            .Where(e => e.IssuedOn >= from && e.IssuedOn <= to && e.Amount > 0.01m && IsSponsoredSubscriptionFee(e.FeeType)))
        {
            lines.Add(CreateStatementLine(
                entry.IssuedOn,
                $"{FeeTypeStatementLabel(entry.FeeType)} – {who}",
                null,
                entry.DocumentNo,
                "Invoiced",
                entry.Amount,
                StatementLineKind.Invoice));
        }

        if (account.AccountId <= 0 && account.ProfileId <= 0) return lines;
        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Include(t => t.FeeType)
            .Include(t => t.Receipt)
            .Where(t =>
                t.PaymentDate != null
                && t.PaymentDate >= from
                && t.PaymentDate <= to
                && (t.AccountId == account.AccountId || t.ProfileId == account.ProfileId))
            .ToListAsync(cancellationToken);
        foreach (var t in txs.Where(t => IsSponsoredSubscriptionFee(t.FeeType?.Code)))
        {
            var postedOn = t.PaymentDate ?? DateOnly.FromDateTime(t.CreatedAt);
            if (IsMoneyInTransaction(t.PaymentStatus?.Code, t.Amount))
            {
                lines.Add(CreateStatementLine(
                    postedOn,
                    $"Payment – {who}",
                    t.PaymentMethod?.Name,
                    t.Receipt?.ReceiptNumber,
                    t.PaymentStatus?.Name,
                    t.Amount,
                    StatementLineKind.Payment,
                    t.TransactionId));
            }
            else if (IsMoneyOutTransaction(t.PaymentStatus?.Code, t.Amount))
            {
                lines.Add(CreateStatementLine(
                    postedOn,
                    $"Refund – {who}",
                    t.PaymentMethod?.Name,
                    t.Receipt?.ReceiptNumber,
                    t.PaymentStatus?.Name,
                    t.Amount,
                    StatementLineKind.Refund,
                    t.TransactionId));
            }
        }
        return lines;
    }

    private sealed record InvoiceStatementEntry(DateOnly IssuedOn, string FeeType, string DocumentNo, decimal Amount);

    private static string FeeTypeStatementLabel(string feeType) => feeType switch
    {
        "JOINING" => "Joining",
        "ANNUAL" => "Annual subscription",
        "ACCOMMODATION" => "Accommodation",
        "CORKAGE" => "Corkage",
        "CUSTOM" or "OTHER" => "Custom charges",
        _ => string.IsNullOrWhiteSpace(feeType) ? "Invoice" : feeType.Replace('_', ' ')
    };

    private static DateOnly BillingIssuedOn(BillingDocument doc)
    {
        var when = doc.PublishedAt ?? doc.ReviewedAt ?? doc.SubmittedAt;
        return DateOnly.FromDateTime(when == default ? doc.CreatedAt : when);
    }

    private async Task<List<InvoiceStatementEntry>> ListPublishedInvoiceEntriesAsync(
        long? accountId,
        long? applicationId,
        CancellationToken cancellationToken)
    {
        var docs = await _db.BillingDocuments.AsNoTracking()
            .Where(d =>
                d.Kind == "INVOICE"
                && (d.Status == "APPROVED" || d.Status == "PUBLISHED")
                && (
                    (accountId != null && d.AccountId == accountId)
                    || (applicationId != null && d.ApplicationId == applicationId)))
            .ToListAsync(cancellationToken);

        var linkedInvoiceIds = docs
            .Where(d => d.MembershipInvoiceId != null)
            .Select(d => d.MembershipInvoiceId!.Value)
            .ToHashSet();

        var entries = docs
            .Select(d => new InvoiceStatementEntry(BillingIssuedOn(d), d.FeeType, d.DocumentNo, d.Amount))
            .ToList();

        if (accountId is long aid)
        {
            var membershipInvoices = await _db.MembershipInvoices.AsNoTracking()
                .Where(i => i.AccountId == aid && i.PublishedToMember && !linkedInvoiceIds.Contains(i.InvoiceId))
                .ToListAsync(cancellationToken);
            entries.AddRange(membershipInvoices.Select(i =>
                new InvoiceStatementEntry(
                    DateOnly.FromDateTime(i.IssuedAt == default ? i.CreatedAt : i.IssuedAt),
                    "ANNUAL",
                    i.InvoiceNo,
                    i.Amount)));
        }

        return entries;
    }

    private async Task<decimal> SumRecognizedPaymentsAsOfAsync(
        long? accountId,
        long? profileId,
        DateOnly asOfInclusive,
        CancellationToken cancellationToken,
        bool omitSponsoredFees = false)
    {
        if (accountId is null && profileId is null) return 0;
        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Include(t => t.FeeType)
            .Where(t =>
                t.Amount > 0
                && t.PaymentDate != null
                && t.PaymentDate <= asOfInclusive
                && (
                    (accountId != null && t.AccountId == accountId)
                    || (profileId != null && t.ProfileId == profileId)))
            .ToListAsync(cancellationToken);
        return txs
            .Where(t => RecognizesPayment(t.PaymentStatus?.Code))
            .Where(t => !(omitSponsoredFees && IsSponsoredSubscriptionFee(t.FeeType?.Code)))
            .Sum(t => t.Amount);
    }

    private async Task<decimal> SumSponsoredPaymentsAsOfAsync(
        long? accountId,
        long? profileId,
        DateOnly asOfInclusive,
        CancellationToken cancellationToken)
    {
        if (accountId is null && profileId is null) return 0;
        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Include(t => t.FeeType)
            .Where(t =>
                t.Amount > 0
                && t.PaymentDate != null
                && t.PaymentDate <= asOfInclusive
                && (
                    (accountId != null && t.AccountId == accountId)
                    || (profileId != null && t.ProfileId == profileId)))
            .ToListAsync(cancellationToken);
        return txs
            .Where(t => RecognizesPayment(t.PaymentStatus?.Code) && IsSponsoredSubscriptionFee(t.FeeType?.Code))
            .Sum(t => t.Amount);
    }

    private async Task<decimal> InvoiceRegisterBalanceAsOfAsync(
        long? accountId,
        long? applicationId,
        long? profileId,
        DateOnly asOfInclusive,
        CancellationToken cancellationToken)
    {
        var charged = (await ListPublishedInvoiceEntriesAsync(accountId, applicationId, cancellationToken))
            .Where(e => e.IssuedOn <= asOfInclusive && e.Amount > 0)
            .Sum(e => e.Amount);
        var paid = await SumRecognizedPaymentsAsOfAsync(accountId, profileId, asOfInclusive, cancellationToken);
        return Math.Max(0, charged - paid);
    }

    /// <summary>
    /// Statement balance uses issued invoices only. A subscription amount is not a charge until an invoice is issued.
    /// </summary>
    private async Task<decimal> SignedInvoiceBalanceAsOfAsync(
        long? accountId,
        long? applicationId,
        long? profileId,
        DateOnly asOfInclusive,
        CancellationToken cancellationToken,
        bool omitSponsoredFees = false)
    {
        var charged = (await ListPublishedInvoiceEntriesAsync(accountId, applicationId, cancellationToken))
            .Where(e => e.IssuedOn <= asOfInclusive && e.Amount > 0)
            .Where(e => !(omitSponsoredFees && IsSponsoredSubscriptionFee(e.FeeType)))
            .Sum(e => e.Amount);
        var paid = await SumRecognizedPaymentsAsOfAsync(
            accountId, profileId, asOfInclusive, cancellationToken, omitSponsoredFees);
        return charged - paid;
    }

    private async Task<List<StatementLineDto>> BuildMemberLedgerStatementLinesAsync(
        long accountId,
        long? applicationId,
        long? profileId,
        DateOnly from,
        DateOnly to,
        CancellationToken cancellationToken,
        string? corporatePayer = null)
    {
        var lines = new List<StatementLineDto>();
        var invoices = (await ListPublishedInvoiceEntriesAsync(accountId, applicationId, cancellationToken))
            .Where(e => e.IssuedOn >= from && e.IssuedOn <= to && e.Amount > 0.01m)
            .ToList();

        foreach (var entry in invoices)
        {
            if (corporatePayer != null && IsSponsoredSubscriptionFee(entry.FeeType))
            {
                lines.Add(CreateStatementLine(
                    entry.IssuedOn,
                    $"{FeeTypeStatementLabel(entry.FeeType)} – Corporate billed",
                    null,
                    entry.DocumentNo,
                    "Corporate billed",
                    0,
                    StatementLineKind.Invoice,
                    informational: true));
                continue;
            }
            lines.Add(CreateStatementLine(
                entry.IssuedOn,
                $"{FeeTypeStatementLabel(entry.FeeType)} invoice {entry.DocumentNo}",
                null,
                entry.DocumentNo,
                "Invoiced",
                entry.Amount,
                StatementLineKind.Invoice));
        }

        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Include(t => t.PaymentMethod)
            .Include(t => t.FeeType)
            .Include(t => t.Receipt)
            .Where(t =>
                t.PaymentDate != null
                && t.PaymentDate >= from
                && t.PaymentDate <= to
                && (
                    t.AccountId == accountId
                    || (profileId != null && t.ProfileId == profileId)))
            .OrderBy(t => t.PaymentDate)
            .ThenBy(t => t.TransactionId)
            .ToListAsync(cancellationToken);

        foreach (var t in txs)
        {
            var statusCode = t.PaymentStatus?.Code;
            var postedOn = t.PaymentDate ?? DateOnly.FromDateTime(t.CreatedAt);
            if (corporatePayer != null && IsSponsoredSubscriptionFee(t.FeeType?.Code)
                && (IsMoneyInTransaction(statusCode, t.Amount) || IsMoneyOutTransaction(statusCode, t.Amount)))
            {
                lines.Add(CreateStatementLine(
                    postedOn,
                    $"Paid by {corporatePayer}",
                    null,
                    t.Receipt?.ReceiptNumber,
                    "Corporate billed",
                    0,
                    StatementLineKind.Payment,
                    informational: true));
                continue;
            }
            if (IsMoneyInTransaction(statusCode, t.Amount))
            {
                lines.Add(CreateStatementLine(
                    postedOn,
                    t.FeeType?.Name,
                    t.PaymentMethod?.Name,
                    t.Receipt?.ReceiptNumber,
                    t.PaymentStatus?.Name,
                    t.Amount,
                    StatementLineKind.Payment,
                    t.TransactionId));
            }
            else if (IsMoneyOutTransaction(statusCode, t.Amount))
            {
                var outLabel = NormalizeStatus(statusCode) == "REVERSED" ? "Reversal" : "Refund";
                var feeName = string.IsNullOrWhiteSpace(t.FeeType?.Name) ? outLabel : $"{outLabel} — {t.FeeType.Name}";
                lines.Add(CreateStatementLine(
                    postedOn,
                    feeName,
                    t.PaymentMethod?.Name,
                    t.Receipt?.ReceiptNumber,
                    t.PaymentStatus?.Name,
                    t.Amount,
                    StatementLineKind.Refund,
                    t.TransactionId));
            }
        }

        return lines
            .OrderBy(l => l.Date)
            .ThenBy(l => StatementLineSort(l.Kind))
            .ThenBy(l => l.TransactionId ?? 0)
            .ToList();
    }

    private async Task<List<StatementLineDto>> BuildInvoiceStatementLinesAsync(
        long? accountId,
        long? applicationId,
        long? profileId,
        DateOnly from,
        DateOnly to,
        CancellationToken cancellationToken)
    {
        var lines = new List<StatementLineDto>();
        foreach (var entry in (await ListPublishedInvoiceEntriesAsync(accountId, applicationId, cancellationToken))
            .Where(e => e.IssuedOn >= from && e.IssuedOn <= to && e.Amount > 0.01m)
            .OrderBy(e => e.IssuedOn)
            .ThenBy(e => e.DocumentNo, StringComparer.OrdinalIgnoreCase))
        {
            lines.Add(CreateStatementLine(
                entry.IssuedOn,
                $"{FeeTypeStatementLabel(entry.FeeType)} invoice {entry.DocumentNo}",
                null,
                entry.DocumentNo,
                "Invoiced",
                entry.Amount,
                StatementLineKind.Invoice));
        }

        if (accountId is null && profileId is null) return lines;

        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Include(t => t.PaymentMethod)
            .Include(t => t.FeeType)
            .Include(t => t.Receipt)
            .Where(t =>
                t.PaymentDate != null
                && t.PaymentDate >= from
                && t.PaymentDate <= to
                && (
                    (accountId != null && t.AccountId == accountId)
                    || (profileId != null && t.ProfileId == profileId)))
            .OrderBy(t => t.PaymentDate)
            .ThenBy(t => t.TransactionId)
            .ToListAsync(cancellationToken);

        foreach (var t in txs)
        {
            var statusCode = t.PaymentStatus?.Code;
            var postedOn = t.PaymentDate ?? DateOnly.FromDateTime(t.CreatedAt);
            if (IsMoneyInTransaction(statusCode, t.Amount))
            {
                lines.Add(CreateStatementLine(
                    postedOn,
                    t.FeeType?.Name,
                    t.PaymentMethod?.Name,
                    t.Receipt?.ReceiptNumber,
                    t.PaymentStatus?.Name,
                    t.Amount,
                    StatementLineKind.Payment,
                    t.TransactionId));
            }
            else if (IsMoneyOutTransaction(statusCode, t.Amount))
            {
                var outLabel = NormalizeStatus(statusCode) == "REVERSED" ? "Reversal" : "Refund";
                var feeName = string.IsNullOrWhiteSpace(t.FeeType?.Name) ? outLabel : $"{outLabel} — {t.FeeType.Name}";
                lines.Add(CreateStatementLine(
                    postedOn,
                    feeName,
                    t.PaymentMethod?.Name,
                    t.Receipt?.ReceiptNumber,
                    t.PaymentStatus?.Name,
                    t.Amount,
                    StatementLineKind.Refund,
                    t.TransactionId));
            }
        }

        return lines
            .OrderBy(l => l.Date)
            .ThenBy(l => StatementLineSort(l.Kind))
            .ThenBy(l => l.TransactionId ?? 0)
            .ToList();
    }
    private async Task<decimal> MembershipBalanceAsOfAsync(
        long accountId,
        DateOnly asOfInclusive,
        CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);
        if (account is null) return 0;

        var joiningDue = account.EntranceFeeWaivedFlag ? 0m : (account.EntranceFeeAmount ?? 0m);
        var joined = account.JoinedDate ?? account.StartDate;
        if (joined is DateOnly jd && jd > asOfInclusive)
            joiningDue = 0;

        var joiningFeeIds = await _db.FeeTypes.AsNoTracking()
            .Where(f => f.Code == "JOINING" || f.Code == "ENTRANCE")
            .Select(f => f.FeeTypeId)
            .ToListAsync(cancellationToken);
        var joiningFeeSet = joiningFeeIds.ToHashSet();

        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Where(t => t.AccountId == accountId && t.PaymentDate != null)
            .ToListAsync(cancellationToken);

        decimal NetCash(IEnumerable<MTransaction> rows)
        {
            decimal net = 0;
            foreach (var t in rows)
            {
                if (IsMoneyInTransaction(t.PaymentStatus?.Code, t.Amount))
                    net += t.Amount;
                else if (IsMoneyOutTransaction(t.PaymentStatus?.Code, t.Amount))
                    net -= Math.Abs(t.Amount);
            }
            return net;
        }

        var joiningPaid = joiningDue > 0
            ? NetCash(txs.Where(t =>
                joiningFeeSet.Contains(t.FeeTypeId)
                && t.PaymentDate <= asOfInclusive))
            : 0m;
        var joiningOut = Math.Max(0, joiningDue - joiningPaid);

        var allSubs = await _db.Subscriptions.AsNoTracking()
            .Where(s => s.AccountId == accountId)
            .Select(s => new { s.SubscriptionYear, s.WaivedFlag, s.AmountDue, s.AmountPaid })
            .ToListAsync(cancellationToken);
        var charged = allSubs
            .Where(s => new DateOnly(s.SubscriptionYear, 1, 1) <= asOfInclusive)
            .ToList();
        if (charged.Count == 0)
            return joiningOut;

        var charges = charged.Sum(s => s.WaivedFlag ? 0m : Math.Max(0m, s.AmountDue));
        var datedPaid = NetCash(txs.Where(t =>
            !joiningFeeSet.Contains(t.FeeTypeId)
            && t.PaymentDate <= asOfInclusive));

        var storedPaid = allSubs.Sum(s => s.WaivedFlag ? 0m : Math.Max(0m, s.AmountPaid));
        var allTimePaid = NetCash(txs.Where(t => !joiningFeeSet.Contains(t.FeeTypeId)));
        var undated = Math.Max(0m, storedPaid - allTimePaid);
        if (undated > 0.01m)
        {
            var residualYear = allSubs
                .Where(s => s.AmountPaid > 0.01m)
                .Select(s => (int?)s.SubscriptionYear)
                .DefaultIfEmpty()
                .Max();
            if (residualYear is int year && new DateOnly(year, 12, 31) <= asOfInclusive)
                datedPaid += undated;
        }
        return joiningOut + charges - datedPaid;
    }
    private static List<StatementLineDto> SplitPaymentSurplus(decimal opening, List<StatementLineDto> lines)
    {
        var running = opening;
        var result = new List<StatementLineDto>(lines.Count);
        foreach (var line in lines)
        {
            var amount = Math.Abs(line.Amount);
            if (line.Kind == StatementLineKind.Payment && amount > 0.009m)
            {
                var applied = Math.Min(amount, Math.Max(0m, running));
                var surplus = Math.Round(amount - applied, 2, MidpointRounding.AwayFromZero);
                applied = Math.Round(applied, 2, MidpointRounding.AwayFromZero);
                var receipt = string.IsNullOrWhiteSpace(line.Receipt) ? null : line.Receipt.Trim();
                if (applied > 0.009m)
                {
                    var appliedFee = string.IsNullOrWhiteSpace(receipt)
                        ? line.Fee
                        : $"Receipt {receipt}";
                    result.Add(line with { Fee = appliedFee, Amount = applied });
                    running -= applied;
                }
                if (surplus > 0.009m)
                {
                    var creditFee = string.IsNullOrWhiteSpace(receipt)
                        ? "Advance payment / credit"
                        : $"Advance payment / credit · {receipt}";
                    result.Add(line with { Fee = creditFee, Amount = surplus });
                    running -= surplus;
                }
                continue;
            }

            if (line.Kind == StatementLineKind.Invoice || line.Kind == StatementLineKind.Refund)
                running += amount;
            result.Add(line);
        }
        return result;
    }

    public async Task<StatementDocumentDto> GetApplicantStatementAsync(
        long applicationId,
        DateOnly from,
        DateOnly to,
        CancellationToken cancellationToken)
    {
        if (to < from)
            throw new InvalidOperationException("Statement end date must be on or after the start date.");

        var app = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.ElectionType)
            .Include(a => a.Status)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");

        var profileId = app.ApplicantProfileId;
        var opening = await InvoiceRegisterBalanceAsOfAsync(
            null, applicationId, profileId, from.AddDays(-1), cancellationToken);
        var closing = await InvoiceRegisterBalanceAsOfAsync(
            null, applicationId, profileId, to, cancellationToken);
        var lines = await BuildInvoiceStatementLinesAsync(
            null, applicationId, profileId, from, to, cancellationToken);

        var memberName = $"{app.Applicant?.FirstName} {app.Applicant?.LastName}".Trim();
        if (string.IsNullOrWhiteSpace(memberName))
            memberName = app.ApplicationNo;
        var club = await ClubHeaderAsync(cancellationToken);
        return new StatementDocumentDto(
            0,
            memberName,
            app.ApplicationNo,
            app.ElectionType?.Name,
            from,
            to,
            opening,
            closing,
            string.IsNullOrWhiteSpace(club.ClubName) ? "Aero Club of East Africa" : club.ClubName,
            lines,
            app.ApplicationId,
            "APPLICANT",
            app.Applicant?.Email);
    }

    public async Task<PagedResult<StatementPartyRowDto>> ListStatementPartiesAsync(
        string? search,
        string? audience,
        string? membershipType,
        int? year,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var y = year ?? DateTime.UtcNow.Year;
        var kind = (audience ?? "MEMBER").Trim().ToUpperInvariant();
        var rows = kind switch
        {
            "ACCOMMODATION" => await ChargeStatementPartiesAsync("ACCOMMODATION", search, y, cancellationToken),
            "CORKAGE" => await ChargeStatementPartiesAsync("CORKAGE", search, y, cancellationToken),
            "CUSTOM" => await ChargeStatementPartiesAsync("CUSTOM", search, y, cancellationToken),
            _ => await MemberStatementPartiesAsync(search, membershipType, y, cancellationToken)
        };

        var ordered = rows
            .OrderBy(r => r.PartyName)
            .ThenBy(r => r.DisplayNo)
            .ToList();
        return Paging.FromList(ordered, paging);
    }

    public async Task<StatementEmailResultDto> EmailStatementsAsync(
        StatementEmailRequest request,
        CancellationToken cancellationToken)
    {
        var items = request.Items ?? [];
        if (items.Count == 0)
            throw new InvalidOperationException("Select at least one statement to email.");

        var sent = 0;
        var skipped = 0;
        foreach (var item in items)
        {
            var email = (item.Email ?? "").Trim();
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(item.Html))
            {
                skipped++;
                continue;
            }
            var name = string.IsNullOrWhiteSpace(item.PartyName) ? "account" : item.PartyName.Trim();
            var ok = await _email.SendHtmlAsync(
                email,
                $"Aero Club statement of account · {name}",
                item.Html,
                cancellationToken);
            if (ok) sent++;
            else skipped++;
        }
        return new StatementEmailResultDto(sent, skipped);
    }

    public async Task<int> DeletePartyStatementsAsync(
        long? accountId,
        long? applicationId,
        CancellationToken cancellationToken)
    {
        if (accountId is not > 0 && applicationId is not > 0)
            throw new InvalidOperationException("Choose a member or applicant first.");

        var query = _db.BillingDocuments.Where(d => d.Kind == "STATEMENT");
        if (accountId is > 0)
            query = query.Where(d => d.AccountId == accountId);
        else
            query = query.Where(d => d.ApplicationId == applicationId);

        var docs = await query.ToListAsync(cancellationToken);
        if (docs.Count == 0)
            throw new InvalidOperationException("No issued statement to delete for this person. The member or applicant record is not removed.");

        _db.BillingDocuments.RemoveRange(docs);
        await _db.SaveChangesAsync(cancellationToken);
        return docs.Count;
    }

    private async Task<List<StatementPartyRowDto>> ChargeStatementPartiesAsync(
        string feeType,
        string? search,
        int year,
        CancellationToken cancellationToken)
    {
        var totals = new Dictionary<long, (decimal Paid, decimal Balance, string Name, string No, string? Email, string? Type)>();

        async Task Touch(long? accountId, decimal amount, decimal paid, string fallbackName)
        {
            if (accountId is not long id || id <= 0) return;
            totals.TryGetValue(id, out var current);
            totals[id] = (current.Paid + paid, current.Balance + Math.Max(0, amount - paid), current.Name, current.No, current.Email, current.Type);
            if (string.IsNullOrWhiteSpace(totals[id].Name))
            {
                var row = totals[id];
                totals[id] = (row.Paid, row.Balance, fallbackName, row.No, row.Email, row.Type);
            }
        }

        var docs = await _db.BillingDocuments.AsNoTracking()
            .Where(d => d.Kind == "INVOICE" && d.FeeType == feeType && d.AccountId != null
                && (d.Year == null || d.Year == year)
                && (d.Status == "PENDING_GM" || d.Status == "APPROVED" || d.Status == "PUBLISHED"))
            .ToListAsync(cancellationToken);
        foreach (var doc in docs)
            await Touch(doc.AccountId, doc.Amount, doc.AmountPaid, doc.PartyName);
        var invoicedAccounts = docs.Where(d => d.AccountId is long).Select(d => d.AccountId!.Value).ToHashSet();

        var yearStart = new DateOnly(year, 1, 1);
        var yearEnd = new DateOnly(year, 12, 31);
        var createdFrom = new DateTime(year, 1, 1);
        var createdTo = new DateTime(year + 1, 1, 1);
        if (feeType == "ACCOMMODATION")
        {
            var bookings = await _db.NmAccommodationBookings.AsNoTracking()
                .Where(b => b.CheckInDate <= yearEnd && b.CheckOutDate >= yearStart)
                .ToListAsync(cancellationToken);
            foreach (var booking in bookings)
            {
                if (booking.AccountId is long booked && invoicedAccounts.Contains(booked)) continue;
                var paid = booking.IsPaidInAdvance ? booking.TotalAmount : 0m;
                await Touch(booking.AccountId, booking.TotalAmount, paid, booking.GuestName);
            }
        }
        else if (feeType == "CORKAGE")
        {
            var charges = await _db.NmCorkageCharges.AsNoTracking()
                .Where(c => c.CreatedAt >= createdFrom && c.CreatedAt < createdTo)
                .ToListAsync(cancellationToken);
            foreach (var charge in charges)
            {
                if (charge.AccountId is long charged && invoicedAccounts.Contains(charged)) continue;
                var paid = charge.PaidAt is null ? 0m : charge.FeeAmount;
                await Touch(charge.AccountId, charge.FeeAmount, paid, charge.PayerName);
            }
        }
        else if (feeType == "CUSTOM")
        {
            var charges = await _db.NmCustomCharges.AsNoTracking()
                .Where(c => c.CreatedAt >= createdFrom && c.CreatedAt < createdTo)
                .ToListAsync(cancellationToken);
            foreach (var charge in charges)
            {
                if (charge.AccountId is long charged && invoicedAccounts.Contains(charged)) continue;
                var paid = charge.PaidAt is null ? 0m : charge.TotalAmount;
                await Touch(charge.AccountId, charge.TotalAmount, paid, charge.PayerName);
            }
        }

        if (totals.Count == 0) return [];
        var ids = totals.Keys.ToList();
        var accounts = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Where(a => ids.Contains(a.AccountId) && !a.IsDeleted)
            .ToListAsync(cancellationToken);

        var rows = new List<StatementPartyRowDto>();
        foreach (var account in accounts)
        {
            if (!totals.TryGetValue(account.AccountId, out var money)) continue;
            var name = $"{account.Profile?.FirstName} {account.Profile?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name)) name = money.Name;
            if (string.IsNullOrWhiteSpace(name)) name = account.MembershipNo ?? "Member";
            if (!string.IsNullOrWhiteSpace(search))
            {
                var hay = $"{name} {account.MembershipNo} {account.Profile?.Email}";
                if (hay.IndexOf(search.Trim(), StringComparison.OrdinalIgnoreCase) < 0) continue;
            }
            rows.Add(new StatementPartyRowDto(
                $"{feeType}-{account.AccountId}",
                feeType,
                account.AccountId,
                account.ApplicationId,
                account.ProfileId,
                account.MembershipNo ?? "",
                name,
                account.MembershipType?.Name,
                account.Profile?.Email,
                money.Paid,
                money.Balance));
        }
        return rows;
    }

    private async Task<List<StatementPartyRowDto>> MemberStatementPartiesAsync(
        string? search,
        string? membershipType,
        int year,
        CancellationToken cancellationToken)
    {
        var accounts = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Where(a => !a.IsDeleted)
            .ToListAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(membershipType))
        {
            var mt = membershipType.Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
            accounts = accounts.Where(a =>
            {
                var code = (a.MembershipType?.Code ?? "").ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
                var name = (a.MembershipType?.Name ?? "").ToUpperInvariant();
                return code == mt || name.Contains(membershipType.Trim().ToUpperInvariant());
            }).ToList();
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            accounts = accounts.Where(a =>
            {
                var name = $"{a.Profile?.FirstName} {a.Profile?.LastName}";
                return (a.MembershipNo ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)
                    || name.Contains(term, StringComparison.OrdinalIgnoreCase)
                    || (a.Profile?.Email ?? "").Contains(term, StringComparison.OrdinalIgnoreCase);
            }).ToList();
        }

        var ids = accounts.Select(a => a.AccountId).ToList();
        var allSubs = ids.Count == 0
            ? []
            : await _db.Subscriptions.AsNoTracking()
                .Where(s => ids.Contains(s.AccountId) && s.SubscriptionYear <= year && !s.WaivedFlag)
                .Select(s => new { s.AccountId, s.SubscriptionYear, s.AmountDue, s.AmountPaid })
                .ToListAsync(cancellationToken);
        var unpaidByAccount = allSubs
            .GroupBy(s => s.AccountId)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(s => Math.Max(0, s.AmountDue - s.AmountPaid)));
        var yearPaidByAccount = allSubs
            .Where(s => s.SubscriptionYear == year)
            .GroupBy(s => s.AccountId)
            .ToDictionary(g => g.Key, g => g.Sum(s => Math.Max(0, s.AmountPaid)));
        var yearStart = new DateOnly(year, 1, 1);
        var yearEnd = new DateOnly(year, 12, 31);
        var paidByAccount = ids.Count == 0
            ? new Dictionary<long, decimal>()
            : (await _db.Transactions.AsNoTracking()
                .Include(t => t.PaymentStatus)
                .Where(t => t.AccountId != null && ids.Contains(t.AccountId.Value)
                    && t.PaymentDate != null && t.PaymentDate >= yearStart && t.PaymentDate <= yearEnd
                    && t.Amount > 0)
                .ToListAsync(cancellationToken))
                .Where(t => RecognizesPayment(t.PaymentStatus?.Code))
                .GroupBy(t => t.AccountId!.Value)
                .ToDictionary(g => g.Key, g => g.Sum(t => t.Amount));

        return accounts.Select(a =>
        {
            unpaidByAccount.TryGetValue(a.AccountId, out var unpaid);
            paidByAccount.TryGetValue(a.AccountId, out var paid);
            yearPaidByAccount.TryGetValue(a.AccountId, out var yearPaid);
            paid = Math.Max(paid, yearPaid);
            var name = $"{a.Profile?.FirstName} {a.Profile?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name)) name = a.MembershipNo ?? "Member";
            return new StatementPartyRowDto(
                $"MEMBER-{a.AccountId}",
                "MEMBER",
                a.AccountId,
                a.ApplicationId,
                a.ProfileId,
                a.MembershipNo ?? "",
                name,
                a.MembershipType?.Name,
                a.Profile?.Email,
                paid,
                unpaid);
        }).ToList();
    }

    private async Task<List<StatementPartyRowDto>> ApplicantStatementPartiesAsync(
        string? search,
        string? membershipType,
        CancellationToken cancellationToken)
    {
        var closed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "REJECTED", "WITHDRAWN", "CANCELLED", "DRAFT", "ELECTED"
        };
        var memberProfileIds = (await _db.Accounts.AsNoTracking()
            .Where(a => !a.IsDeleted)
            .Select(a => a.ProfileId)
            .ToListAsync(cancellationToken)).ToHashSet();

        var apps = (await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .Include(a => a.ElectionType)
            .ToListAsync(cancellationToken))
            .Where(a => a.Status is null || !closed.Contains((a.Status.Code ?? "").Trim()))
            .Where(a => !memberProfileIds.Contains(a.ApplicantProfileId))
            .ToList();

        if (!string.IsNullOrWhiteSpace(membershipType))
        {
            var mt = membershipType.Trim().ToUpperInvariant();
            apps = apps.Where(a =>
                (a.ElectionType?.Code ?? "").ToUpperInvariant().Replace("-", "_").Replace(" ", "_")
                    == mt.Replace("-", "_").Replace(" ", "_")
                || (a.ElectionType?.Name ?? "").ToUpperInvariant().Contains(mt)).ToList();
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            apps = apps.Where(a =>
            {
                var name = $"{a.Applicant?.FirstName} {a.Applicant?.LastName}";
                return (a.ApplicationNo ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)
                    || name.Contains(term, StringComparison.OrdinalIgnoreCase)
                    || (a.Applicant?.Email ?? "").Contains(term, StringComparison.OrdinalIgnoreCase);
            }).ToList();
        }

        var profileIds = apps.Select(a => a.ApplicantProfileId).Distinct().ToList();
        var joiningFee = await _db.FeeTypes.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Code == "JOINING" || f.Code == "ENTRANCE", cancellationToken);
        var paidByProfile = profileIds.Count == 0 || joiningFee is null
            ? new Dictionary<long, decimal>()
            : (await _db.Transactions.AsNoTracking()
                .Include(t => t.PaymentStatus)
                .Where(t => t.ProfileId != null && profileIds.Contains(t.ProfileId.Value)
                    && t.FeeTypeId == joiningFee.FeeTypeId && t.Amount > 0)
                .ToListAsync(cancellationToken))
                .Where(t => RecognizesPayment(t.PaymentStatus?.Code))
                .GroupBy(t => t.ProfileId!.Value)
                .ToDictionary(g => g.Key, g => g.Sum(t => t.Amount));

        return apps.Select(a =>
        {
            paidByProfile.TryGetValue(a.ApplicantProfileId, out var paid);
            var due = a.EntranceFeeAmount ?? 0;
            var name = $"{a.Applicant?.FirstName} {a.Applicant?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name)) name = a.ApplicationNo;
            return new StatementPartyRowDto(
                $"APPLICANT-{a.ApplicationId}",
                "APPLICANT",
                null,
                a.ApplicationId,
                a.ApplicantProfileId,
                a.ApplicationNo,
                name,
                a.ElectionType?.Name,
                a.Applicant?.Email,
                paid,
                Math.Max(0, due - paid));
        }).ToList();
    }

    internal IQueryable<Subscription> InvoiceArrearsQuery(int year, string? membershipType, string? search)
    {
        var query = _db.Subscriptions.AsNoTracking()
            .Where(s =>
                s.SubscriptionYear == year
                && (s.ArrearsAmount > 0
                    || s.AmountPaid < s.AmountDue
                    || _db.Subscriptions.Any(p =>
                        p.AccountId == s.AccountId
                        && p.SubscriptionYear < year
                        && !p.WaivedFlag
                        && (p.ArrearsAmount > 0 || p.AmountPaid < p.AmountDue))));

        if (!string.IsNullOrWhiteSpace(membershipType))
        {
            var mtRaw = membershipType.Trim();
            var mt = NormalizeMembershipKey(mtRaw);
            query = query.Where(s =>
                s.Account.MembershipType.Code.ToUpper().Replace("-", "_").Replace(" ", "_") == mt
                || s.Account.MembershipType.Name.ToUpper().Contains(mtRaw.ToUpper())
                || s.Account.MembershipType.Code.ToUpper().Contains(mt));
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(s =>
                (s.Account.MembershipNo != null && s.Account.MembershipNo.ToLower().Contains(term))
                || (s.Account.Profile.FirstName + " " + s.Account.Profile.LastName).ToLower().Contains(term)
                || (s.Account.Profile.Email != null && s.Account.Profile.Email.ToLower().Contains(term)));
        }

        return query;
    }

    private IQueryable<long> DeliveredInvoiceAccountIds(int year)
    {
        var fromInvoice = _db.MembershipInvoices.AsNoTracking()
            .Where(i => i.Year == year && (i.SentAt != null || i.PublishedToMember))
            .Select(i => i.AccountId);
        var fromBilling = _db.BillingDocuments.AsNoTracking()
            .Where(d =>
                d.Year == year
                && d.Kind == "INVOICE"
                && d.FeeType == "ANNUAL"
                && d.AccountId != null
                && (d.Status == "PENDING_GM" || d.Status == "APPROVED" || d.Status == "PUBLISHED"))
            .Select(d => d.AccountId!.Value);
        return fromInvoice.Union(fromBilling);
    }

    /// <summary>
    /// Accounts that have a cleared, refunded, or reversed annual receipt.
    /// Used so a leftover balance after partial pay or refund returns to the invoice queue.
    /// </summary>
    private IQueryable<long> AnnualPaymentActivityAccountIds()
    {
        return _db.Transactions.AsNoTracking()
            .Where(t =>
                t.AccountId != null
                && t.FeeType != null
                && (t.FeeType.Code == "ANNUAL"
                    || t.FeeType.Code == "SUBSCRIPTION"
                    || t.FeeType.Code == "ANNUAL_SUBSCRIPTION")
                && (
                    t.PaymentStatus.Code == "PAID"
                    || t.PaymentStatus.Code == "WAIVED"
                    || t.PaymentStatus.Code == "PARTIALLY_PAID"
                    || t.PaymentStatus.Code == "SETTLED"
                    || t.PaymentStatus.Code == "REFUNDED"
                    || t.PaymentStatus.Code == "REVERSED"))
            .Select(t => t.AccountId!.Value);
    }

    private async Task<InvoiceDocumentDto> MapInvoiceAsync(
        MembershipInvoice invoice,
        ClubManagement.Entities.MembershipAccount.MAccount account,
        ClubManagement.Entities.Subscriptions.Subscription? sub,
        CancellationToken cancellationToken)
    {
        var yearCharges = sub is null
            ? invoice.Amount
            : sub.WaivedFlag ? 0m : sub.AmountDue;
        var allocated = await _db.TransactionAllocations.AsNoTracking()
            .Where(a => a.InvoiceId == invoice.InvoiceId)
            .SumAsync(a => (decimal?)a.Amount, cancellationToken) ?? 0m;
        var legacyPaid = Math.Max(0m, sub?.AmountPaid ?? 0m);
        var displayPaid = Math.Min(yearCharges, Math.Max(allocated, legacyPaid));
        var displayBalance = Math.Max(0m, yearCharges - displayPaid);
        var category = account.MembershipType?.Name;
        var lines = new List<InvoiceLineDto>
        {
            new(
                string.IsNullOrWhiteSpace(category) ? "Annual subscription" : $"{category} Membership",
                invoice.Year.ToString(),
                yearCharges,
                displayPaid,
                displayBalance)
        };
        var displayDue = yearCharges;
        var memberName = $"{account.Profile?.FirstName} {account.Profile?.LastName}".Trim();
        if (string.IsNullOrWhiteSpace(memberName))
            memberName = account.MembershipNo ?? "Member";
        var club = await ClubHeaderAsync(cancellationToken);
        return new InvoiceDocumentDto(
            invoice.InvoiceId,
            invoice.InvoiceNo,
            invoice.AccountId,
            invoice.Year,
            memberName,
            account.MembershipNo,
            account.MembershipType?.Name,
            displayDue,
            displayPaid,
            displayBalance,
            InvoiceDueDate(invoice.Year),
            invoice.IssuedAt,
            invoice.Status,
            invoice.SentAt is not null,
            invoice.SentToEmail,
            string.IsNullOrWhiteSpace(club.ClubName) ? "Aero Club of East Africa" : club.ClubName,
            string.IsNullOrWhiteSpace(club.Address)
                ? "P.O. Box 40813 - 00100, Nairobi, Kenya. Wilson Airport, Langata Road"
                : club.Address,
            string.IsNullOrWhiteSpace(club.Email) ? "info@aeroclubea.com" : club.Email,
            string.IsNullOrWhiteSpace(club.Phone) ? "+254 111 053 220" : club.Phone,
            await ClubSettingValueAsync("MPESA_PAYBILL", "4103461", cancellationToken),
            await ClubSettingValueAsync("BANK_NAME", "I & M Bank Ltd", cancellationToken),
            await ClubSettingValueAsync("BANK_ACCOUNT", "01100399661210", cancellationToken),
            lines);
    }

    private string WithEmailPayNow(string invoiceHtml)
    {
        if (string.IsNullOrWhiteSpace(invoiceHtml)) return invoiceHtml;
        if (invoiceHtml.Contains("data-acea-pay-now", StringComparison.OrdinalIgnoreCase))
            return invoiceHtml;

        var portal = (_app.PublicBaseUrl ?? "http://localhost:8080").TrimEnd('/');
        var payUrl = $"{portal}/?next=/payment";
        var sheet = InvoiceSheetFromHtml(invoiceHtml);
        return $@"<!DOCTYPE html>
<html>
<head>
  <meta charset=""utf-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1"" />
  <title>Aero Club invoice</title>
</head>
<body style=""margin:0;padding:24px 16px;background:#f4f4f5;font-family:'Segoe UI',Tahoma,sans-serif;color:#1f2554;"">
  <table data-acea-pay-now=""1"" role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""max-width:760px;margin:0 auto 20px;"">
    <tr>
      <td style=""background:#ffffff;border:1px solid #e4d7bf;border-radius:10px;padding:20px 18px;text-align:center;"">
        <p style=""margin:0 0 12px;font-size:15px;font-weight:700;color:#1f2554;"">Your Aero Club invoice is below.</p>
        <a href=""{payUrl}"" style=""display:inline-block;background:#1f2554;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.04em;padding:12px 28px;border-radius:8px;"">Pay now</a>
        <p style=""margin:12px 0 0;font-size:12px;color:#5b6472;line-height:1.5;"">Sign in to confirm you are a member, then complete payment on your Payment page.</p>
      </td>
    </tr>
  </table>
  {sheet}
</body>
</html>";
    }

    private static string InvoiceSheetFromHtml(string invoiceHtml)
    {
        var bodyOpen = invoiceHtml.IndexOf("<body", StringComparison.OrdinalIgnoreCase);
        if (bodyOpen < 0) return invoiceHtml;
        var gt = invoiceHtml.IndexOf('>', bodyOpen);
        var bodyClose = invoiceHtml.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (gt < 0 || bodyClose <= gt) return invoiceHtml;
        return invoiceHtml.Substring(gt + 1, bodyClose - gt - 1).Trim();
    }

    private async Task TryEmailInvoiceAsync(
        MembershipInvoice invoice,
        InvoiceDocumentDto dto,
        InvoiceDeliveryPlan delivery,
        string? invoiceHtml,
        CancellationToken cancellationToken)
    {
        if (delivery.Emails.Count == 0)
        {
            _logger.LogWarning(
                "Skipped email for {InvoiceNo}: no {Target} billing address is on file.",
                invoice.InvoiceNo,
                delivery.Target);
            return;
        }
        if (string.IsNullOrWhiteSpace(invoiceHtml))
        {
            _logger.LogWarning(
                "Skipped email for {InvoiceNo}: invoice HTML must come from the frontend document.",
                invoice.InvoiceNo);
            return;
        }
        var sentTo = new List<string>();
        foreach (var email in delivery.Emails)
        {
            try
            {
                var sent = await _email.SendHtmlAsync(
                    email,
                    $"Aero Club invoice {dto.InvoiceNo} - {dto.Year} subscription",
                    WithEmailPayNow(invoiceHtml),
                    cancellationToken);
                if (sent) sentTo.Add(email);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Invoice email failed for {InvoiceNo} to {Email}", invoice.InvoiceNo, email);
            }
        }
        if (sentTo.Count == 0) return;
        invoice.SentAt = DateTime.UtcNow;
        invoice.SentToEmail = string.Join("; ", sentTo);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<InvoiceDeliveryPlan> ResolveInvoiceDeliveryAsync(long accountId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.CorporateCompany)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);
        return InvoiceDeliveryPlan.For(account);
    }

    private async Task<(string ClubName, string? Address, string? Email, string? Phone)> ClubHeaderAsync(
        CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .OrderByDescending(t => t.IsActive)
            .FirstOrDefaultAsync(cancellationToken);
        return (
            tenant?.Name ?? "Aero Club of East Africa",
            tenant?.AddressLine,
            tenant?.ContactEmail,
            tenant?.ContactPhone);
    }

    private static DateOnly InvoiceDueDate(int year)
    {
        return new DateOnly(year, 2, 28);
    }

    private const string InvoiceSetupKey = "INVOICE_SETUP";
    private static readonly JsonSerializerOptions InvoiceSetupJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public async Task<PaymentSetupDto> GetInvoiceSetupAsync(CancellationToken cancellationToken)
    {
        var stored = await ClubSettingValueAsync(InvoiceSetupKey, "", cancellationToken);
        return ParsePaymentSetup(stored);
    }

    public async Task<PaymentSetupDto> SaveInvoiceSetupAsync(
        PaymentSetupDto setup,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var normalized = NormalizePaymentSetup(setup);
        var json = JsonSerializer.Serialize(normalized, InvoiceSetupJson);
        await UpsertClubSettingAsync(InvoiceSetupKey, json, "Payment setup for invoices and receipts.", actorUserId, cancellationToken);
        var bankName = MethodField(normalized, "bank", "bank-name");
        var kesAccount = MethodField(normalized, "bank", "bank-kes");
        var paybill = MethodField(normalized, "mpesa", "mpesa-paybill");
        if (!string.IsNullOrWhiteSpace(bankName))
            await UpsertClubSettingAsync("BANK_NAME", bankName, "Invoice bank name.", actorUserId, cancellationToken);
        if (!string.IsNullOrWhiteSpace(kesAccount))
            await UpsertClubSettingAsync("BANK_ACCOUNT", kesAccount, "Invoice KES account.", actorUserId, cancellationToken);
        if (!string.IsNullOrWhiteSpace(paybill))
            await UpsertClubSettingAsync("MPESA_PAYBILL", paybill, "Invoice M-Pesa paybill.", actorUserId, cancellationToken);
        return normalized;
    }

    private static PaymentSetupDto ParsePaymentSetup(string? json)
    {
        var defaults = CreateDefaultPaymentSetup();
        if (string.IsNullOrWhiteSpace(json)) return defaults;
        try
        {
            if (LooksLikeLegacyInvoiceSetup(json))
            {
                var legacy = JsonSerializer.Deserialize<InvoiceSetupDto>(json, InvoiceSetupJson);
                return legacy is null ? defaults : FromLegacyInvoiceSetup(legacy);
            }
            var parsed = JsonSerializer.Deserialize<PaymentSetupDto>(json, InvoiceSetupJson);
            return parsed is null ? defaults : NormalizePaymentSetup(parsed);
        }
        catch (JsonException)
        {
            return defaults;
        }
    }

    private static bool LooksLikeLegacyInvoiceSetup(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Object) return true;
        return !doc.RootElement.TryGetProperty("methods", out var methods) || methods.ValueKind != JsonValueKind.Array;
    }

    private static PaymentSetupDto FromLegacyInvoiceSetup(InvoiceSetupDto old)
    {
        var setup = CreateDefaultPaymentSetup();
        setup.Pin = string.IsNullOrWhiteSpace(old.Pin) ? setup.Pin : old.Pin.Trim();
        setup.Website = string.IsNullOrWhiteSpace(old.Website) ? setup.Website : old.Website.Trim();
        setup.PayableNote = string.IsNullOrWhiteSpace(old.PayableNote) ? setup.PayableNote : old.PayableNote.Trim();
        setup.ExtraNote = old.ExtraNote?.Trim() ?? "";
        setup.Invoice = new InvoiceDisplayDto
        {
            ShowPin = old.ShowPin,
            ShowDueDate = old.ShowDueDate,
            ShowCredits = old.ShowCredits
        };
        SetMethodVisible(setup, "bank", old.ShowBankDetails, onInvoice: true);
        SetMethodVisible(setup, "mpesa", old.ShowMpesaDetails, onInvoice: true);
        SetField(setup, "bank", "bank-name", old.BankName);
        SetField(setup, "bank", "bank-branch", old.BankBranch);
        SetField(setup, "bank", "bank-account-name", old.AccountName);
        SetField(setup, "bank", "bank-kes", old.KesAccount);
        SetField(setup, "bank", "bank-usd", old.UsdAccount);
        SetField(setup, "bank", "bank-code", old.BankCode);
        SetField(setup, "bank", "bank-branch-code", old.BranchCode);
        SetField(setup, "bank", "bank-swift", old.Swift);
        SetField(setup, "mpesa", "mpesa-paybill", old.MpesaPaybill);
        SetField(setup, "mpesa", "mpesa-account", old.MpesaAccountHint);
        return setup;
    }

    private static PaymentSetupDto NormalizePaymentSetup(PaymentSetupDto setup)
    {
        var defaults = CreateDefaultPaymentSetup();
        setup.Pin = string.IsNullOrWhiteSpace(setup.Pin) ? defaults.Pin : setup.Pin.Trim();
        setup.Website = string.IsNullOrWhiteSpace(setup.Website) ? defaults.Website : setup.Website.Trim();
        setup.PayableNote = string.IsNullOrWhiteSpace(setup.PayableNote) ? defaults.PayableNote : setup.PayableNote.Trim();
        setup.ExtraNote = setup.ExtraNote?.Trim() ?? "";
        setup.Invoice ??= new InvoiceDisplayDto();
        setup.Receipt ??= new ReceiptDisplayDto();
        setup.Methods ??= new List<PaymentMethodBlockDto>();
        setup.ExtraParameters ??= new List<ExtraParameterDto>();
        setup.ProrationMode = string.Equals(setup.ProrationMode, "MONTHLY", StringComparison.OrdinalIgnoreCase)
            ? "MONTHLY"
            : "DAILY";
        foreach (var method in setup.Methods)
        {
            method.Id = string.IsNullOrWhiteSpace(method.Id) ? Guid.NewGuid().ToString("N") : method.Id.Trim();
            method.Code = string.IsNullOrWhiteSpace(method.Code) ? "CUSTOM" : method.Code.Trim();
            method.Title = string.IsNullOrWhiteSpace(method.Title) ? "Payment method" : method.Title.Trim();
            method.Fields ??= new List<PaymentFieldDto>();
            foreach (var field in method.Fields)
            {
                field.Id = string.IsNullOrWhiteSpace(field.Id) ? Guid.NewGuid().ToString("N") : field.Id.Trim();
                field.Label = field.Label?.Trim() ?? "";
                field.Value = field.Value?.Trim() ?? "";
            }
        }
        foreach (var parameter in setup.ExtraParameters)
        {
            parameter.Id = string.IsNullOrWhiteSpace(parameter.Id) ? Guid.NewGuid().ToString("N") : parameter.Id.Trim();
            parameter.Label = parameter.Label?.Trim() ?? "";
            parameter.Value = parameter.Value?.Trim() ?? "";
        }
        return setup;
    }

    private static PaymentSetupDto CreateDefaultPaymentSetup() => new()
    {
        Pin = "P000591170O",
        Website = "www.aeroclubea.com",
        PayableNote = "All payments should be made payable to Aero Club of East Africa.",
        ExtraNote = "",
        Invoice = new InvoiceDisplayDto(),
        Receipt = new ReceiptDisplayDto(),
        Methods = new List<PaymentMethodBlockDto>
        {
            new()
            {
                Id = "bank",
                Code = "BANK_TRANSFER",
                Title = "Bank transfer",
                Enabled = true,
                ShowOnInvoice = true,
                Fields = new List<PaymentFieldDto>
                {
                    F("bank-note", "Remittance note", "Bank remittance charges must be paid by the sender"),
                    F("bank-name", "Bank name", "I & M Bank Ltd"),
                    F("bank-branch", "Branch", "Wilson Airport Branch"),
                    F("bank-account-name", "Account name", "Aero Club of East Africa"),
                    F("bank-kes", "KES account", "01100399661210"),
                    F("bank-usd", "USD account", "01100399661211"),
                    F("bank-code", "Bank code", "57"),
                    F("bank-branch-code", "Branch code", "011"),
                    F("bank-swift", "SWIFT", "IMBLKENA"),
                }
            },
            new()
            {
                Id = "mpesa",
                Code = "MPESA",
                Title = "M-Pesa",
                Enabled = true,
                ShowOnInvoice = true,
                Fields = new List<PaymentFieldDto>
                {
                    F("mpesa-paybill", "Paybill no.", "4103461"),
                    F("mpesa-account", "Account name", "Your Name / Membership No."),
                }
            },
            new()
            {
                Id = "cash",
                Code = "CASH",
                Title = "Cash",
                Enabled = true,
                Fields = new List<PaymentFieldDto> { F("cash-note", "Instructions", "Pay at the finance desk, Wilson Airport.") }
            },
            new()
            {
                Id = "cheque",
                Code = "CHEQUE",
                Title = "Cheque",
                Enabled = true,
                Fields = new List<PaymentFieldDto> { F("cheque-payable", "Payable to", "Aero Club of East Africa") }
            },
            new()
            {
                Id = "card",
                Code = "CARD",
                Title = "Card",
                Enabled = true,
                Fields = new List<PaymentFieldDto> { F("card-note", "Instructions", "Visa / Mastercard at the finance desk.") }
            }
        },
        ExtraParameters = new List<ExtraParameterDto>()
    };

    private static PaymentFieldDto F(string id, string label, string value) => new()
    {
        Id = id,
        Label = label,
        Value = value
    };

    private static string MethodField(PaymentSetupDto setup, string methodId, string fieldId) =>
        setup.Methods
            .FirstOrDefault(method => method.Id == methodId || string.Equals(method.Code, methodId, StringComparison.OrdinalIgnoreCase))
            ?.Fields.FirstOrDefault(field => field.Id == fieldId)
            ?.Value?.Trim() ?? "";

    private static void SetMethodVisible(PaymentSetupDto setup, string methodId, bool visible, bool onInvoice)
    {
        var method = setup.Methods.FirstOrDefault(item => item.Id == methodId);
        if (method is null) return;
        if (onInvoice) method.ShowOnInvoice = visible;
        else method.ShowOnReceipt = visible;
    }

    private static void SetField(PaymentSetupDto setup, string methodId, string fieldId, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        var field = setup.Methods.FirstOrDefault(item => item.Id == methodId)?.Fields.FirstOrDefault(item => item.Id == fieldId);
        if (field is not null) field.Value = value.Trim();
    }

    private async Task UpsertClubSettingAsync(
        string key,
        string value,
        string description,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var existing = await _db.ClubSettings
            .Where(s => s.SettingKey == key)
            .OrderByDescending(s => s.ClubSettingId)
            .FirstOrDefaultAsync(cancellationToken);
        if (existing is null)
        {
            _db.ClubSettings.Add(new ClubSetting
            {
                SettingKey = key,
                SettingValue = value,
                Description = description,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            });
        }
        else
        {
            existing.SettingValue = value;
            existing.Description = description;
            existing.IsActive = true;
            existing.UpdatedByUserId = actorUserId;
        }
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<string> ClubSettingValueAsync(string key, string fallback, CancellationToken cancellationToken)
    {
        var value = await _db.ClubSettings.AsNoTracking()
            .Where(s => s.IsActive && s.SettingKey == key)
            .Select(s => s.SettingValue)
            .FirstOrDefaultAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    public async Task<PagedResult<IssuedInvoiceRowDto>> ListIssuedInvoicesAsync(
        SubscriptionListFilter filter,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        await SettleAdvanceAgainstOpenInvoicesAsync(cancellationToken);
        var query = IssuedInvoiceQuery(filter).OrderByDescending(i => i.IssuedAt).ThenByDescending(i => i.InvoiceId);
        var page = await query.ToPagedResultAsync(paging, cancellationToken);
        var invoiceIds = page.Items.Select(i => i.InvoiceId).ToList();
        var credits = await CreditTotalsAsync(invoiceIds, cancellationToken);
        var allocatedByInvoice = await AllocationTotalsAsync(invoiceIds, cancellationToken);
        var accountIds = page.Items.Select(i => i.AccountId).Distinct().ToList();
        var years = page.Items.Select(i => i.Year).Distinct().ToList();
        var paidRows = accountIds.Count == 0
            ? []
            : await _db.Subscriptions.AsNoTracking()
                .Where(s => accountIds.Contains(s.AccountId) && years.Contains(s.SubscriptionYear))
                .Select(s => new { s.AccountId, s.SubscriptionYear, s.AmountPaid })
                .ToListAsync(cancellationToken);
        var paidByYear = paidRows.ToDictionary(s => (s.AccountId, s.SubscriptionYear), s => s.AmountPaid);
        var rows = page.Items.Select(invoice =>
        {
            var credited = credits.GetValueOrDefault(invoice.InvoiceId);
            allocatedByInvoice.TryGetValue(invoice.InvoiceId, out var allocated);
            paidByYear.TryGetValue((invoice.AccountId, invoice.Year), out var paid);
            var applied = Math.Max(allocated, Math.Min(invoice.Amount, Math.Max(0m, paid)));
            return new IssuedInvoiceRowDto(
                invoice.InvoiceId,
                invoice.InvoiceNo,
                invoice.AccountId,
                MemberName(invoice.Account),
                invoice.Account.MembershipNo,
                invoice.Account.MembershipType?.Name,
                invoice.Year,
                invoice.DueDate,
                invoice.Amount,
                credited,
                Math.Max(0, invoice.Amount - credited - applied),
                invoice.Status,
                invoice.IssuedAt);
        }).ToList();
        return Paging.Create(rows, paging, page.TotalCount);
    }

    public async Task<PagedResult<InvoiceCreditNoteRowDto>> ListInvoiceCreditNotesAsync(
        SubscriptionListFilter filter,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var year = filter.Year;
        var search = filter.Search?.Trim();
        var type = filter.MembershipType?.Trim();
        var query = _db.InvoiceCreditNotes.AsNoTracking()
            .Include(c => c.Invoice)
                .ThenInclude(i => i.Account)
                    .ThenInclude(a => a.Profile)
            .Include(c => c.Invoice)
                .ThenInclude(i => i.Account)
                    .ThenInclude(a => a.MembershipType)
            .AsQueryable();
        if (year is int y) query = query.Where(c => c.Invoice.Year == y);
        if (!string.IsNullOrWhiteSpace(type))
            query = query.Where(c => c.Invoice.Account.MembershipType.Code == type || c.Invoice.Account.MembershipType.Name == type);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(c =>
                c.CreditNoteNo.ToLower().Contains(s)
                || c.Invoice.InvoiceNo.ToLower().Contains(s)
                || (c.Invoice.Account.MembershipNo != null && c.Invoice.Account.MembershipNo.ToLower().Contains(s))
                || ((c.Invoice.Account.Profile.FirstName + " " + c.Invoice.Account.Profile.LastName).ToLower().Contains(s)));
        }
        var page = await query.OrderByDescending(c => c.IssuedAt).ThenByDescending(c => c.CreditNoteId)
            .ToPagedResultAsync(paging, cancellationToken);
        return Paging.Create(page.Items.Select(MapCreditNote).ToList(), paging, page.TotalCount);
    }

    public Task<IssuedInvoiceDetailDto> GetIssuedInvoiceAsync(long invoiceId, CancellationToken cancellationToken) =>
        LoadIssuedInvoiceDetailAsync(invoiceId, cancellationToken);

    public async Task<IssuedInvoiceDetailDto> UpdateIssuedInvoiceAsync(
        long invoiceId,
        UpdateIssuedInvoiceRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        if (request.Amount < 0)
            throw new InvalidOperationException("Invoice amount cannot be negative.");
        var invoice = await TrackedInvoiceAsync(invoiceId, cancellationToken);
        var credited = await CreditedAmountAsync(invoice.InvoiceId, cancellationToken);
        if (request.Amount + 0.009m < credited)
            throw new InvalidOperationException("Invoice amount cannot be less than the credit notes already issued.");
        var delta = request.Amount - invoice.Amount;
        invoice.Amount = decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero);
        invoice.DueDate = request.DueDate;
        if (invoice.Subscription is not null)
        {
            invoice.Subscription.AmountDue = Math.Max(0, invoice.Subscription.AmountDue + delta);
            invoice.Subscription.DueDate = request.DueDate;
            invoice.Subscription.UpdatedByUserId = actorUserId;
        }
        await _db.SaveChangesAsync(cancellationToken);
        await ReconcileAccountDuesAsync(invoice.AccountId, cancellationToken);
        await ApplyCreditStatusAsync(invoice, cancellationToken);
        return await LoadIssuedInvoiceDetailAsync(invoiceId, cancellationToken);
    }

    public async Task<IssuedInvoiceDetailDto> IssueInvoiceCreditNoteAsync(
        long invoiceId,
        IssueInvoiceCreditNoteRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new InvalidOperationException("A reason is required to issue a credit note.");
        if (request.Amount <= 0)
            throw new InvalidOperationException("Credit note amount must be greater than zero.");
        var invoice = await TrackedInvoiceAsync(invoiceId, cancellationToken);
        var credited = await CreditedAmountAsync(invoice.InvoiceId, cancellationToken);
        var remaining = Math.Max(0, invoice.Amount - credited);
        var amount = decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero);
        if (amount > remaining + 0.009m)
            throw new InvalidOperationException($"Credit note cannot exceed the open invoice balance of {remaining:0.00}.");

        var paidOnYear = Math.Max(0, invoice.Subscription?.AmountPaid ?? 0);
        var awaitingRefund = Math.Min(amount, paidOnYear);
        var note = new InvoiceCreditNote
        {
            CreditNoteNo = $"TMP-{Guid.NewGuid():N}",
            InvoiceId = invoice.InvoiceId,
            AccountId = invoice.AccountId,
            Amount = amount,
            AwaitingRefundAmount = decimal.Round(awaitingRefund, 2, MidpointRounding.AwayFromZero),
            Reason = request.Reason.Trim(),
            Status = "ISSUED",
            IssuedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.InvoiceCreditNotes.Add(note);
        if (invoice.Subscription is not null)
        {
            invoice.Subscription.AmountDue = Math.Max(0, invoice.Subscription.AmountDue - amount);
            invoice.Subscription.UpdatedByUserId = actorUserId;
        }
        await _db.SaveChangesAsync(cancellationToken);
        note.CreditNoteNo = $"CN-{invoice.Year}-{note.CreditNoteId:D6}";
        await _db.SaveChangesAsync(cancellationToken);
        await ReconcileAccountDuesAsync(invoice.AccountId, cancellationToken);
        await ApplyCreditStatusAsync(invoice, cancellationToken);
        var creditedNow = await CreditedAmountAsync(invoice.InvoiceId, cancellationToken);
        if (creditedNow >= invoice.Amount - 0.01m)
            await ApplyInvoiceReversalEffectsAsync(invoice, note, paidOnYear <= 0.01m, actorUserId, cancellationToken);
        return await LoadIssuedInvoiceDetailAsync(invoiceId, cancellationToken);
    }
    private async Task ApplyInvoiceReversalEffectsAsync(
        MembershipInvoice invoice,
        InvoiceCreditNote note,
        bool unpaid,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var account = await _db.Accounts
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.AccountId == invoice.AccountId && !a.IsDeleted, cancellationToken);
        if (account is null) return;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var now = DateTime.UtcNow;
        string? statusCode = null;
        if (unpaid)
        {
            var firstYear = await _db.Subscriptions.AsNoTracking()
                .Where(s => s.AccountId == account.AccountId)
                .MinAsync(s => (int?)s.SubscriptionYear, cancellationToken);
            var joiner = firstYear is null || invoice.Year <= firstYear.Value;
            var current = (account.CurrentMemberStatus?.Code ?? "").Trim().ToUpperInvariant();
            statusCode = joiner
                ? current is "TEMPORARY" or "POSTED" or "INACTIVE" or "DUE" or "UNPAID" ? "VOID" : "CANCELLED"
                : "PENDING_PAYMENT";
            var next = await EnsureMemberStatusAsync(
                statusCode,
                statusCode switch
                {
                    "VOID" => "Void",
                    "CANCELLED" => "Cancelled",
                    _ => "Pending payment"
                },
                activeStatus: false,
                terminal: statusCode is "VOID" or "CANCELLED",
                cancellationToken);
            if (account.CurrentMemberStatusId != next.MemberStatusId)
            {
                var fromId = account.CurrentMemberStatusId;
                account.CurrentMemberStatusId = next.MemberStatusId;
                account.CurrentMemberStatus = next;
                if (next.IsTerminal)
                    account.EndDate ??= today;
                _db.MemberStatusHistories.Add(new MemberStatusHistory
                {
                    AccountId = account.AccountId,
                    FromStatusId = fromId,
                    ToStatusId = next.MemberStatusId,
                    EffectiveDate = today,
                    Reason = $"Invoice {invoice.InvoiceNo} reversed by credit note {note.CreditNoteNo} before payment.",
                    ReferenceType = "INVOICE",
                    ReferenceId = invoice.InvoiceId,
                    ChangedByUserId = actorUserId,
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
            }
            if (invoice.Subscription is not null)
                invoice.Subscription.SubscriptionStatusId = next.MemberStatusId;
        }

        account.IsActive = false;
        account.UpdatedByUserId = actorUserId;

        var staff = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "SUPER_ADMIN", "ADMIN", "GENERAL_MANAGER", "TREASURER", "CHAIRMAN", "RECEPTIONIST", "COMMITTEE_MEMBER"
        };
        var logins = await _db.UserAccounts
            .Include(u => u.UserRoles)
                .ThenInclude(r => r.Role)
            .Where(u => u.ProfileId == account.ProfileId && u.IsActive)
            .ToListAsync(cancellationToken);
        foreach (var login in logins)
        {
            if (login.UserRoles.Any(r => r.Role != null && staff.Contains(r.Role.Code))) continue;
            login.IsActive = false;
            login.AccountStatus = "SUSPENDED";
            login.UpdatedByUserId = actorUserId;
        }

        var roomBookings = await _db.AccommodationBookings
            .Where(b => b.AccountId == account.AccountId && b.CheckInDate >= today && b.Status != "CANCELLED")
            .ToListAsync(cancellationToken);
        foreach (var booking in roomBookings)
        {
            booking.Status = "CANCELLED";
            booking.UpdatedAt = now;
            booking.UpdatedByUserId = actorUserId;
        }
        var guestBookings = await _db.NmAccommodationBookings
            .Where(b => b.AccountId == account.AccountId && b.CheckInDate >= today && b.Status != "CANCELLED")
            .ToListAsync(cancellationToken);
        foreach (var booking in guestBookings)
        {
            booking.Status = "CANCELLED";
            booking.UpdatedByUserId = actorUserId;
        }

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MAccount",
            RecordId = account.AccountId,
            Action = "UPDATE",
            NewValues = unpaid
                ? $"invoice {invoice.InvoiceNo} reversed before payment; status={statusCode}; portal suspended; future bookings cancelled"
                : $"invoice {invoice.InvoiceNo} reversed after payment; credit {note.AwaitingRefundAmount:0.00} awaiting refund; portal suspended; future bookings cancelled",
            ChangedByUserId = actorUserId,
            ChangedAt = now
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<MemberStatus> EnsureMemberStatusAsync(
        string code,
        string name,
        bool activeStatus,
        bool terminal,
        CancellationToken cancellationToken)
    {
        var existing = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == code, cancellationToken);
        if (existing is not null) return existing;
        var created = new MemberStatus
        {
            Code = code,
            Name = name,
            SortOrder = 80,
            IsActive = true,
            IsActiveStatus = activeStatus,
            IsTerminal = terminal,
            CreatedAt = DateTime.UtcNow
        };
        _db.MemberStatuses.Add(created);
        await _db.SaveChangesAsync(cancellationToken);
        return created;
    }

    private IQueryable<MembershipInvoice> IssuedInvoiceQuery(SubscriptionListFilter filter)
    {
        var year = filter.Year;
        var search = filter.Search?.Trim();
        var type = filter.MembershipType?.Trim();
        var query = _db.MembershipInvoices.AsNoTracking()
            .Include(i => i.Account).ThenInclude(a => a.Profile)
            .Include(i => i.Account).ThenInclude(a => a.MembershipType)
            .AsQueryable();
        if (year is int y) query = query.Where(i => i.Year == y);
        if (!string.IsNullOrWhiteSpace(type))
            query = query.Where(i => i.Account.MembershipType.Code == type || i.Account.MembershipType.Name == type);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(i =>
                i.InvoiceNo.ToLower().Contains(s)
                || (i.Account.MembershipNo != null && i.Account.MembershipNo.ToLower().Contains(s))
                || ((i.Account.Profile.FirstName + " " + i.Account.Profile.LastName).ToLower().Contains(s)));
        }
        return query;
    }

    private async Task<MembershipInvoice> TrackedInvoiceAsync(long invoiceId, CancellationToken cancellationToken)
    {
        return await _db.MembershipInvoices
            .Include(i => i.Subscription)
            .FirstOrDefaultAsync(i => i.InvoiceId == invoiceId, cancellationToken)
            ?? throw new InvalidOperationException("Invoice was not found.");
    }

    private async Task<Dictionary<long, decimal>> CreditTotalsAsync(IReadOnlyCollection<long> invoiceIds, CancellationToken cancellationToken)
    {
        if (invoiceIds.Count == 0) return [];
        var rows = await _db.InvoiceCreditNotes.AsNoTracking()
            .Where(c => invoiceIds.Contains(c.InvoiceId))
            .GroupBy(c => c.InvoiceId)
            .Select(g => new { InvoiceId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);
        return rows.ToDictionary(x => x.InvoiceId, x => x.Amount);
    }

    private async Task<decimal> CreditedAmountAsync(long invoiceId, CancellationToken cancellationToken) =>
        await _db.InvoiceCreditNotes.AsNoTracking()
            .Where(c => c.InvoiceId == invoiceId)
            .SumAsync(c => (decimal?)c.Amount, cancellationToken) ?? 0m;

    private async Task<Dictionary<long, decimal>> AllocationTotalsAsync(
        IReadOnlyCollection<long> invoiceIds,
        CancellationToken cancellationToken)
    {
        if (invoiceIds.Count == 0) return [];
        var rows = await _db.TransactionAllocations.AsNoTracking()
            .Where(a => invoiceIds.Contains(a.InvoiceId))
            .GroupBy(a => a.InvoiceId)
            .Select(g => new { InvoiceId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);
        return rows.ToDictionary(x => x.InvoiceId, x => x.Amount);
    }

    private async Task ApplyCreditStatusAsync(MembershipInvoice invoice, CancellationToken cancellationToken)
    {
        var credited = await CreditedAmountAsync(invoice.InvoiceId, cancellationToken);
        if (credited >= invoice.Amount - 0.01m && invoice.Amount > 0)
            invoice.Status = "CREDITED";
        else if (credited > 0.01m && invoice.Status is not ("PAID" or "CREDITED"))
            invoice.Status = "PARTIAL";
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<IssuedInvoiceDetailDto> LoadIssuedInvoiceDetailAsync(long invoiceId, CancellationToken cancellationToken)
    {
        var ownerId = await _db.MembershipInvoices.AsNoTracking()
            .Where(i => i.InvoiceId == invoiceId)
            .Select(i => (long?)i.AccountId)
            .FirstOrDefaultAsync(cancellationToken);
        if (ownerId is long accountId)
            await ReconcileAccountDuesAsync(accountId, cancellationToken);

        var invoice = await _db.MembershipInvoices.AsNoTracking()
            .Include(i => i.Account).ThenInclude(a => a.Profile)
            .Include(i => i.Account).ThenInclude(a => a.MembershipType)
            .Include(i => i.Subscription)
            .FirstOrDefaultAsync(i => i.InvoiceId == invoiceId, cancellationToken)
            ?? throw new InvalidOperationException("Invoice was not found.");
        var mapped = await MapInvoiceAsync(invoice, invoice.Account, invoice.Subscription, cancellationToken);
        mapped = mapped with { DueDate = invoice.DueDate, Amount = invoice.Amount };
        var notes = await _db.InvoiceCreditNotes.AsNoTracking()
            .Include(c => c.Invoice).ThenInclude(i => i.Account).ThenInclude(a => a.Profile)
            .Where(c => c.InvoiceId == invoiceId)
            .OrderByDescending(c => c.IssuedAt)
            .ToListAsync(cancellationToken);
        var credited = notes.Sum(c => c.Amount);
        var allocated = await _db.TransactionAllocations.AsNoTracking()
            .Where(a => a.InvoiceId == invoiceId)
            .SumAsync(a => (decimal?)a.Amount, cancellationToken) ?? 0m;
        var paid = Math.Max(0m, invoice.Subscription?.AmountPaid ?? 0m);
        var applied = Math.Max(allocated, Math.Min(invoice.Amount, paid));
        return new IssuedInvoiceDetailDto(
            mapped,
            invoice.Amount,
            credited,
            Math.Max(0, invoice.Amount - credited - applied),
            invoice.DueDate,
            notes.Select(MapCreditNote).ToList());
    }

    private static InvoiceCreditNoteRowDto MapCreditNote(InvoiceCreditNote note)
    {
        var account = note.Invoice.Account;
        return new InvoiceCreditNoteRowDto(
            note.CreditNoteId,
            note.CreditNoteNo,
            note.InvoiceId,
            note.Invoice.InvoiceNo,
            note.AccountId,
            MemberName(account),
            account.MembershipNo,
            note.Amount,
            note.Reason,
            note.IssuedAt,
            note.Status);
    }

    private static string MemberName(MAccount account)
    {
        var name = $"{account.Profile?.FirstName} {account.Profile?.LastName}".Trim();
        return string.IsNullOrWhiteSpace(name) ? account.MembershipNo ?? "Member" : name;
    }
}