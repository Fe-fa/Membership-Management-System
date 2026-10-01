using System.Data;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Finance;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Subscriptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClubManagement.Services.Finance;

public record ReceiveAdvancePaymentRequest(
    long MemberId,
    decimal Amount,
    long PaymentMethodId,
    DateOnly? PaymentDate = null,
    string? ReferenceNote = null,
    string? MpesaCode = null,
    string? ChequeNo = null,
    string? ChequeBankName = null,
    string? ChequeBankCode = null,
    DateOnly? ChequeDate = null);

public record AdvancePaymentResult(
    long TransactionId,
    long MemberId,
    decimal Amount,
    decimal AvailableCredit,
    string? ReceiptNumber,
    string StatusCode);

public record AllocateInvoicePaymentRequest(long TransactionId, decimal Amount);

public record ApplyCreditRequest(decimal? Amount);

public record PaymentAllocationResult(
    long AllocationId,
    long TransactionId,
    long InvoiceId,
    decimal AmountAllocated,
    decimal TransactionUnallocated,
    decimal InvoiceOutstanding,
    decimal AvailableCredit);

public record AnnualBillingRunResult(
    int Year,
    int InvoicesIssued,
    int CreditsApplied,
    decimal AmountApplied);

public record MemberInvoiceBalanceDto(
    long InvoiceId,
    string InvoiceNo,
    int Year,
    decimal InvoiceAmount,
    decimal PaidApplied,
    decimal OutstandingBalance,
    string Status);

public record MemberFinancialSummaryDto(
    long MemberId,
    decimal InvoiceAmount,
    decimal PaidApplied,
    decimal OutstandingBalance,
    decimal AvailableCredit,
    IReadOnlyList<MemberInvoiceBalanceDto> Invoices,
    string AccountStatus = "UNPAID");

public interface IPaymentAllocationService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);

    /// <summary>Records money received and leaves it unallocated. Does not change any invoice.</summary>
    Task<AdvancePaymentResult> ReceiveAdvancePaymentAsync(
        ReceiveAdvancePaymentRequest request,
        long? actorUserId,
        CancellationToken cancellationToken);

    /// <summary>
    /// Applies part of an existing receipt to one invoice.
    /// The receipt amount is never reduced.
    /// </summary>
    Task<PaymentAllocationResult> AllocatePaymentToInvoiceAsync(
        long transactionId,
        long invoiceId,
        decimal amountToAllocate,
        long? actorUserId,
        CancellationToken cancellationToken);

    /// <summary>
    /// Issues the year's membership invoices. Unallocated receipts are applied
    /// to those invoices automatically, oldest invoice first. Any remainder stays as credit.
    /// </summary>
    Task<AnnualBillingRunResult> ProcessAnnualBillingRunAsync(
        int year,
        long? actorUserId,
        CancellationToken cancellationToken);

    Task<MemberFinancialSummaryDto> GetFinancialSummaryAsync(long memberId, CancellationToken cancellationToken);

    /// <summary>Unallocated advance receipts, plus subscription overpayment and refunds waiting to be used.</summary>
    Task<decimal> GetAvailableCreditAsync(long accountId, CancellationToken cancellationToken);

    Task<decimal> GetUnallocatedAdvanceAsync(long accountId, CancellationToken cancellationToken);

    /// <summary>Advance receipts that still have money which has not been applied to an invoice.</summary>
    Task<AdvanceCreditPageDto> ListUnusedAdvancesAsync(
        string? search,
        int? year,
        int page,
        int pageSize,
        CancellationToken cancellationToken);

    Task<AdvanceCreditPositionDto> GetAdvanceCreditPositionAsync(long accountId, CancellationToken cancellationToken);

    /// <summary>
    /// Applies existing member credit to an invoice. Does not create a second payment.
    /// </summary>
    Task<ApplyCreditResult> ApplyAvailableCreditAsync(
        long invoiceId,
        decimal? amount,
        long? actorUserId,
        CancellationToken cancellationToken);

    Task<AdvanceCreditReportDto> GetAdvanceCreditReportAsync(
        DateOnly? from,
        DateOnly? to,
        CancellationToken cancellationToken);

    Task<CorporateCreditPositionDto> GetCorporateCreditAsync(long companyId, CancellationToken cancellationToken);
}

public record AdvanceCreditRowDto(
    long TransactionId,
    long? AccountId,
    string? MemberName,
    string? MembershipNo,
    string? Method,
    string? ReceiptNumber,
    DateOnly? PaymentDate,
    decimal AmountReceived,
    decimal AmountUsed,
    decimal AmountAvailable,
    string? Status,
    string? ReferenceNote);

public record AdvanceCreditPageDto(
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages,
    decimal TotalReceived,
    decimal TotalUsed,
    decimal TotalAvailable,
    IReadOnlyList<AdvanceCreditRowDto> Items);

public partial class PaymentAllocationService : IPaymentAllocationService
{
    private const string AdvanceFeeCode = "ADVANCE";
    private static readonly string[] RecognizedStatuses = ["PAID", "WAIVED", "PARTIALLY_PAID", "SETTLED"];
    private static int _schemaReady;

    private readonly ApplicationModuleDbContext _db;
    private readonly IFinanceService _finance;
    private readonly ILogger<PaymentAllocationService> _logger;

    public PaymentAllocationService(
        ApplicationModuleDbContext db,
        IFinanceService finance,
        ILogger<PaymentAllocationService> logger)
    {
        _db = db;
        _finance = finance;
        _logger = logger;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        if (Volatile.Read(ref _schemaReady) == 1) return;

        // Idempotent. BIGINT matches Membership_invoice.invoice_id and MTransaction.transaction_id.
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.MTransaction', N'invoice_id') IS NULL
    ALTER TABLE dbo.MTransaction ADD invoice_id BIGINT NULL;
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_MTransaction_invoice_id' AND object_id = OBJECT_ID(N'dbo.MTransaction'))
    CREATE NONCLUSTERED INDEX IX_MTransaction_invoice_id
        ON dbo.MTransaction(invoice_id) WHERE invoice_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_MTransaction_Membership_invoice')
AND OBJECT_ID(N'dbo.Membership_invoice', N'U') IS NOT NULL
    ALTER TABLE dbo.MTransaction ADD CONSTRAINT FK_MTransaction_Membership_invoice
        FOREIGN KEY (invoice_id) REFERENCES dbo.Membership_invoice(invoice_id);
IF OBJECT_ID(N'dbo.MTransactionAllocation', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MTransactionAllocation (
        allocation_id BIGINT IDENTITY(1,1) NOT NULL,
        transaction_id BIGINT NOT NULL,
        invoice_id BIGINT NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        allocated_at DATETIME2(7) NOT NULL CONSTRAINT DF_MTransactionAllocation_allocated_at DEFAULT (SYSUTCDATETIME()),
        allocated_by_user_id BIGINT NULL,
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_MTransactionAllocation_created_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_MTransactionAllocation PRIMARY KEY CLUSTERED (allocation_id),
        CONSTRAINT CK_MTransactionAllocation_amount CHECK (amount > 0),
        CONSTRAINT FK_MTransactionAllocation_MTransaction FOREIGN KEY (transaction_id) REFERENCES dbo.MTransaction(transaction_id),
        CONSTRAINT FK_MTransactionAllocation_Membership_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.Membership_invoice(invoice_id)
    );
    CREATE NONCLUSTERED INDEX IX_MTransactionAllocation_transaction_id ON dbo.MTransactionAllocation(transaction_id);
    CREATE NONCLUSTERED INDEX IX_MTransactionAllocation_invoice_id ON dbo.MTransactionAllocation(invoice_id);
END
IF COL_LENGTH(N'dbo.MTransactionAllocation', N'allocated_by_user_id') IS NULL
    ALTER TABLE dbo.MTransactionAllocation ADD allocated_by_user_id BIGINT NULL;
IF COL_LENGTH(N'dbo.MTransactionAllocation', N'created_at') IS NULL
    ALTER TABLE dbo.MTransactionAllocation ADD created_at DATETIME2(7) NOT NULL CONSTRAINT DF_MTransactionAllocation_created_at DEFAULT (SYSUTCDATETIME());
IF COL_LENGTH(N'dbo.MTransactionAllocation', N'allocated_at') IS NULL
    ALTER TABLE dbo.MTransactionAllocation ADD allocated_at DATETIME2(7) NOT NULL CONSTRAINT DF_MTransactionAllocation_allocated_at DEFAULT (SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.Fee_type WHERE code = N'ADVANCE')
    INSERT INTO dbo.Fee_type (code, name, sort_order, is_active, created_at)
    VALUES (N'ADVANCE', N'Advance payment / credit', 55, 1, SYSUTCDATETIME());
IF COL_LENGTH(N'dbo.MTransaction', N'credit_owner') IS NULL
    ALTER TABLE dbo.MTransaction ADD credit_owner NVARCHAR(20) NULL;
", cancellationToken);

        Volatile.Write(ref _schemaReady, 1);
    }

    public async Task<AdvancePaymentResult> ReceiveAdvancePaymentAsync(
        ReceiveAdvancePaymentRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var amount = RoundMoney(request.Amount);
        if (amount <= 0)
            throw new InvalidOperationException("Advance payment amount must be greater than zero.");

        var account = await ResolveAccountAsync(request.MemberId, cancellationToken);
        var method = await _db.PaymentMethods.AsNoTracking()
            .FirstOrDefaultAsync(x => x.PaymentMethodId == request.PaymentMethodId && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("Payment method was not found.");

        var methodCode = NormalizeCode(method.Code);
        if (methodCode is "CHEQUE" or "CHEQUE_PAYMENT" && string.IsNullOrWhiteSpace(request.ChequeNo))
            throw new InvalidOperationException("A cheque advance requires a cheque number.");

        var statusCode = methodCode is "CHEQUE" or "CHEQUE_PAYMENT" or "CARD" or "CREDIT" or "CREDIT_CARD" or "CREDITCARD"
            ? "PENDING"
            : "PAID";
        var status = await _db.PaymentStatuses
            .FirstOrDefaultAsync(x => x.Code == statusCode, cancellationToken)
            ?? await _db.PaymentStatuses.FirstAsync(x => x.Code == "PAID", cancellationToken);

        var fee = await _db.FeeTypes.FirstOrDefaultAsync(x => x.Code == AdvanceFeeCode, cancellationToken)
            ?? throw new InvalidOperationException("Advance fee type is not configured.");

        var paymentDate = request.PaymentDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var note = string.IsNullOrWhiteSpace(request.ReferenceNote)
            ? "Advance payment — unallocated"
            : request.ReferenceNote.Trim();

        // invoice_id stays null: this receipt is credit until an allocation row is written.
        var tx = new MTransaction
        {
            AccountId = account.AccountId,
            ProfileId = account.ProfileId,
            SubscriptionId = null,
            InvoiceId = null,
            FeeTypeId = fee.FeeTypeId,
            PaymentMethodId = method.PaymentMethodId,
            PaymentStatusId = status.PaymentStatusId,
            Amount = amount,
            PaymentDate = paymentDate,
            ChequeNo = request.ChequeNo?.Trim(),
            ChequeBankName = request.ChequeBankName?.Trim(),
            ChequeBankCode = request.ChequeBankCode?.Trim(),
            ChequeDate = request.ChequeDate,
            MpesaCode = request.MpesaCode?.Trim(),
            ReferenceNote = note,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };

        await using var dbTx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        _db.Transactions.Add(tx);
        await _db.SaveChangesAsync(cancellationToken);

        string? receiptNo = null;
        if (RecognizedStatuses.Contains(status.Code, StringComparer.OrdinalIgnoreCase))
        {
            receiptNo = $"RCT-{tx.TransactionId:D6}";
            var receipt = new MReceiptMaster
            {
                TransactionId = tx.TransactionId,
                ReceiptNumber = receiptNo,
                Amount = amount,
                IssuedDate = paymentDate,
                IssuedByUserId = actorUserId,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.Receipts.Add(receipt);
            await _db.SaveChangesAsync(cancellationToken);
            tx.ReceiptId = receipt.ReceiptId;
        }

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransaction",
            RecordId = tx.TransactionId,
            Action = "INSERT",
            NewValues = $"advance; account={account.AccountId}; amount={amount}; status={status.Code}; invoice_id=NULL",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        await dbTx.CommitAsync(cancellationToken);

        var available = await GetAvailableCreditAsync(account.AccountId, cancellationToken);
        return new AdvancePaymentResult(
            tx.TransactionId,
            account.AccountId,
            amount,
            available,
            receiptNo,
            status.Code);
    }

    public async Task<PaymentAllocationResult> AllocatePaymentToInvoiceAsync(
        long transactionId,
        long invoiceId,
        decimal amountToAllocate,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var amount = RoundMoney(amountToAllocate);
        if (amount <= 0)
            throw new InvalidOperationException("Allocation amount must be greater than zero.");

        await using var dbTx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        var payment = await _db.Transactions
            .Include(t => t.PaymentStatus)
            .FirstOrDefaultAsync(t => t.TransactionId == transactionId, cancellationToken)
            ?? throw new InvalidOperationException("Payment was not found.");

        if (payment.AccountId is not long accountId)
            throw new InvalidOperationException("Only member receipts can be allocated to an invoice.");
        if (payment.Amount <= 0)
            throw new InvalidOperationException("A reversal or refund cannot be allocated.");
        if (!RecognizedStatuses.Contains(payment.PaymentStatus?.Code ?? "", StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only cleared payments can be allocated. Pending receipts stay unapplied until finance confirms them.");

        var invoice = await _db.MembershipInvoices
            .FirstOrDefaultAsync(i => i.InvoiceId == invoiceId, cancellationToken)
            ?? throw new InvalidOperationException("Invoice was not found.");
        if (invoice.AccountId != accountId)
            throw new InvalidOperationException("The payment and the invoice belong to different members.");

        var alreadyAllocated = await SumAllocationsForTransactionAsync(transactionId, cancellationToken);
        var bookUnallocated = RoundMoney(payment.Amount - alreadyAllocated);
        var creditLeft = await CreditRemainingOnTransactionAsync(accountId, transactionId, cancellationToken);
        var unallocated = RoundMoney(Math.Min(bookUnallocated, creditLeft));
        if (amount > unallocated + 0.009m)
            throw new InvalidOperationException(
                $"Only {unallocated:0.00} remains unallocated on this receipt. The original amount {payment.Amount:0.00} is left unchanged.");

        var invoiceOutstanding = await InvoiceOpenBalanceAsync(invoice, cancellationToken);
        if (amount > invoiceOutstanding + 0.009m)
            throw new InvalidOperationException(
                $"Invoice {invoice.InvoiceNo} has {invoiceOutstanding:0.00} outstanding. Allocation cannot exceed the remaining balance.");

        var allocation = new MTransactionAllocation
        {
            TransactionId = payment.TransactionId,
            InvoiceId = invoice.InvoiceId,
            Amount = amount,
            AllocatedAt = DateTime.UtcNow,
            AllocatedByUserId = actorUserId,
            CreatedAt = DateTime.UtcNow
        };
        _db.TransactionAllocations.Add(allocation);

        // Receipt amount is the money received. Allocation never rewrites it.
        var covered = RoundMoney(invoice.Amount - (invoiceOutstanding - amount));
        invoice.Status = covered + 0.009m >= invoice.Amount
            ? "PAID"
            : covered > 0.009m ? "PARTIAL" : invoice.Status;

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransactionAllocation",
            RecordId = payment.TransactionId,
            Action = "INSERT",
            NewValues = $"transaction={payment.TransactionId}; invoice={invoice.InvoiceId}; amount={amount}; receipt_amount={payment.Amount}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        // Fold the applied advance into the existing dues waterfall without touching the receipt.
        await _finance.ReconcileAccountDuesAsync(accountId, cancellationToken);
        await dbTx.CommitAsync(cancellationToken);

        var transactionLeft = RoundMoney(unallocated - amount);
        var invoiceLeft = await InvoiceOpenBalanceAsync(invoice, cancellationToken);
        var available = await GetAvailableCreditAsync(accountId, cancellationToken);
        return new PaymentAllocationResult(
            allocation.AllocationId,
            payment.TransactionId,
            invoice.InvoiceId,
            amount,
            transactionLeft,
            invoiceLeft,
            available);
    }

    public async Task<AnnualBillingRunResult> ProcessAnnualBillingRunAsync(
        int year,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        if (year < 2000 || year > 2100)
            throw new InvalidOperationException("Billing year is not valid.");

        var accountIds = await _db.Subscriptions.AsNoTracking()
            .Where(s => s.SubscriptionYear == year && s.Account.IsActive && !s.Account.IsDeleted)
            .Select(s => s.AccountId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var issued = 0;
        foreach (var accountId in accountIds)
        {
            try
            {
                await _finance.IssueSubscriptionInvoiceAsync(
                    accountId,
                    year,
                    sendEmail: false,
                    actorUserId,
                    cancellationToken,
                    publishToMember: true);
                issued++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Annual billing skipped account {AccountId} for {Year}", accountId, year);
            }
        }

        return new AnnualBillingRunResult(year, issued, 0, 0m);
    }

    public async Task<MemberFinancialSummaryDto> GetFinancialSummaryAsync(
        long memberId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var account = await ResolveAccountAsync(memberId, cancellationToken);
        var invoices = await _db.MembershipInvoices.AsNoTracking()
            .Where(i => i.AccountId == account.AccountId)
            .OrderByDescending(i => i.Year)
            .ThenByDescending(i => i.InvoiceId)
            .ToListAsync(cancellationToken);

        var lines = new List<MemberInvoiceBalanceDto>(invoices.Count);
        foreach (var invoice in invoices)
        {
            var outstanding = await InvoiceOpenBalanceAsync(invoice, cancellationToken);
            var applied = RoundMoney(invoice.Amount - outstanding);
            lines.Add(new MemberInvoiceBalanceDto(
                invoice.InvoiceId,
                invoice.InvoiceNo,
                invoice.Year,
                invoice.Amount,
                applied,
                outstanding,
                outstanding <= 0.009m ? "PAID" : applied > 0.009m ? "PARTIAL" : invoice.Status));
        }

        var invoiceAmount = RoundMoney(lines.Sum(x => x.InvoiceAmount));
        var paidApplied = RoundMoney(lines.Sum(x => x.PaidApplied));
        var outstandingBalance = RoundMoney(lines.Sum(x => x.OutstandingBalance));
        var available = await GetAvailableCreditAsync(account.AccountId, cancellationToken);
        var accountStatus = outstandingBalance > 0.009m
            ? paidApplied > 0.009m ? "PARTIALLY_PAID" : "UNPAID"
            : available > 0.009m ? "ADVANCE_CREDIT" : "PAID";
        return new MemberFinancialSummaryDto(
            account.AccountId,
            invoiceAmount,
            paidApplied,
            outstandingBalance,
            available,
            lines,
            accountStatus);
    }

    public async Task<decimal> GetAvailableCreditAsync(long accountId, CancellationToken cancellationToken)
    {
        var position = await GetAdvanceCreditPositionAsync(accountId, cancellationToken);
        return position.AvailableCredit;
    }

    public async Task<decimal> GetUnallocatedAdvanceAsync(long accountId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var credits = await LoadUnallocatedAdvancesAsync(accountId, cancellationToken);
        return RoundMoney(credits.Sum(c => c.Unallocated));
    }

    public async Task<AdvanceCreditPageDto> ListUnusedAdvancesAsync(
        string? search,
        int? year,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        if (page < 1) page = 1;
        if (pageSize is < 1 or > 200) pageSize = 25;

        var query = _db.Transactions.AsNoTracking()
            .Where(t =>
                t.Amount > 0
                && (t.FeeType.Code == AdvanceFeeCode
                    || t.FeeType.Code == "ANNUAL"
                    || t.FeeType.Code == "SUBSCRIPTION"
                    || t.FeeType.Code == "ANNUAL_SUBSCRIPTION")
                && RecognizedStatuses.Contains(t.PaymentStatus.Code));
        if (year is int billYear)
            query = query.Where(t => t.PaymentDate != null && t.PaymentDate.Value.Year == billYear);

        var rows = await query
            .OrderByDescending(t => t.PaymentDate)
            .ThenByDescending(t => t.TransactionId)
            .Select(t => new
            {
                t.TransactionId,
                t.AccountId,
                t.Amount,
                t.PaymentDate,
                FeeCode = t.FeeType.Code,
                t.ReferenceNote,
                Status = t.PaymentStatus.Code,
                Method = t.PaymentMethod.Name,
                MembershipNo = t.Account != null ? t.Account.MembershipNo : null,
                First = t.Account != null && t.Account.Profile != null
                    ? t.Account.Profile.FirstName
                    : t.Profile != null ? t.Profile.FirstName : null,
                Last = t.Account != null && t.Account.Profile != null
                    ? t.Account.Profile.LastName
                    : t.Profile != null ? t.Profile.LastName : null,
            })
            .ToListAsync(cancellationToken);

        var ids = rows.Select(r => r.TransactionId).ToList();
        var allocatedById = ids.Count == 0
            ? new Dictionary<long, decimal>()
            : (await _db.TransactionAllocations.AsNoTracking()
                .Where(a => ids.Contains(a.TransactionId))
                .GroupBy(a => a.TransactionId)
                .Select(g => new { TransactionId = g.Key, Amount = g.Sum(x => x.Amount) })
                .ToListAsync(cancellationToken))
                .ToDictionary(x => x.TransactionId, x => x.Amount);
        var receiptById = ids.Count == 0
            ? new Dictionary<long, string>()
            : (await _db.Receipts.AsNoTracking()
                .Where(r => ids.Contains(r.TransactionId))
                .Select(r => new { r.TransactionId, r.ReceiptNumber })
                .ToListAsync(cancellationToken))
                .GroupBy(r => r.TransactionId)
                .ToDictionary(g => g.Key, g => g.First().ReceiptNumber);

        var accountIds = rows.Where(r => r.AccountId != null).Select(r => r.AccountId!.Value).Distinct().ToList();
        var invoicedYears = accountIds.Count == 0
            ? []
            : await _db.MembershipInvoices.AsNoTracking()
                .Where(i => accountIds.Contains(i.AccountId) && i.PublishedToMember)
                .Select(i => new { i.AccountId, i.Year })
                .ToListAsync(cancellationToken);
        var invoiced = invoicedYears.Select(i => (i.AccountId, i.Year)).ToHashSet();
        var legacyPaid = accountIds.Count == 0
            ? []
            : await _db.Subscriptions.AsNoTracking()
                .Where(s => accountIds.Contains(s.AccountId) && !s.WaivedFlag)
                .Select(s => new { s.AccountId, s.SubscriptionYear, s.AmountPaid })
                .ToListAsync(cancellationToken);
        var legacyRoom = legacyPaid
            .Where(s => s.AccountId > 0 && !invoiced.Contains((s.AccountId, s.SubscriptionYear)))
            .GroupBy(s => s.AccountId)
            .ToDictionary(g => g.Key, g => g.Sum(s => Math.Max(0m, s.AmountPaid)));
        var availableByTx = new Dictionary<long, decimal>();
        foreach (var group in rows.Where(r => r.AccountId != null).GroupBy(r => r.AccountId!.Value))
        {
            legacyRoom.TryGetValue(group.Key, out var room);
            foreach (var row in group.OrderBy(r => r.PaymentDate).ThenBy(r => r.TransactionId))
            {
                allocatedById.TryGetValue(row.TransactionId, out var used);
                var raw = RoundMoney(Math.Max(0m, row.Amount - Math.Min(used, row.Amount)));
                var annual = row.FeeCode is "ANNUAL" or "SUBSCRIPTION" or "ANNUAL_SUBSCRIPTION";
                if (annual)
                {
                    var legacyTake = Math.Min(raw, Math.Max(0m, room));
                    room -= legacyTake;
                    availableByTx[row.TransactionId] = RoundMoney(raw - legacyTake);
                }
                else
                    availableByTx[row.TransactionId] = raw;
            }
        }

        var mapped = rows.Select(r =>
        {
            allocatedById.TryGetValue(r.TransactionId, out var used);
            used = RoundMoney(Math.Min(Math.Max(0, used), r.Amount));
            receiptById.TryGetValue(r.TransactionId, out var receipt);
            availableByTx.TryGetValue(r.TransactionId, out var available);
            var name = $"{r.First} {r.Last}".Trim();
            return new AdvanceCreditRowDto(
                r.TransactionId,
                r.AccountId,
                string.IsNullOrWhiteSpace(name) ? null : name,
                r.MembershipNo,
                r.Method,
                receipt,
                r.PaymentDate,
                RoundMoney(r.Amount),
                used,
                available,
                r.Status,
                r.ReferenceNote);
        }).Where(r => r.AmountAvailable > 0.009m).ToList();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            mapped = mapped.Where(r =>
                (r.MemberName ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)
                || (r.MembershipNo ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)
                || (r.ReceiptNumber ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)
                || (r.ReferenceNote ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)
                || (r.Method ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        var total = mapped.Count;
        var pages = total == 0 ? 0 : (int)Math.Ceiling(total / (double)pageSize);
        var items = mapped.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return new AdvanceCreditPageDto(
            total,
            page,
            pageSize,
            pages,
            RoundMoney(mapped.Sum(x => x.AmountReceived)),
            RoundMoney(mapped.Sum(x => x.AmountUsed)),
            RoundMoney(mapped.Sum(x => x.AmountAvailable)),
            items);
    }

    private async Task<List<AdvanceCredit>> LoadUnallocatedAdvancesAsync(long accountId, CancellationToken cancellationToken)
    {
        var rows = await _db.Transactions.AsNoTracking()
            .Where(t =>
                t.AccountId == accountId
                && t.Amount > 0
                && (t.FeeType.Code == AdvanceFeeCode
                    || t.FeeType.Code == "ANNUAL"
                    || t.FeeType.Code == "SUBSCRIPTION"
                    || t.FeeType.Code == "ANNUAL_SUBSCRIPTION")
                && RecognizedStatuses.Contains(t.PaymentStatus.Code))
            .OrderBy(t => t.PaymentDate)
            .ThenBy(t => t.TransactionId)
            .Select(t => new { t.TransactionId, t.Amount, FeeCode = t.FeeType.Code })
            .ToListAsync(cancellationToken);
        if (rows.Count == 0) return [];

        var ids = rows.Select(r => r.TransactionId).ToList();
        var allocated = await _db.TransactionAllocations.AsNoTracking()
            .Where(a => ids.Contains(a.TransactionId))
            .GroupBy(a => a.TransactionId)
            .Select(g => new { TransactionId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);
        var allocatedById = allocated.ToDictionary(x => x.TransactionId, x => x.Amount);
        var invoicedYears = await _db.MembershipInvoices.AsNoTracking()
            .Where(i => i.AccountId == accountId && i.PublishedToMember)
            .Select(i => i.Year)
            .ToListAsync(cancellationToken);
        var invoiced = invoicedYears.ToHashSet();
        var legacyRoom = await _db.Subscriptions.AsNoTracking()
            .Where(s => s.AccountId == accountId && !s.WaivedFlag && !invoiced.Contains(s.SubscriptionYear))
            .SumAsync(s => (decimal?)s.AmountPaid, cancellationToken) ?? 0m;

        var result = new List<AdvanceCredit>();
        foreach (var row in rows)
        {
            allocatedById.TryGetValue(row.TransactionId, out var used);
            var raw = RoundMoney(Math.Max(0m, row.Amount - used));
            var annual = row.FeeCode is "ANNUAL" or "SUBSCRIPTION" or "ANNUAL_SUBSCRIPTION";
            if (annual)
            {
                var legacyTake = Math.Min(raw, Math.Max(0m, legacyRoom));
                legacyRoom -= legacyTake;
                raw = RoundMoney(raw - legacyTake);
            }
            if (raw > 0.009m)
                result.Add(new AdvanceCredit(row.TransactionId, raw));
        }
        return result;
    }

    private async Task<decimal> InvoiceOpenBalanceAsync(MembershipInvoice invoice, CancellationToken cancellationToken)
    {
        var allocated = await _db.TransactionAllocations.AsNoTracking()
            .Where(a => a.InvoiceId == invoice.InvoiceId)
            .SumAsync(a => (decimal?)a.Amount, cancellationToken) ?? 0m;

        decimal legacyPaid = 0;
        if (invoice.SubscriptionId is long subscriptionId)
        {
            legacyPaid = await _db.Subscriptions.AsNoTracking()
                .Where(s => s.SubscriptionId == subscriptionId)
                .Select(s => (decimal?)s.AmountPaid)
                .FirstOrDefaultAsync(cancellationToken) ?? 0m;
        }
        else
        {
            legacyPaid = await _db.Subscriptions.AsNoTracking()
                .Where(s => s.AccountId == invoice.AccountId && s.SubscriptionYear == invoice.Year)
                .Select(s => (decimal?)s.AmountPaid)
                .FirstOrDefaultAsync(cancellationToken) ?? 0m;
        }

        // MTransactionAllocation is the source of truth once a receipt has been pinned
        // to this invoice. Subscription.AmountPaid is rebuilt from that same ledger
        // (plus older receipts). Take the larger figure. Never add them, or a
        // 39,500 allocation plus 39,500 stored paid would be read as 79,000.
        var applied = Math.Min(
            invoice.Amount,
            Math.Max(Math.Max(0m, allocated), Math.Max(0m, legacyPaid)));
        return RoundMoney(Math.Max(0, invoice.Amount - applied));
    }

    private async Task<decimal> SumAllocationsForTransactionAsync(long transactionId, CancellationToken cancellationToken) =>
        await _db.TransactionAllocations
            .Where(a => a.TransactionId == transactionId)
            .SumAsync(a => (decimal?)a.Amount, cancellationToken) ?? 0m;

    private async Task<Entities.MembershipAccount.MAccount> ResolveAccountAsync(long memberId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts
            .FirstOrDefaultAsync(a => a.AccountId == memberId && !a.IsDeleted, cancellationToken);
        account ??= await _db.Accounts
            .FirstOrDefaultAsync(a => a.ProfileId == memberId && !a.IsDeleted, cancellationToken);
        return account ?? throw new InvalidOperationException("Member account was not found.");
    }

    private static decimal RoundMoney(decimal amount) =>
        Math.Round(amount, 2, MidpointRounding.AwayFromZero);

    private static string NormalizeCode(string? code) =>
        (code ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");

    private sealed class AdvanceCredit(long transactionId, decimal unallocated)
    {
        public long TransactionId { get; } = transactionId;
        public decimal Unallocated { get; set; } = unallocated;
    }
}
