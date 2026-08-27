using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Subscriptions;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Finance;

public record FeeQuoteDto(long MembershipTypeId, string MembershipType, decimal JoiningFee, decimal JoiningFeeUnder30, decimal AnnualSubscription, decimal PayableJoining, decimal PayableAnnual, bool HalfYear);
public record ApplicationDuesDto(
    long? MembershipTypeId,
    string? MembershipTypeName,
    long JoiningFeeTypeId,
    long AnnualFeeTypeId,
    decimal JoiningFee,
    decimal AnnualSubscription,
    decimal JoiningPaid,
    decimal AnnualPaid,
    decimal JoiningBalance,
    decimal AnnualBalance,
    decimal TotalDue,
    decimal TotalPaid,
    decimal Balance,
    bool HalfYearAnnual);
public record RecordPaymentRequest(
    long? AccountId,
    long? ApplicationId,
    long FeeTypeId,
    long PaymentMethodId,
    decimal Amount,
    DateOnly PaymentDate,
    string? ChequeNo,
    string? MpesaCode,
    string? ReferenceNote,
    string? PaymentStatusCode = null);
public record PaymentRowDto(
    long TransactionId,
    string? ReceiptNumber,
    string? MemberName,
    string? Method,
    string? Status,
    decimal Amount,
    DateOnly? PaymentDate,
    string? MpesaCode,
    string? ChequeNo,
    string? FeeType = null,
    string? ReferenceNote = null);
public record SubscriptionRowDto(long SubscriptionId, long AccountId, string MembershipNo, string MemberName, int Year, decimal AmountDue, decimal AmountPaid, decimal ArrearsAmount, string Status, DateOnly? DueDate, DateOnly? PostedDate, DateOnly? RemovalDate);

public interface IFinanceService
{
    Task<FeeQuoteDto> QuoteAsync(long membershipTypeId, DateOnly dateOfBirth, DateOnly asOf, CancellationToken cancellationToken);
    Task<ApplicationDuesDto> GetApplicationDuesAsync(long applicationId, CancellationToken cancellationToken);
    Task<PaymentRowDto> RecordPaymentAsync(RecordPaymentRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PaymentRowDto>> ListPaymentsAsync(long? accountId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PaymentRowDto>> ListPaymentsByProfileAsync(long profileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<SubscriptionRowDto>> ListSubscriptionsAsync(int? year, CancellationToken cancellationToken);
    Task<int> RunPostingAsync(int year, long? actorUserId, CancellationToken cancellationToken);
}

public class FinanceService : IFinanceService
{
    private readonly ApplicationModuleDbContext _db;
    public FinanceService(ApplicationModuleDbContext db) => _db = db;

    public async Task<FeeQuoteDto> QuoteAsync(long membershipTypeId, DateOnly dateOfBirth, DateOnly asOf, CancellationToken cancellationToken)
    {
        var type = await _db.MembershipTypes.AsNoTracking().FirstAsync(x => x.MembershipTypeId == membershipTypeId, cancellationToken);
        var schedule = await _db.MembershipFeeSchedules.AsNoTracking()
            .Where(x => x.IsActive && x.MembershipTypeId == membershipTypeId && x.EffectiveDate <= asOf)
            .OrderByDescending(x => x.EffectiveDate)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No fee schedule is configured for this membership type.");

        var age = asOf.Year - dateOfBirth.Year - (asOf < dateOfBirth.AddYears(asOf.Year - dateOfBirth.Year) ? 1 : 0);
        var joining = age < 30 ? schedule.JoiningFeeUnder30 : schedule.JoiningFee;
        var annual = asOf.Month > 6 ? Math.Round(schedule.AnnualSubscription / 2m, 2) : schedule.AnnualSubscription;
        return new FeeQuoteDto(type.MembershipTypeId, type.Name, schedule.JoiningFee, schedule.JoiningFeeUnder30, schedule.AnnualSubscription, joining, annual, asOf.Month > 6);
    }

    public async Task<ApplicationDuesDto> GetApplicationDuesAsync(long applicationId, CancellationToken cancellationToken)
    {
        var app = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");

        var joiningFeeType = await _db.FeeTypes.AsNoTracking()
            .FirstAsync(x => x.Code == "JOINING" || x.Code == "Joining", cancellationToken);
        var annualFeeType = await _db.FeeTypes.AsNoTracking()
            .FirstAsync(x => x.Code == "ANNUAL" || x.Code == "Annual", cancellationToken);

        var membershipTypeId = await ResolveMembershipTypeIdAsync(app.FormDataJson, cancellationToken);
        decimal joiningDue = 0;
        decimal annualDue = 0;
        string? membershipTypeName = null;
        var halfYear = false;

        if (membershipTypeId is long typeId)
        {
            var dob = app.Applicant?.DateOfBirth ?? new DateOnly(1990, 1, 1);
            var quote = await QuoteAsync(typeId, dob, DateOnly.FromDateTime(DateTime.UtcNow), cancellationToken);
            joiningDue = quote.PayableJoining;
            annualDue = quote.PayableAnnual;
            membershipTypeName = quote.MembershipType;
            halfYear = quote.HalfYear;
        }

        // Prefer Subscription.amount_due for annual when the applicant already has an account subscription row.
        var account = await _db.Accounts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId && !a.IsDeleted, cancellationToken);
        if (account is not null)
        {
            var year = DateTime.UtcNow.Year;
            var sub = await _db.Subscriptions.AsNoTracking()
                .Where(s => s.AccountId == account.AccountId && s.SubscriptionYear == year)
                .OrderByDescending(s => s.SubscriptionId)
                .FirstOrDefaultAsync(cancellationToken);
            if (sub is not null)
            {
                annualDue = sub.AmountDue;
            }
        }

        var paidRows = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Where(t => t.ProfileId == app.ApplicantProfileId)
            .ToListAsync(cancellationToken);

        static bool CountsAsPaid(string? code) =>
            string.Equals(code, "PAID", StringComparison.OrdinalIgnoreCase)
            || string.Equals(code, "WAIVED", StringComparison.OrdinalIgnoreCase);

        var joiningPaid = paidRows
            .Where(t => t.FeeTypeId == joiningFeeType.FeeTypeId && CountsAsPaid(t.PaymentStatus?.Code))
            .Sum(t => t.Amount);
        var annualPaid = paidRows
            .Where(t => t.FeeTypeId == annualFeeType.FeeTypeId && CountsAsPaid(t.PaymentStatus?.Code))
            .Sum(t => t.Amount);

        var joiningBalance = Math.Max(0, joiningDue - joiningPaid);
        var annualBalance = Math.Max(0, annualDue - annualPaid);
        var totalDue = joiningDue + annualDue;
        var totalPaid = joiningPaid + annualPaid;

        return new ApplicationDuesDto(
            membershipTypeId,
            membershipTypeName,
            joiningFeeType.FeeTypeId,
            annualFeeType.FeeTypeId,
            joiningDue,
            annualDue,
            joiningPaid,
            annualPaid,
            joiningBalance,
            annualBalance,
            totalDue,
            totalPaid,
            Math.Max(0, totalDue - totalPaid),
            halfYear);
    }

    private async Task<long?> ResolveMembershipTypeIdAsync(string? formDataJson, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(formDataJson)) return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(formDataJson);
            if (!doc.RootElement.TryGetProperty("membership", out var mem)) return null;
            if (!mem.TryGetProperty("membershipType", out var mt)) return null;
            var raw = mt.GetString();
            if (string.IsNullOrWhiteSpace(raw)) return null;

            var wanted = raw.Trim().ToUpperInvariant().Replace(" ", "_").Replace("-", "_");
            var types = await _db.MembershipTypes.AsNoTracking().ToListAsync(cancellationToken);
            var match = types.FirstOrDefault(t =>
                string.Equals(t.Code, wanted, StringComparison.OrdinalIgnoreCase)
                || string.Equals(t.Code.Replace("_", ""), wanted.Replace("_", ""), StringComparison.OrdinalIgnoreCase)
                || string.Equals(t.Name, raw, StringComparison.OrdinalIgnoreCase)
                || t.Name.StartsWith(raw, StringComparison.OrdinalIgnoreCase));
            return match?.MembershipTypeId;
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    public async Task<PaymentRowDto> RecordPaymentAsync(RecordPaymentRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        if (request.Amount <= 0)
            throw new InvalidOperationException("Payment amount must be greater than zero.");

        var method = await _db.PaymentMethods.AsNoTracking()
            .FirstOrDefaultAsync(x => x.PaymentMethodId == request.PaymentMethodId && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("Payment method was not found.");

        var methodCode = method.Code.Trim().ToUpperInvariant().Replace("-", "_");
        var requestedStatus = (request.PaymentStatusCode ?? "").Trim().ToUpperInvariant().Replace("-", "_");
        if (string.IsNullOrEmpty(requestedStatus))
        {
            // Cheques stay pending until cleared; other methods are recorded as paid.
            requestedStatus = methodCode is "CHEQUE" or "CHEQUE_PAYMENT" ? "PENDING" : "PAID";
        }

        var paymentStatus = await _db.PaymentStatuses
            .FirstOrDefaultAsync(x => x.Code == requestedStatus || x.Code == request.PaymentStatusCode, cancellationToken)
            ?? await _db.PaymentStatuses.FirstAsync(x => x.Code == "PAID", cancellationToken);

        long? profileId = null;
        if (request.AccountId is long accountId)
        {
            profileId = await _db.Accounts
                .Where(a => a.AccountId == accountId)
                .Select(a => (long?)a.ProfileId)
                .FirstOrDefaultAsync(cancellationToken);
        }
        else if (request.ApplicationId is long applicationId)
        {
            profileId = await _db.Applications
                .Where(a => a.ApplicationId == applicationId)
                .Select(a => (long?)a.ApplicantProfileId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (profileId is null or 0)
            throw new InvalidOperationException("Payment must be linked to an applicant profile or member account.");

        var feeExists = await _db.FeeTypes.AnyAsync(x => x.FeeTypeId == request.FeeTypeId, cancellationToken);
        if (!feeExists)
            throw new InvalidOperationException("Fee type was not found.");

        var tx = new MTransaction
        {
            AccountId = request.AccountId,
            ProfileId = profileId,
            FeeTypeId = request.FeeTypeId,
            PaymentMethodId = request.PaymentMethodId,
            PaymentStatusId = paymentStatus.PaymentStatusId,
            Amount = request.Amount,
            PaymentDate = request.PaymentDate,
            ChequeNo = request.ChequeNo,
            MpesaCode = request.MpesaCode,
            ReferenceNote = request.ReferenceNote,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.Transactions.Add(tx);
        await _db.SaveChangesAsync(cancellationToken);

        var receiptNo = $"RCT-{tx.TransactionId:D6}";
        var receipt = new MReceiptMaster
        {
            TransactionId = tx.TransactionId,
            ReceiptNumber = receiptNo,
            Amount = request.Amount,
            IssuedDate = request.PaymentDate,
            IssuedByUserId = actorUserId,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.Receipts.Add(receipt);

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransaction",
            RecordId = tx.TransactionId,
            Action = "INSERT",
            NewValues = $"profile={profileId}; method={method.Code}; status={paymentStatus.Code}; amount={request.Amount}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (request.AccountId is long paidAccountId)
        {
            var year = request.PaymentDate.Year;
            var sub = await _db.Subscriptions.FirstOrDefaultAsync(s => s.AccountId == paidAccountId && s.SubscriptionYear == year, cancellationToken);
            if (sub is not null && string.Equals(paymentStatus.Code, "PAID", StringComparison.OrdinalIgnoreCase))
            {
                sub.AmountPaid += request.Amount;
                sub.ArrearsAmount = Math.Max(0, sub.AmountDue - sub.AmountPaid);
                if (sub.ArrearsAmount == 0)
                {
                    var paidMemberStatus = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "PAID", cancellationToken);
                    if (paidMemberStatus is not null) sub.SubscriptionStatusId = paidMemberStatus.MemberStatusId;
                    var open = await _db.Arrearses.Where(a => a.AccountId == paidAccountId && a.SubscriptionId == sub.SubscriptionId && a.Status == "OPEN").ToListAsync(cancellationToken);
                    foreach (var row in open)
                    {
                        row.Status = "SETTLED";
                        row.SettledDate = request.PaymentDate;
                        row.SettledByTransactionId = tx.TransactionId;
                    }
                }
                await _db.SaveChangesAsync(cancellationToken);
            }
        }

        var feeName = await _db.FeeTypes.AsNoTracking()
            .Where(f => f.FeeTypeId == request.FeeTypeId)
            .Select(f => f.Name)
            .FirstOrDefaultAsync(cancellationToken);

        return new PaymentRowDto(
            tx.TransactionId,
            receiptNo,
            null,
            method.Name,
            paymentStatus.Name,
            tx.Amount,
            tx.PaymentDate,
            tx.MpesaCode,
            tx.ChequeNo,
            feeName,
            tx.ReferenceNote);
    }

    public async Task<IReadOnlyList<PaymentRowDto>> ListPaymentsAsync(long? accountId, CancellationToken cancellationToken)
    {
        var query = _db.Transactions.AsNoTracking().AsQueryable();
        if (accountId is not null) query = query.Where(t => t.AccountId == accountId);

        return await MapPaymentRows(query, cancellationToken);
    }

    public async Task<IReadOnlyList<PaymentRowDto>> ListPaymentsByProfileAsync(long profileId, CancellationToken cancellationToken)
    {
        var query = _db.Transactions.AsNoTracking().Where(t => t.ProfileId == profileId);
        return await MapPaymentRows(query, cancellationToken);
    }

    private static async Task<IReadOnlyList<PaymentRowDto>> MapPaymentRows(
        IQueryable<MTransaction> query,
        CancellationToken cancellationToken)
    {
        return await query
            .OrderByDescending(t => t.PaymentDate)
            .ThenByDescending(t => t.TransactionId)
            .Take(200)
            .Select(t => new PaymentRowDto(
                t.TransactionId,
                t.Receipt != null ? t.Receipt.ReceiptNumber : null,
                t.Account != null ? t.Account.Profile.FirstName + " " + t.Account.Profile.LastName : null,
                t.PaymentMethod.Name,
                t.PaymentStatus.Name,
                t.Amount,
                t.PaymentDate,
                t.MpesaCode,
                t.ChequeNo,
                t.FeeType.Name,
                t.ReferenceNote))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<SubscriptionRowDto>> ListSubscriptionsAsync(int? year, CancellationToken cancellationToken)
    {
        var y = year ?? DateTime.UtcNow.Year;
        return await _db.Subscriptions.AsNoTracking()
            .Where(s => s.SubscriptionYear == y)
            .OrderBy(s => s.Account.MembershipNo)
            .Select(s => new SubscriptionRowDto(
                s.SubscriptionId, s.AccountId, s.Account.MembershipNo,
                s.Account.Profile.FirstName + " " + s.Account.Profile.LastName,
                s.SubscriptionYear, s.AmountDue, s.AmountPaid, s.ArrearsAmount,
                s.Status.Name, s.DueDate, s.PostedDate, s.RemovalDate))
            .ToListAsync(cancellationToken);
    }

    public async Task<int> RunPostingAsync(int year, long? actorUserId, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var postedStatus = await _db.MemberStatuses.FirstOrDefaultAsync(x => x.Code == "POSTED", cancellationToken);
        var removedStatus = await _db.MemberStatuses.FirstOrDefaultAsync(x => x.Code == "REMOVED", cancellationToken);
        var due = await _db.Subscriptions.Include(s => s.Account)
            .Where(s => s.SubscriptionYear == year && !s.WaivedFlag && s.AmountPaid < s.AmountDue)
            .ToListAsync(cancellationToken);

        var count = 0;
        foreach (var sub in due)
        {
            if (today >= new DateOnly(year, 4, 30) && removedStatus is not null)
            {
                sub.RemovalDate ??= today;
                sub.Account.CurrentMemberStatusId = removedStatus.MemberStatusId;
                sub.Account.IsActive = false;
                count++;
            }
            else if (today >= new DateOnly(year, 2, 28) && postedStatus is not null)
            {
                sub.PostedDate ??= today;
                sub.Account.CurrentMemberStatusId = postedStatus.MemberStatusId;
                count++;
            }

            if (sub.ArrearsAmount <= 0) sub.ArrearsAmount = sub.AmountDue - sub.AmountPaid;
            if (!await _db.Arrearses.AnyAsync(a => a.SubscriptionId == sub.SubscriptionId && a.Status == "OPEN", cancellationToken))
            {
                _db.Arrearses.Add(new Arrears
                {
                    AccountId = sub.AccountId,
                    SubscriptionId = sub.SubscriptionId,
                    OpenedDate = today,
                    Amount = sub.ArrearsAmount,
                    Status = "OPEN",
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = actorUserId
                });
            }
        }

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "Subscription",
            RecordId = year,
            Action = "UPDATE",
            NewValues = $"posting-run:{count}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return count;
    }
}
