using ClubManagement.Entities.Finance;
using ClubManagement.Entities.Subscriptions;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Finance;

public record AdvanceCreditHistoryDto(
    DateOnly? Date,
    string? Reference,
    string Description,
    decimal CreditCreated,
    decimal CreditUsed,
    decimal Remaining,
    string Owner);

public record AdvanceCreditSourceDto(
    long TransactionId,
    string? ReceiptNumber,
    DateOnly? PaymentDate,
    decimal OriginalPayment,
    decimal Allocated,
    decimal Remaining,
    string Owner,
    string? PaidBy,
    string Status);

public record AdvanceCreditPositionDto(
    long AccountId,
    string MemberName,
    string? MembershipNo,
    decimal Outstanding,
    decimal AvailableCredit,
    decimal CorporateCredit,
    string Status,
    decimal CreditCreated,
    decimal CreditUsed,
    decimal OriginalPayment,
    decimal Allocated,
    string? SourceReceipt,
    DateOnly? PaymentDate,
    string? PaidBy,
    IReadOnlyList<AdvanceCreditSourceDto> Sources,
    IReadOnlyList<AdvanceCreditHistoryDto> History);

public record ApplyCreditResult(
    long InvoiceId,
    decimal AmountApplied,
    decimal InvoiceOutstanding,
    decimal AvailableCredit);

public record AdvanceCreditReportRowDto(
    long? AccountId,
    long? CorporateCompanyId,
    string Name,
    string? ReferenceNo,
    decimal Credit,
    string? Source,
    DateOnly? Date,
    string Owner,
    string Status);

public record AdvanceCreditReportDto(
    decimal TotalMemberCredit,
    decimal TotalCorporateCredit,
    decimal CreditCreated,
    decimal CreditUsed,
    IReadOnlyList<AdvanceCreditReportRowDto> Members,
    IReadOnlyList<AdvanceCreditReportRowDto> Companies);

public record CorporateCreditPositionDto(
    long CorporateCompanyId,
    string CompanyName,
    string? Code,
    decimal Outstanding,
    decimal AvailableCredit,
    string Status,
    IReadOnlyList<AdvanceCreditReportRowDto> Accounts,
    IReadOnlyList<AdvanceCreditSourceDto> Sources,
    IReadOnlyList<AdvanceCreditHistoryDto> History);

public partial class PaymentAllocationService
{
    public async Task<AdvanceCreditPositionDto> GetAdvanceCreditPositionAsync(
        long accountId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var loaded = await LoadCreditFactsAsync([accountId], cancellationToken);
        var account = loaded.Accounts.FirstOrDefault(a => a.AccountId == accountId)
            ?? throw new InvalidOperationException("Member account was not found.");
        return BuildPosition(account, loaded);
    }

    public async Task<ApplyCreditResult> ApplyAvailableCreditAsync(
        long invoiceId,
        decimal? amount,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var invoice = await _db.MembershipInvoices
            .FirstOrDefaultAsync(i => i.InvoiceId == invoiceId, cancellationToken)
            ?? throw new InvalidOperationException("Invoice was not found.");

        var position = await GetAdvanceCreditPositionAsync(invoice.AccountId, cancellationToken);
        var sources = position.Sources
            .Where(s => s.Owner != "CORPORATE" && s.Remaining > 0.009m)
            .OrderBy(s => s.PaymentDate)
            .ThenBy(s => s.TransactionId)
            .ToList();
        var available = RoundMoney(sources.Sum(s => s.Remaining));
        if (available <= 0.009m)
            throw new InvalidOperationException("No available member credit to apply.");

        var outstanding = await InvoiceOpenBalanceAsync(invoice, cancellationToken);
        if (outstanding <= 0.009m)
            throw new InvalidOperationException("This invoice has no balance to apply credit to.");

        var requested = amount is null or <= 0 ? available : RoundMoney(amount.Value);
        var target = RoundMoney(Math.Min(requested, Math.Min(available, outstanding)));
        if (target <= 0.009m)
            throw new InvalidOperationException("Allocation amount must be greater than zero.");

        decimal applied = 0m;
        PaymentAllocationResult? last = null;
        foreach (var source in sources)
        {
            if (target <= 0.009m) break;
            var take = RoundMoney(Math.Min(target, source.Remaining));
            if (take <= 0.009m) continue;
            last = await AllocatePaymentToInvoiceAsync(
                source.TransactionId,
                invoice.InvoiceId,
                take,
                actorUserId,
                cancellationToken);
            applied += take;
            target = RoundMoney(target - take);
        }

        return new ApplyCreditResult(
            invoice.InvoiceId,
            RoundMoney(applied),
            last?.InvoiceOutstanding ?? outstanding,
            last?.AvailableCredit ?? 0m);
    }

    public async Task<AdvanceCreditReportDto> GetAdvanceCreditReportAsync(
        DateOnly? from,
        DateOnly? to,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var accountIds = await _db.Accounts.AsNoTracking()
            .Where(a => !a.IsDeleted)
            .Select(a => a.AccountId)
            .ToListAsync(cancellationToken);
        var loaded = await LoadCreditFactsAsync(accountIds, cancellationToken);
        var members = new List<AdvanceCreditReportRowDto>();
        var companyRows = new List<AdvanceCreditReportRowDto>();
        decimal memberTotal = 0m, corporateTotal = 0m, created = 0m, used = 0m;

        foreach (var account in loaded.Accounts)
        {
            var position = BuildPosition(account, loaded);
            created += position.History
                .Where(row => InRange(row.Date, from, to))
                .Sum(row => row.CreditCreated);
            used += position.History
                .Where(row => InRange(row.Date, from, to))
                .Sum(row => row.CreditUsed);

            var memberSources = position.Sources.Where(s => s.Owner != "CORPORATE" && s.Remaining > 0.009m).ToList();
            if (memberSources.Count > 0)
            {
                var credit = RoundMoney(memberSources.Sum(s => s.Remaining));
                var lead = memberSources.OrderByDescending(s => s.PaymentDate).First();
                memberTotal += credit;
                members.Add(new AdvanceCreditReportRowDto(
                    account.AccountId,
                    null,
                    account.Name,
                    account.MembershipNo,
                    credit,
                    lead.ReceiptNumber,
                    lead.PaymentDate,
                    "MEMBER",
                    position.Status));
            }

            var corporateSources = position.Sources.Where(s => s.Owner == "CORPORATE" && s.Remaining > 0.009m).ToList();
            if (corporateSources.Count > 0 && account.CorporateCompanyId is long companyId)
            {
                var credit = RoundMoney(corporateSources.Sum(s => s.Remaining));
                var lead = corporateSources.OrderByDescending(s => s.PaymentDate).First();
                corporateTotal += credit;
                var company = loaded.Companies.FirstOrDefault(c => c.CorporateCompanyId == companyId);
                companyRows.Add(new AdvanceCreditReportRowDto(
                    account.AccountId,
                    companyId,
                    company?.Name ?? account.Name,
                    company?.Code ?? account.MembershipNo,
                    credit,
                    lead.ReceiptNumber,
                    lead.PaymentDate,
                    "CORPORATE",
                    CreditStatus(credit, corporateSources.Sum(s => s.Allocated), corporateSources.Sum(s => s.OriginalPayment))));
            }
        }

        var companies = companyRows
            .GroupBy(row => row.CorporateCompanyId)
            .Select(group =>
            {
                var first = group.OrderByDescending(row => row.Date).First();
                var credit = RoundMoney(group.Sum(row => row.Credit));
                return new AdvanceCreditReportRowDto(
                    null,
                    group.Key,
                    first.Name,
                    first.ReferenceNo,
                    credit,
                    first.Source,
                    first.Date,
                    "CORPORATE",
                    credit > 0.009m ? "AVAILABLE" : "NO AVAILABLE CREDIT");
            })
            .OrderBy(row => row.Name)
            .ToList();

        return new AdvanceCreditReportDto(
            RoundMoney(memberTotal),
            RoundMoney(corporateTotal),
            RoundMoney(created),
            RoundMoney(used),
            members.OrderBy(row => row.Name).ToList(),
            companies);
    }

    public async Task<CorporateCreditPositionDto> GetCorporateCreditAsync(
        long companyId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var company = await _db.CorporateCompanies.AsNoTracking()
            .FirstOrDefaultAsync(c => c.CorporateCompanyId == companyId, cancellationToken)
            ?? throw new InvalidOperationException("Corporate company was not found.");
        var accountIds = await _db.Accounts.AsNoTracking()
            .Where(a => !a.IsDeleted && a.CorporateCompanyId == companyId)
            .Select(a => a.AccountId)
            .ToListAsync(cancellationToken);
        var loaded = await LoadCreditFactsAsync(accountIds, cancellationToken);
        var accounts = new List<AdvanceCreditReportRowDto>();
        var sources = new List<AdvanceCreditSourceDto>();
        var history = new List<AdvanceCreditHistoryDto>();
        decimal available = 0m, outstanding = 0m, created = 0m, used = 0m;
        foreach (var account in loaded.Accounts)
        {
            var position = BuildPosition(account, loaded);
            outstanding += position.Outstanding;
            var corporate = position.Sources.Where(s => s.Owner == "CORPORATE").ToList();
            var credit = RoundMoney(corporate.Sum(s => s.Remaining));
            available += credit;
            created += corporate.Sum(s => Math.Max(0m, s.OriginalPayment - s.Allocated));
            used += corporate.Sum(s => s.Allocated);
            if (credit > 0.009m)
            {
                var lead = corporate.OrderByDescending(s => s.PaymentDate).First();
                accounts.Add(new AdvanceCreditReportRowDto(
                    account.AccountId,
                    companyId,
                    account.Name,
                    account.MembershipNo,
                    credit,
                    lead.ReceiptNumber,
                    lead.PaymentDate,
                    "CORPORATE",
                    CreditStatus(credit, used, created)));
            }
            sources.AddRange(corporate);
            history.AddRange(position.History.Where(row => row.Owner == "CORPORATE"));
        }

        return new CorporateCreditPositionDto(
            company.CorporateCompanyId,
            company.Name,
            company.Code,
            RoundMoney(outstanding),
            RoundMoney(available),
            available <= 0.009m ? "NO AVAILABLE CREDIT" : CreditStatus(available, used, created + used),
            accounts,
            sources.OrderByDescending(s => s.PaymentDate).ToList(),
            history.OrderBy(row => row.Date).ToList());
    }

    private async Task<decimal> CreditRemainingOnTransactionAsync(
        long accountId,
        long transactionId,
        CancellationToken cancellationToken)
    {
        var position = await GetAdvanceCreditPositionAsync(accountId, cancellationToken);
        return RoundMoney(position.Sources
            .Where(s => s.TransactionId == transactionId)
            .Sum(s => s.Remaining));
    }

    private async Task<CreditFacts> LoadCreditFactsAsync(
        IReadOnlyCollection<long> accountIds,
        CancellationToken cancellationToken)
    {
        if (accountIds.Count == 0)
            return new CreditFacts([], [], [], [], [], [], []);

        var accounts = await _db.Accounts.AsNoTracking()
            .Where(a => accountIds.Contains(a.AccountId) && !a.IsDeleted)
            .Select(a => new CreditAccount(
                a.AccountId,
                ((a.Profile.FirstName ?? "") + " " + (a.Profile.LastName ?? "")).Trim(),
                a.MembershipNo,
                a.CorporateCompanyId,
                a.EntranceFeeWaivedFlag ? 0m : (a.EntranceFeeAmount ?? 0m)))
            .ToListAsync(cancellationToken);

        var subs = await _db.Subscriptions.AsNoTracking()
            .Where(s => accountIds.Contains(s.AccountId))
            .Select(s => new CreditDue(s.AccountId, s.SubscriptionYear, s.WaivedFlag ? 0m : s.AmountDue))
            .ToListAsync(cancellationToken);

        var payments = await _db.Transactions.AsNoTracking()
            .Where(t => t.AccountId != null && accountIds.Contains(t.AccountId.Value))
            .Select(t => new CreditPayment(
                t.TransactionId,
                t.AccountId!.Value,
                t.Amount,
                t.PaymentDate,
                t.CreatedAt,
                t.FeeType.Code,
                t.PaymentStatus.Code,
                t.CreditOwner,
                t.Receipt != null ? t.Receipt.ReceiptNumber : null))
            .ToListAsync(cancellationToken);

        var paymentIds = payments.Select(p => p.TransactionId).ToList();
        var uses = paymentIds.Count == 0
            ? new List<CreditUse>()
            : await (
                from allocation in _db.TransactionAllocations.AsNoTracking()
                join invoice in _db.MembershipInvoices.AsNoTracking() on allocation.InvoiceId equals invoice.InvoiceId
                where paymentIds.Contains(allocation.TransactionId)
                select new CreditUse(
                    allocation.TransactionId,
                    invoice.InvoiceId,
                    invoice.InvoiceNo,
                    invoice.Year,
                    allocation.Amount,
                    allocation.AllocatedAt)
            ).ToListAsync(cancellationToken);

        var awaiting = await _db.InvoiceCreditNotes.AsNoTracking()
            .Where(c => accountIds.Contains(c.AccountId))
            .GroupBy(c => c.AccountId)
            .Select(g => new CreditAwaiting(g.Key, g.Sum(x => x.AwaitingRefundAmount)))
            .ToListAsync(cancellationToken);

        var companyIds = accounts
            .Where(a => a.CorporateCompanyId != null)
            .Select(a => a.CorporateCompanyId!.Value)
            .Distinct()
            .ToList();
        var companies = companyIds.Count == 0
            ? new List<CreditCompany>()
            : await _db.CorporateCompanies.AsNoTracking()
                .Where(c => companyIds.Contains(c.CorporateCompanyId))
                .Select(c => new CreditCompany(c.CorporateCompanyId, c.Name, c.Code))
                .ToListAsync(cancellationToken);

        var invoicedYears = await _db.MembershipInvoices.AsNoTracking()
            .Where(i => accountIds.Contains(i.AccountId) && i.PublishedToMember)
            .Select(i => new CreditInvoiceYear(i.AccountId, i.Year))
            .ToListAsync(cancellationToken);

        return new CreditFacts(accounts, subs, payments, uses, awaiting, companies, invoicedYears);
    }

    private static AdvanceCreditPositionDto BuildPosition(CreditAccount account, CreditFacts facts)
    {
        var buckets = new List<CreditBucket>();
        if (account.JoiningDue > 0.009m)
            buckets.Add(new CreditBucket(0, account.JoiningDue));
        foreach (var due in facts.Dues.Where(s => s.AccountId == account.AccountId && s.Amount > 0.009m).OrderBy(s => s.Year))
            buckets.Add(new CreditBucket(due.Year, due.Amount));

        var uses = facts.Uses.ToLookup(u => u.TransactionId);
        var invoicedYears = facts.InvoicedYears
            .Where(y => y.AccountId == account.AccountId)
            .Select(y => y.Year)
            .ToHashSet();
        var sources = new List<OpenCredit>();
        var history = new List<AdvanceCreditHistoryDto>();
        decimal runningCredit = 0m;

        var payments = facts.Payments
            .Where(p => p.AccountId == account.AccountId)
            .OrderBy(p => p.PaymentDate ?? DateOnly.FromDateTime(p.CreatedAt))
            .ThenBy(p => p.TransactionId)
            .ToList();

        foreach (var payment in payments)
        {
            var when = payment.PaymentDate ?? DateOnly.FromDateTime(payment.CreatedAt);
            var owner = string.Equals(payment.CreditOwner, "CORPORATE", StringComparison.OrdinalIgnoreCase)
                ? "CORPORATE"
                : "MEMBER";
            var status = (payment.StatusCode ?? "").Trim().ToUpperInvariant();
            var moneyOut = status is "REFUNDED" or "REVERSED" || payment.Amount < 0;
            var moneyIn = !moneyOut
                && payment.Amount > 0
                && status is "PAID" or "WAIVED" or "PARTIALLY_PAID" or "SETTLED";
            if (!moneyIn && !moneyOut) continue;

            if (moneyOut)
            {
                var left = RoundMoney(Math.Abs(payment.Amount));
                foreach (var source in sources.Where(s => s.Owner == owner && s.Remaining > 0.009m))
                {
                    if (left <= 0.009m) break;
                    var take = Math.Min(left, source.Remaining);
                    source.Remaining = RoundMoney(source.Remaining - take);
                    source.Refunded += take;
                    left = RoundMoney(left - take);
                    runningCredit = RoundMoney(runningCredit - take);
                    history.Add(new AdvanceCreditHistoryDto(
                        when,
                        payment.ReceiptNumber,
                        "Credit refunded",
                        0m,
                        take,
                        Math.Max(0m, runningCredit),
                        owner));
                }
                continue;
            }

            var reserved = uses[payment.TransactionId].ToList();
            var reservedTotal = RoundMoney(reserved.Sum(u => u.Amount));
            var auto = RoundMoney(Math.Max(0m, payment.Amount - reservedTotal));
            var fee = (payment.FeeCode ?? "").Trim().ToUpperInvariant();
            var annual = fee is "ANNUAL" or "SUBSCRIPTION" or "ANNUAL_SUBSCRIPTION";
            var joining = fee is "JOINING" or "ENTRANCE";
            decimal appliedToBuckets = 0m;
            if (annual || joining)
            {
                foreach (var bucket in buckets)
                {
                    if (auto <= 0.009m) break;
                    if (joining && bucket.Year != 0) continue;
                    if (annual && (bucket.Year == 0 || bucket.Year > when.Year)) continue;
                    // Published invoice years are filled by allocation rows, not by this remainder.
                    if (annual && invoicedYears.Contains(bucket.Year)) continue;
                    var room = Math.Max(0m, bucket.Due - bucket.Paid);
                    var take = Math.Min(room, auto);
                    if (take <= 0) continue;
                    bucket.Paid += take;
                    appliedToBuckets += take;
                    auto = RoundMoney(auto - take);
                }
            }

            var creditBorn = fee == "ADVANCE"
                ? RoundMoney(payment.Amount)
                : annual || joining
                    ? RoundMoney(Math.Max(0m, auto - appliedToBuckets))
                    : 0m;
            if (creditBorn > 0.009m)
            {
                runningCredit = RoundMoney(runningCredit + creditBorn);
                sources.Add(new OpenCredit
                {
                    TransactionId = payment.TransactionId,
                    Receipt = payment.ReceiptNumber,
                    Date = when,
                    OriginalPayment = RoundMoney(payment.Amount),
                    AppliedToDues = RoundMoney(payment.Amount - creditBorn),
                    Created = creditBorn,
                    Remaining = creditBorn,
                    Owner = owner
                });
                history.Add(new AdvanceCreditHistoryDto(
                    when,
                    payment.ReceiptNumber,
                    "Excess payment",
                    creditBorn,
                    0m,
                    Math.Max(0m, runningCredit),
                    owner));
            }

            if (reservedTotal > 0.009m)
            {
                var source = sources.LastOrDefault(s => s.TransactionId == payment.TransactionId);
                var reducesAdvanceCredit = fee == "ADVANCE";
                foreach (var use in reserved)
                {
                    var bucket = buckets.FirstOrDefault(b => b.Year == use.Year);
                    if (bucket is not null)
                        bucket.Paid = Math.Min(bucket.Due, bucket.Paid + use.Amount);
                    if (source is not null && reducesAdvanceCredit)
                    {
                        source.Remaining = RoundMoney(Math.Max(0m, source.Remaining - use.Amount));
                        runningCredit = RoundMoney(Math.Max(0m, runningCredit - use.Amount));
                    }
                    history.Add(new AdvanceCreditHistoryDto(
                        DateOnly.FromDateTime(use.AllocatedAt),
                        use.InvoiceNo,
                        "Applied to invoice",
                        0m,
                        RoundMoney(use.Amount),
                        Math.Max(0m, runningCredit),
                        owner));
                }
            }
        }

        var awaiting = facts.Awaiting.FirstOrDefault(a => a.AccountId == account.AccountId)?.Amount ?? 0m;
        if (awaiting > 0.009m)
        {
            runningCredit = RoundMoney(runningCredit + awaiting);
            sources.Add(new OpenCredit
            {
                TransactionId = 0,
                Receipt = null,
                Date = DateOnly.FromDateTime(DateTime.UtcNow),
                OriginalPayment = RoundMoney(awaiting),
                AppliedToDues = 0m,
                Created = RoundMoney(awaiting),
                Remaining = RoundMoney(awaiting),
                Owner = "MEMBER"
            });
            history.Add(new AdvanceCreditHistoryDto(
                DateOnly.FromDateTime(DateTime.UtcNow),
                null,
                "Credit note awaiting refund",
                RoundMoney(awaiting),
                0m,
                Math.Max(0m, runningCredit),
                "MEMBER"));
        }

        var memberSources = sources.Where(s => s.Owner != "CORPORATE").ToList();
        var corporateSources = sources.Where(s => s.Owner == "CORPORATE").ToList();
        var memberAvailable = RoundMoney(memberSources.Sum(s => s.Remaining));
        var corporateAvailable = RoundMoney(corporateSources.Sum(s => s.Remaining));
        var memberCreated = RoundMoney(memberSources.Sum(s => s.Created));
        var memberUsed = RoundMoney(memberSources.Sum(s => s.Created - s.Remaining));
        var lead = memberSources.Where(s => s.Remaining > 0.009m).OrderByDescending(s => s.Date).FirstOrDefault()
            ?? memberSources.OrderByDescending(s => s.Date).FirstOrDefault();
        var outstanding = RoundMoney(buckets.Sum(b => Math.Max(0m, b.Due - b.Paid)));
        var name = string.IsNullOrWhiteSpace(account.Name) ? account.MembershipNo ?? "Member" : account.Name;

        return new AdvanceCreditPositionDto(
            account.AccountId,
            name,
            account.MembershipNo,
            outstanding,
            memberAvailable,
            corporateAvailable,
            CreditStatus(memberAvailable, memberUsed, memberCreated),
            memberCreated,
            memberUsed,
            lead?.OriginalPayment ?? 0m,
            lead?.AppliedToDues ?? 0m,
            lead?.Receipt,
            lead?.Date,
            name,
            sources.Where(s => s.TransactionId > 0).Select(ToSource).ToList(),
            history.OrderBy(row => row.Date).ToList());
    }

    private static AdvanceCreditSourceDto ToSource(OpenCredit source)
    {
        var status = source.Refunded > 0.009m && source.Remaining <= 0.009m
            ? "REFUNDED"
            : CreditStatus(source.Remaining, source.Created - source.Remaining, source.Created);
        return new AdvanceCreditSourceDto(
            source.TransactionId,
            source.Receipt,
            source.Date,
            source.OriginalPayment,
            source.AppliedToDues,
            source.Remaining,
            source.Owner,
            null,
            status);
    }

    private static string CreditStatus(decimal available, decimal used, decimal created)
    {
        if (available <= 0.009m && used <= 0.009m && created <= 0.009m)
            return "NO AVAILABLE CREDIT";
        if (available <= 0.009m)
            return "FULLY USED";
        if (used > 0.009m)
            return "PARTIALLY USED";
        return "AVAILABLE";
    }

    private static bool InRange(DateOnly? date, DateOnly? from, DateOnly? to)
    {
        if (date is null) return from is null && to is null;
        if (from is DateOnly start && date.Value < start) return false;
        if (to is DateOnly end && date.Value > end) return false;
        return true;
    }

    private sealed class CreditBucket(int year, decimal due)
    {
        public int Year { get; } = year;
        public decimal Due { get; } = due;
        public decimal Paid { get; set; }
    }

    private sealed class OpenCredit
    {
        public long TransactionId { get; set; }
        public string? Receipt { get; set; }
        public DateOnly Date { get; set; }
        public decimal OriginalPayment { get; set; }
        public decimal AppliedToDues { get; set; }
        public decimal Created { get; set; }
        public decimal Remaining { get; set; }
        public decimal Refunded { get; set; }
        public string Owner { get; set; } = "MEMBER";
    }

    private sealed record CreditAccount(
        long AccountId,
        string Name,
        string? MembershipNo,
        long? CorporateCompanyId,
        decimal JoiningDue);

    private sealed record CreditDue(long AccountId, int Year, decimal Amount);

    private sealed record CreditPayment(
        long TransactionId,
        long AccountId,
        decimal Amount,
        DateOnly? PaymentDate,
        DateTime CreatedAt,
        string? FeeCode,
        string? StatusCode,
        string? CreditOwner,
        string? ReceiptNumber);

    private sealed record CreditUse(
        long TransactionId,
        long InvoiceId,
        string InvoiceNo,
        int Year,
        decimal Amount,
        DateTime AllocatedAt);

    private sealed record CreditAwaiting(long AccountId, decimal Amount);

    private sealed record CreditCompany(long CorporateCompanyId, string Name, string Code);

    private sealed record CreditInvoiceYear(long AccountId, int Year);

    private sealed record CreditFacts(
        IReadOnlyList<CreditAccount> Accounts,
        IReadOnlyList<CreditDue> Dues,
        IReadOnlyList<CreditPayment> Payments,
        IReadOnlyList<CreditUse> Uses,
        IReadOnlyList<CreditAwaiting> Awaiting,
        IReadOnlyList<CreditCompany> Companies,
        IReadOnlyList<CreditInvoiceYear> InvoicedYears);
}
