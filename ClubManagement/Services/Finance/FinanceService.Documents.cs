using System.Globalization;
using System.Text;
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
        CancellationToken cancellationToken)
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
                DueDate = InvoiceDueDate(y, DateTime.UtcNow),
                Amount = sub.AmountDue,
                Status = sub.ArrearsAmount <= 0 ? "PAID" : sub.AmountPaid > 0 ? "PARTIAL" : "ISSUED",
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
            invoice.DueDate = InvoiceDueDate(y, invoice.IssuedAt);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var dto = await MapInvoiceAsync(invoice, account, sub, cancellationToken);
        if (sendEmail)
            await TryEmailInvoiceAsync(invoice, dto, account.Profile?.Email, cancellationToken);
        return invoice.SentAt is not null ? await MapInvoiceAsync(invoice, account, sub, cancellationToken) : dto;
    }

    public async Task<InvoiceDocumentDto?> GetSubscriptionInvoiceAsync(
        long accountId,
        int? year,
        CancellationToken cancellationToken)
    {
        var y = year ?? DateTime.UtcNow.Year;
        var invoice = await _db.MembershipInvoices
            .FirstOrDefaultAsync(i => i.AccountId == accountId && i.Year == y, cancellationToken);
        if (invoice is null) return null;

        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .FirstOrDefaultAsync(a => a.AccountId == accountId, cancellationToken)
            ?? throw new InvalidOperationException("Member account was not found.");
        var sub = await _db.Subscriptions
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == y, cancellationToken);
        return await MapInvoiceAsync(invoice, account, sub, cancellationToken);
    }

    public async Task<int> IssueAnnualInvoicesForYearAsync(
        int year,
        long? actorUserId,
        bool sendEmail,
        CancellationToken cancellationToken,
        IReadOnlyList<long>? accountIds = null)
    {
        var query = _db.Subscriptions.AsNoTracking()
            .Where(s => s.SubscriptionYear == year && s.AmountDue > s.AmountPaid);
        if (accountIds is { Count: > 0 })
        {
            var ids = accountIds.Distinct().ToList();
            query = query.Where(s => ids.Contains(s.AccountId));
        }

        var targets = await query.Select(s => s.AccountId).Distinct().ToListAsync(cancellationToken);

        var issued = 0;
        foreach (var accountId in targets)
        {
            try
            {
                await IssueSubscriptionInvoiceAsync(accountId, year, sendEmail, actorUserId, cancellationToken);
                issued++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not issue {Year} invoice for account {AccountId}", year, accountId);
            }
        }
        return issued;
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
        var html = await BuildStatementHtmlAsync(account, memberName, from, to, opening, closing, txs, cancellationToken);
        return new StatementDocumentDto(
            accountId,
            string.IsNullOrWhiteSpace(memberName) ? account.MembershipNo ?? "Member" : memberName,
            account.MembershipNo,
            from,
            to,
            opening,
            closing,
            html);
    }

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
            InvoiceDueDate(invoice.Year, invoice.IssuedAt),
            invoice.IssuedAt,
            invoice.Status,
            invoice.SentAt is not null,
            invoice.SentToEmail,
            string.IsNullOrWhiteSpace(club.ClubName) ? "Aero Club of East Africa" : club.ClubName,
            string.IsNullOrWhiteSpace(club.Address)
                ? "P.O. Box 40813, 00100 Wilson Airport, Nairobi, Kenya"
                : club.Address,
            string.IsNullOrWhiteSpace(club.Email) ? "info@aeroclubea.com" : club.Email,
            string.IsNullOrWhiteSpace(club.Phone) ? "+254 111 053 220" : club.Phone,
            await ClubSettingValueAsync("MPESA_PAYBILL", "123456", cancellationToken),
            await ClubSettingValueAsync("BANK_NAME", "Kenya Commercial Bank (KCB)", cancellationToken),
            await ClubSettingValueAsync("BANK_ACCOUNT", "111053220", cancellationToken));
    }

    private async Task TryEmailInvoiceAsync(
        MembershipInvoice invoice,
        InvoiceDocumentDto dto,
        string? email,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email)) return;
        try
        {
            var sent = await _email.SendHtmlAsync(
                email.Trim(),
                $"Aero Club invoice {dto.InvoiceNo} · {dto.Year} subscription",
                BuildInvoiceHtml(dto),
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

    private static DateOnly InvoiceDueDate(int year, DateTime issuedAt)
    {
        var due = new DateOnly(year, 2, 28);
        var issued = DateOnly.FromDateTime(issuedAt);
        return due < issued ? new DateOnly(year + 1, 2, 28) : due;
    }

    private static string InvoiceStatusLabel(decimal paid, decimal balance)
    {
        if (balance <= 0.01m) return "PAID";
        if (paid > 0.01m) return "PARTIAL";
        return "UNPAID";
    }

    private static string BuildInvoiceHtml(InvoiceDocumentDto dto)
    {
        var kes = CultureInfo.GetCultureInfo("en-KE");
        string Money(decimal v) => v.ToString("N2", kes);
        string H(string? value) => System.Net.WebUtility.HtmlEncode(value ?? "");

        var clubName = string.IsNullOrWhiteSpace(dto.ClubName) ? "Aero Club of East Africa" : dto.ClubName;
        var address = string.IsNullOrWhiteSpace(dto.ClubAddress)
            ? "P.O. Box 40813, 00100 Wilson Airport, Nairobi, Kenya"
            : dto.ClubAddress;
        var email = string.IsNullOrWhiteSpace(dto.ClubEmail) ? "info@aeroclubea.com" : dto.ClubEmail;
        var phone = string.IsNullOrWhiteSpace(dto.ClubPhone) ? "+254 111 053 220" : dto.ClubPhone;
        var membershipNo = string.IsNullOrWhiteSpace(dto.MembershipNo) ? "—" : dto.MembershipNo;
        var membershipType = dto.MembershipType ?? "";
        var status = InvoiceStatusLabel(dto.AmountPaid, dto.Balance);
        var statusClass = status.ToLowerInvariant();
        var paybill = string.IsNullOrWhiteSpace(dto.MpesaPaybill) ? "123456" : dto.MpesaPaybill;
        var bankName = string.IsNullOrWhiteSpace(dto.BankName) ? "Kenya Commercial Bank (KCB)" : dto.BankName;
        var bankAccount = string.IsNullOrWhiteSpace(dto.BankAccount) ? "111053220" : dto.BankAccount;
        var membershipLine = string.IsNullOrWhiteSpace(membershipType)
            ? H(membershipNo)
            : $"{H(membershipNo)} • {H(membershipType)}";

        return $$"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>{{H(dto.InvoiceNo)}}</title>
  <style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0e2744;
      background: #fff;
      font-family: "Segoe UI", Tahoma, sans-serif;
    }
    .sheet { max-width: 760px; margin: 0 auto; padding: 0 8px 24px; }
    .rule { height: 10px; background: #0a2744; }
    .header { display: flex; justify-content: space-between; gap: 24px; padding: 28px 8px 18px; }
    .brand { display: flex; align-items: flex-start; gap: 10px; }
    .brand h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
    .brand svg { margin-top: 4px; flex-shrink: 0; }
    .contact { margin: 8px 0 0; color: #4b5563; font-size: 13px; line-height: 1.45; }
    .masthead { text-align: right; }
    .badge {
      display: inline-block;
      margin-bottom: 8px;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .badge.unpaid { background: #d1fae5; color: #0f766e; }
    .badge.partial { background: #e0f2fe; color: #075985; }
    .badge.paid { background: #dcfce7; color: #166534; }
    .wordmark { margin: 0; font-size: 34px; font-weight: 800; letter-spacing: 0.04em; line-height: 1; }
    .inv-no { margin: 8px 0 0; color: #6b7280; font-size: 15px; letter-spacing: 0.04em; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 32px; padding: 8px 8px 20px; }
    .meta-col { padding-left: 0; }
    .meta-col + .meta-col { border-left: 1px solid #d1d5db; padding-left: 32px; }
    .kicker { margin: 0 0 8px; color: #6b7280; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }
    .who { margin: 0; font-size: 22px; font-weight: 700; }
    .sub { margin: 6px 0 0; color: #4b5563; font-size: 14px; }
    .dates { margin: 0; font-size: 14px; line-height: 1.7; }
    .total {
      margin: 4px 8px 22px;
      padding: 18px 22px;
      border: 1px solid #d1d5db;
      border-radius: 14px;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.01em;
    }
    table.lines { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }
    table.lines th, table.lines td { padding: 12px 16px; font-size: 14px; }
    table.lines th { background: #0d3a4d; color: #fff; text-align: left; font-weight: 700; }
    table.lines th.amt, table.lines td.amt { text-align: right; white-space: nowrap; }
    table.lines td { border-bottom: 1px solid #e5e7eb; }
    table.lines tr.stripe td { background: #f3f6f8; }
    table.lines tr.balance td { background: #0d3a4d; color: #fff; font-weight: 700; border: 0; }
    .pay { padding: 22px 8px 0; }
    .pay h3 { margin: 0 0 8px; font-size: 14px; letter-spacing: 0.04em; }
    .pay p { margin: 0; font-size: 14px; line-height: 1.6; }
    .note { padding: 18px 8px 0; color: #6b7280; font-size: 13px; font-style: italic; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="rule"></div>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">
          <h1>{{H(clubName)}}</h1>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 16l8-3 3-8 2 6 7 2-7 2-2 7-3-8-8 3z" fill="#0a2744"/>
          </svg>
        </div>
        <p class="contact">{{H(address)}}<br />{{H(email)}} | {{H(phone)}}</p>
      </div>
      <div class="masthead">
        <span class="badge {{statusClass}}">{{status}}</span>
        <p class="wordmark">INVOICE</p>
        <p class="inv-no">{{H(dto.InvoiceNo)}}</p>
      </div>
    </div>
    <div class="meta">
      <div class="meta-col">
        <p class="kicker">BILLED TO</p>
        <p class="who">{{H(dto.MemberName)}}</p>
        <p class="sub">Membership: {{membershipLine}}</p>
      </div>
      <div class="meta-col">
        <p class="kicker">INVOICE DETAILS</p>
        <p class="dates">Date Issued: {{dto.IssuedAt:dd MMM yyyy}}<br />Due Date: {{dto.DueDate:dd MMM yyyy}}</p>
      </div>
    </div>
    <div class="total">TOTAL DUE: Ksh {{Money(dto.Balance)}}</div>
    <table class="lines">
      <thead>
        <tr>
          <th>Description</th>
          <th class="amt">Amount (Ksh)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{{dto.Year}} annual subscription</td>
          <td class="amt">{{Money(dto.Amount)}}</td>
        </tr>
        <tr class="stripe">
          <td>Paid to date</td>
          <td class="amt">{{Money(dto.AmountPaid)}}</td>
        </tr>
        <tr class="balance">
          <td>Balance due</td>
          <td class="amt">{{Money(dto.Balance)}}</td>
        </tr>
      </tbody>
    </table>
    <div class="pay">
      <h3>HOW TO PAY</h3>
      <p>
        M-Pesa Paybill {{H(paybill)}}<br />
        Bank: {{H(bankName)}} · Account {{H(bankAccount)}}
      </p>
    </div>
    <p class="note">One invoice is issued per member per year. Partial payments reduce the balance due.</p>
  </div>
</body>
</html>
""";
    }

    private async Task<string> ClubSettingValueAsync(string key, string fallback, CancellationToken cancellationToken)
    {
        var value = await _db.ClubSettings.AsNoTracking()
            .Where(s => s.IsActive && s.SettingKey == key)
            .Select(s => s.SettingValue)
            .FirstOrDefaultAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private async Task<string> BuildStatementHtmlAsync(
        ClubManagement.Entities.MembershipAccount.MAccount account,
        string memberName,
        DateOnly from,
        DateOnly to,
        decimal opening,
        decimal closing,
        List<MTransaction> txs,
        CancellationToken cancellationToken)
    {
        var club = await ClubHeaderAsync(cancellationToken);
        var kes = CultureInfo.GetCultureInfo("en-KE");
        string Money(decimal v) => v.ToString("N2", kes);
        var rows = new StringBuilder();
        foreach (var t in txs)
        {
            var date = t.PaymentDate?.ToString("dd MMM yyyy") ?? t.CreatedAt.ToString("dd MMM yyyy");
            var receipt = t.Receipt?.ReceiptNumber ?? "—";
            rows.AppendLine(
                $"<tr><td>{date}</td><td>{t.FeeType?.Name ?? "—"}</td><td>{t.PaymentMethod?.Name ?? "—"}</td><td>{receipt}</td><td>{t.PaymentStatus?.Name ?? "—"}</td><td>{Money(t.Amount)}</td></tr>");
        }
        if (txs.Count == 0)
            rows.AppendLine("""<tr><td colspan="6">No transactions in this period.</td></tr>""");

        return $$"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Statement {{from:yyyy-MM-dd}} to {{to:yyyy-MM-dd}}</title>
  <style>
    body { font-family: "Segoe UI", Tahoma, sans-serif; color: #111; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .muted { color: #555; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
  </style>
</head>
<body>
  <h1>{{club.ClubName}}</h1>
  <p class="muted">Member statement</p>
  <p>
    <strong>{{memberName}}</strong><br />
    Membership {{account.MembershipNo ?? "—"}} · {{account.MembershipType?.Name ?? ""}}<br />
    Period {{from:dd MMM yyyy}} – {{to:dd MMM yyyy}}
  </p>
  <p>Opening balance <strong>{{Money(opening)}}</strong> · Closing balance <strong>{{Money(closing)}}</strong></p>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Fee</th><th>Method</th><th>Receipt</th><th>Status</th><th>Amount (Ksh)</th>
      </tr>
    </thead>
    <tbody>
      {{rows}}
    </tbody>
  </table>
</body>
</html>
""";
    }
}
