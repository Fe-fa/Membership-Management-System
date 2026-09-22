using System.Text.Json;
using System.Text.Json.Serialization;
using ClubManagement.DTOs.Common;
using ClubManagement.Entities;
using ClubManagement.Entities.Finance;
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

    internal static bool RecognizesPayment(string? code)
    {
        var c = NormalizeStatus(code);
        return c is "PAID" or "WAIVED" or "PARTIALLY_PAID" or "SETTLED";
    }

    internal static bool CountsTowardDues(string? code)
    {
        var c = NormalizeStatus(code);
        return RecognizesPayment(c) || c is "REFUNDED";
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

    private static string NormalizeStatus(string? code) =>
        (code ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");

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
        CancellationToken cancellationToken)
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
            var sub = await _db.Subscriptions.AsNoTracking()
                .FirstOrDefaultAsync(s => s.AccountId == annualAccountId && s.SubscriptionYear == year, cancellationToken);
            if (sub is null) return null;
            due = sub.AmountDue;
        }
        else if (isJoining)
        {
            if (accountId is long joiningAccountId)
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
            else if (profileId is long pid)
            {
                var app = await _db.Applications.AsNoTracking()
                    .Where(a => a.ApplicantProfileId == pid)
                    .OrderByDescending(a => a.ApplicationId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (app is not null)
                {
                    var dues = await GetApplicationDuesAsync(app.ApplicationId, cancellationToken);
                    due = dues.JoiningFee;
                    recognizedPaid = dues.JoiningPaid;
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

        if (isAnnual && subscriptionYear is int annualYear)
        {
            long? subId = null;
            if (accountId is long aid)
            {
                subId = await _db.Subscriptions.AsNoTracking()
                    .Where(s => s.AccountId == aid && s.SubscriptionYear == annualYear)
                    .Select(s => (long?)s.SubscriptionId)
                    .FirstOrDefaultAsync(cancellationToken);
            }
            txs = txs.Where(t => MatchesAnnualYear(t, annualYear, subId)).ToList();
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

    private async Task EnsureAmountWithinObligationAsync(
        RecordPaymentRequest request,
        long? profileId,
        CancellationToken cancellationToken)
    {
        var obligation = await TryGetFeeObligationAsync(
            request.AccountId,
            profileId,
            request.FeeTypeId,
            request.SubscriptionYear,
            null,
            cancellationToken);
        if (obligation is null) return;
        if (request.Amount > obligation.RemainingCap + 0.01m)
            throw new InvalidOperationException(
                $"Amount cannot exceed the remaining due ({obligation.RemainingCap:0.00}). Partial payments are allowed; overpayment is not.");
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
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Member account was not found.");

        var sub = await _db.Subscriptions
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == y, cancellationToken)
            ?? throw new InvalidOperationException($"No {y} subscription was found for this member. Run annual renewal first.");

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
                Amount = sub.AmountDue,
                Status = sub.ArrearsAmount <= 0 ? "PAID" : sub.AmountPaid > 0 ? "PARTIAL" : "ISSUED",
                PublishedToMember = publishToMember,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.MembershipInvoices.Add(invoice);
            await _db.SaveChangesAsync(cancellationToken);
        }
        else
        {
            invoice.Amount = sub.AmountDue;
            invoice.SubscriptionId = sub.SubscriptionId;
            invoice.Status = sub.ArrearsAmount <= 0 ? "PAID" : sub.AmountPaid > 0 ? "PARTIAL" : "ISSUED";
            invoice.DueDate = InvoiceDueDate(y);
            if (publishToMember)
                invoice.PublishedToMember = true;
            await _db.SaveChangesAsync(cancellationToken);
        }

        var dto = await MapInvoiceAsync(invoice, account, sub, cancellationToken);
        if (sendEmail)
            await TryEmailInvoiceAsync(invoice, dto, account.Profile?.Email, invoiceHtml, cancellationToken);
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
        var query = InvoiceArrearsQuery(y, filter.MembershipType, filter.Search)
            .Where(s => !deliveredAccountIds.Contains(s.AccountId));

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

        var query = _db.Subscriptions.AsNoTracking()
            .Where(s => s.SubscriptionYear == year && s.AmountDue > s.AmountPaid);
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
            var paid = txs
                .Where(t =>
                    CountsTowardDues(t.PaymentStatus?.Code)
                    && MatchesAnnualYear(t, sub.SubscriptionYear, sub.SubscriptionId))
                .Sum(t => t.Amount);
            sub.AmountPaid = paid;
            sub.ArrearsAmount = Math.Max(0, sub.AmountDue - paid);
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
            invoice.Status = sub.ArrearsAmount <= 0.01m ? "PAID" : sub.AmountPaid > 0.01m ? "PARTIAL" : "ISSUED";
        }

        await _db.SaveChangesAsync(cancellationToken);
        await TryRestoreActiveMembershipAsync(accountId, null, cancellationToken);
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

        var account = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Member account was not found.");

        var year = DateTime.UtcNow.Year;
        var sub = await _db.Subscriptions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == year, cancellationToken);
        var joiningFee = await _db.FeeTypes.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Code == "JOINING" || f.Code == "ENTRANCE", cancellationToken);
        decimal joiningPaid = 0;
        if (joiningFee is not null)
        {
            joiningPaid = await _db.Transactions.AsNoTracking()
                .Where(t =>
                    t.AccountId == accountId
                    && t.FeeTypeId == joiningFee.FeeTypeId
                    && t.Amount > 0
                    && (t.PaymentStatus.Code == "PAID"
                        || t.PaymentStatus.Code == "WAIVED"
                        || t.PaymentStatus.Code == "PARTIALLY_PAID"
                        || t.PaymentStatus.Code == "SETTLED"
                        || t.PaymentStatus.Code == "REFUNDED"))
                .SumAsync(t => (decimal?)t.Amount, cancellationToken) ?? 0;
        }
        var joiningDue = account.EntranceFeeWaivedFlag ? 0 : (account.EntranceFeeAmount ?? 0);
        var joiningOutstanding = Math.Max(0, joiningDue - joiningPaid);
        var annualOutstanding = sub is null ? 0 : Math.Max(0, sub.AmountDue - sub.AmountPaid);
        var closing = joiningOutstanding + annualOutstanding;

        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Include(t => t.PaymentMethod)
            .Include(t => t.FeeType)
            .Include(t => t.Receipt)
            .Where(t => t.AccountId == accountId)
            .Where(t => t.PaymentDate != null && t.PaymentDate >= from && t.PaymentDate <= to)
            .OrderBy(t => t.PaymentDate)
            .ThenBy(t => t.TransactionId)
            .ToListAsync(cancellationToken);

        var inflow = txs.Where(t => RecognizesPayment(t.PaymentStatus?.Code) && t.Amount > 0).Sum(t => t.Amount);
        var returned = txs
            .Where(t =>
            {
                var c = NormalizeStatus(t.PaymentStatus?.Code);
                return (c is "REFUNDED" or "REVERSED") && t.Amount > 0;
            })
            .Sum(t => t.Amount);
        var opening = Math.Max(0, closing + inflow - returned);

        var memberName = $"{account.Profile?.FirstName} {account.Profile?.LastName}".Trim();
        if (string.IsNullOrWhiteSpace(memberName))
            memberName = account.MembershipNo ?? "Member";
        var club = await ClubHeaderAsync(cancellationToken);
        var lines = txs.Select(t => new StatementLineDto(
            t.PaymentDate ?? DateOnly.FromDateTime(t.CreatedAt),
            t.FeeType?.Name,
            t.PaymentMethod?.Name,
            t.Receipt?.ReceiptNumber,
            t.PaymentStatus?.Name,
            t.Amount)).ToList();
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
            lines);
    }

    private IQueryable<Subscription> InvoiceArrearsQuery(int year, string? membershipType, string? search)
    {
        var query = _db.Subscriptions.AsNoTracking()
            .Where(s =>
                s.SubscriptionYear == year
                && (s.ArrearsAmount > 0 || s.AmountPaid < s.AmountDue));

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

    private IQueryable<long> DeliveredInvoiceAccountIds(int year) =>
        _db.MembershipInvoices.AsNoTracking()
            .Where(i => i.Year == year && (i.SentAt != null || i.PublishedToMember))
            .Select(i => i.AccountId);

    private async Task<InvoiceDocumentDto> MapInvoiceAsync(
        MembershipInvoice invoice,
        ClubManagement.Entities.MembershipAccount.MAccount account,
        ClubManagement.Entities.Subscriptions.Subscription? sub,
        CancellationToken cancellationToken)
    {
        var paid = sub?.AmountPaid ?? 0;
        var due = sub?.AmountDue ?? invoice.Amount;
        var balance = Math.Max(0, due - paid);
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
            due,
            paid,
            balance,
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
            await ClubSettingValueAsync("BANK_ACCOUNT", "01100399661210", cancellationToken));
    }

    private async Task TryEmailInvoiceAsync(
        MembershipInvoice invoice,
        InvoiceDocumentDto dto,
        string? email,
        string? invoiceHtml,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email)) return;
        if (string.IsNullOrWhiteSpace(invoiceHtml))
        {
            _logger.LogWarning(
                "Skipped email for {InvoiceNo}: invoice HTML must come from the frontend document.",
                invoice.InvoiceNo);
            return;
        }
        try
        {
            var sent = await _email.SendHtmlAsync(
                email.Trim(),
                $"Aero Club invoice {dto.InvoiceNo} - {dto.Year} subscription",
                invoiceHtml,
                cancellationToken);
            if (sent)
            {
                invoice.SentAt = DateTime.UtcNow;
                invoice.SentToEmail = email.Trim();
                await _db.SaveChangesAsync(cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Invoice email failed for {InvoiceNo}", invoice.InvoiceNo);
        }
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
                    F("bank-note", "Remittance note", "Bank remittance charges must be paid by the sender — use “OUR” code"),
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
}
