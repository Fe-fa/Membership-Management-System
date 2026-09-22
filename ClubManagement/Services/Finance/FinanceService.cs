using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Common;
using ClubManagement.Entities;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Services.MembershipAccount;
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
    string? PaymentStatusCode = null,
    string? ChequeBankName = null,
    string? ChequeBankCode = null,
    DateOnly? ChequeDate = null,
    string? ChequeFileName = null,
    string? ChequeFileUrl = null,
    int? SubscriptionYear = null);
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
    string? ReferenceNote = null,
    string? ChequeBankName = null,
    string? ChequeBankCode = null,
    DateOnly? ChequeDate = null,
    string? ChequeFileName = null,
    string? ChequeFileUrl = null,
    string? MethodCode = null,
    string? MembershipNo = null,
    string? StatusCode = null,
    string? FeeTypeCode = null,
    long? ApplicationId = null,
    string? ApplicationNo = null,
    DateTime? SubmittedAt = null,
    long? ProfileId = null,
    string? MembershipType = null,
    string? MembershipTypeCode = null,
    decimal? FeeDue = null,
    decimal? FeePaidToDate = null,
    decimal? FeeOutstanding = null,
    string? ObligationStatus = null);
public record SubscriptionRowDto(
    long SubscriptionId,
    long AccountId,
    string MembershipNo,
    string MemberName,
    int Year,
    decimal AmountDue,
    decimal AmountPaid,
    decimal ArrearsAmount,
    string Status,
    DateOnly? DueDate,
    DateOnly? PostedDate,
    DateOnly? RemovalDate,
    string? MembershipType = null,
    string? MembershipTypeCode = null,
    string? AccountStatus = null,
    string? AccountStatusCode = null);
public record InvoiceQueueRowDto(
    long AccountId,
    long SubscriptionId,
    string MembershipNo,
    string MemberName,
    string? MembershipType,
    string? MembershipTypeCode,
    decimal AmountDue,
    decimal AmountPaid,
    decimal ArrearsAmount,
    string? Email,
    string? InvoiceNo,
    bool InvoiceEmailSent);
public record InvoiceIssueBatchResult(int Issued, int Emailed, int Published, int SkippedNoEmail);
public record InvoiceRunStatsDto(
    int MembersInArrears,
    int MembersReceived,
    int MembersNotReceived,
    decimal TotalArrears);
public record InvoiceRosterRowDto(
    long AccountId,
    long SubscriptionId,
    string MembershipNo,
    string MemberName,
    string? MembershipType,
    string? MembershipTypeCode,
    decimal AmountDue,
    decimal AmountPaid,
    decimal ArrearsAmount,
    string? Email,
    string? InvoiceNo,
    bool InvoiceReceived);
public class InvoiceSetupDto
{
    public bool ShowPin { get; set; } = true;
    public bool ShowDueDate { get; set; } = true;
    public bool ShowCredits { get; set; } = true;
    public bool ShowBankDetails { get; set; } = true;
    public bool ShowMpesaDetails { get; set; } = true;
    public string PayableNote { get; set; } = "All payments should be made payable to Aero Club of East Africa.";
    public string Pin { get; set; } = "P000591170O";
    public string Website { get; set; } = "www.aeroclubea.com";
    public string BankName { get; set; } = "I & M Bank Ltd";
    public string BankBranch { get; set; } = "Wilson Airport Branch";
    public string AccountName { get; set; } = "Aero Club of East Africa";
    public string KesAccount { get; set; } = "01100399661210";
    public string UsdAccount { get; set; } = "01100399661211";
    public string BankCode { get; set; } = "57";
    public string BranchCode { get; set; } = "011";
    public string Swift { get; set; } = "IMBLKENA";
    public string MpesaPaybill { get; set; } = "4103461";
    public string MpesaAccountHint { get; set; } = "Your Name / Membership No.";
    public string ExtraNote { get; set; } = "";
}
public class PaymentFieldDto
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
}
public class PaymentMethodBlockDto
{
    public string Id { get; set; } = "";
    public string Code { get; set; } = "";
    public string Title { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public bool ShowOnInvoice { get; set; } = true;
    public bool ShowOnReceipt { get; set; }
    public List<PaymentFieldDto> Fields { get; set; } = new();
}
public class ExtraParameterDto
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
    public bool ShowOnInvoice { get; set; } = true;
    public bool ShowOnReceipt { get; set; }
}
public class InvoiceDisplayDto
{
    public bool ShowPin { get; set; } = true;
    public bool ShowDueDate { get; set; } = true;
    public bool ShowCredits { get; set; } = true;
}
public class ReceiptDisplayDto
{
    public bool ShowPin { get; set; } = true;
    public bool ShowWebsite { get; set; } = true;
    public bool ShowAmountInWords { get; set; } = true;
    public bool ShowSignatures { get; set; } = true;
}
public class PaymentSetupDto
{
    public string Pin { get; set; } = "P000591170O";
    public string Website { get; set; } = "www.aeroclubea.com";
    public string PayableNote { get; set; } = "All payments should be made payable to Aero Club of East Africa.";
    public string ExtraNote { get; set; } = "";
    public InvoiceDisplayDto Invoice { get; set; } = new();
    public ReceiptDisplayDto Receipt { get; set; } = new();
    public List<PaymentMethodBlockDto> Methods { get; set; } = new();
    public List<ExtraParameterDto> ExtraParameters { get; set; } = new();
}
public record PaymentListFilter(
    long? AccountId = null,
    string? Status = null,
    string? Method = null,
    string? FeeType = null,
    string? Search = null,
    int? Year = null,
    string? MembershipType = null);
public record SubscriptionListFilter(
    int? Year = null,
    string? Search = null,
    bool ArrearsOnly = false,
    string? MembershipType = null);
public record ApprovePaymentRequest(
    string? ReceiptNumber = null,
    string? ChequeNo = null,
    string? ChequeBankName = null,
    string? ChequeBankCode = null,
    string? MpesaCode = null,
    decimal? AmountCleared = null);
public record RejectPaymentRequest(string Reason);
public record VoidPaymentRequest(string? Reason = null);
public record RefundPaymentRequest(string Reason);
public record ReversePaymentRequest(string Reason);
public record InvoiceDocumentDto(
    long InvoiceId,
    string InvoiceNo,
    long AccountId,
    int Year,
    string MemberName,
    string? MembershipNo,
    string? MembershipType,
    decimal Amount,
    decimal AmountPaid,
    decimal Balance,
    DateOnly DueDate,
    DateTime IssuedAt,
    string Status,
    bool EmailSent,
    string? SentToEmail,
    string ClubName,
    string? ClubAddress,
    string? ClubEmail,
    string? ClubPhone,
    string MpesaPaybill,
    string BankName,
    string BankAccount);
public record StatementLineDto(
    DateOnly? Date,
    string? Fee,
    string? Method,
    string? Receipt,
    string? Status,
    decimal Amount);
public record StatementDocumentDto(
    long AccountId,
    string MemberName,
    string? MembershipNo,
    string? MembershipType,
    DateOnly From,
    DateOnly To,
    decimal OpeningBalance,
    decimal ClosingBalance,
    string ClubName,
    IReadOnlyList<StatementLineDto> Lines);
public record FinanceDeskSummaryDto(
    int PendingClearance,
    decimal TodaysCollections,
    int UnreceiptedPayments,
    int MembersInArrears);
public record MembershipReceiptDto(
    long TransactionId,
    long ReceiptId,
    string ClubName,
    string? ClubShortName,
    string? ClubAddress,
    string? ClubEmail,
    string? ClubPhone,
    string ReceiptNumber,
    string IssuedDate,
    string? PaymentDate,
    string PayerName,
    string PayerCategory,
    string? MembershipNo,
    string? ApplicationNo,
    string? MembershipType,
    string FeeType,
    string? FeeTypeCode,
    string PaymentMethod,
    string? PaymentMethodCode,
    string? ChequeNo,
    string? ChequeBankName,
    string? ChequeBankCode,
    string? MpesaCode,
    string? ReferenceNote,
    decimal Amount,
    string AmountInWords,
    string Currency,
    string Status,
    string? IssuedBy,
    string Purpose);

/// <summary>
/// Result of the Aero Club annual subscription lifecycle run
/// (1 Jan generate → after 28 Feb POSTED → after 30 Apr unpaid, member stays ACTIVE).
/// <see cref="MembersRemoved"/> is the count marked unpaid after 30 April (membership is not removed).
/// </summary>
public record SubscriptionLifecycleResultDto(
    int Year,
    string AsOf,
    int SubscriptionsGenerated,
    int MembersPosted,
    int MembersRemoved,
    int TotalUpdated,
    int FutureYearsCleared = 0,
    int InvoicesIssued = 0);

public record SettlementMemberHitDto(
    long AccountId,
    long? SubscriptionId,
    string MembershipNo,
    string MemberName,
    string AccountStatus,
    string? MembershipType,
    decimal ArrearsAmount,
    int Year);

public record SettlementContextDto(
    long AccountId,
    long SubscriptionId,
    string MemberName,
    string MembershipNo,
    string AccountStatus,
    string AccountStatusCode,
    string? MembershipType,
    int Year,
    decimal AmountDue,
    decimal AmountPaid,
    decimal ArrearsAmount,
    bool EligibleForSeniorDiscount,
    string? SeniorDiscountReason,
    decimal SuggestedAmountAfterSeniorDiscount,
    bool CanIncludeReactivationFee,
    decimal ReactivationFeeAmount);

public record DirectSettlementRequest(
    long AccountId,
    long? SubscriptionId,
    decimal AmountPaid,
    string PaymentMethodCode,
    string? ReferenceCode = null,
    bool ApplySeniorDiscount = false,
    bool IncludeReactivationFee = false,
    DateOnly? PaymentDate = null);

public record DirectSettlementResultDto(
    long AccountId,
    string MembershipNo,
    string MemberName,
    string AccountStatus,
    bool Reactivated,
    decimal AnnualAmountApplied,
    decimal SeniorDiscountApplied,
    decimal ReactivationFeeCharged,
    decimal RemainingArrears,
    string? ReceiptNumber,
    long TransactionId);

public interface IFinanceService
{
    Task<FeeQuoteDto> QuoteAsync(long membershipTypeId, DateOnly dateOfBirth, DateOnly asOf, CancellationToken cancellationToken);
    /// <summary>
    /// Prices entrance and annual fees. Entrance is waived only for a child of an ACTIVE member
    /// with five continuous years when the applicant is 21 or older. Annual is always prorated
    /// for the remaining days of the application year.
    /// </summary>
    Task<MembershipFeeCalculation> CalculateMembershipFeesAsync(MembershipFeeInquiry inquiry, CancellationToken cancellationToken);
    Task<ApplicationDuesDto> GetApplicationDuesAsync(long applicationId, CancellationToken cancellationToken);
    Task<PaymentRowDto> RecordPaymentAsync(RecordPaymentRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<PaymentRowDto> EnsureReceiptAsync(long transactionId, long? requiredProfileId, long? actorUserId, CancellationToken cancellationToken, string? receiptNumber = null);
    Task<MembershipReceiptDto> GetMembershipReceiptAsync(long transactionId, long? requiredProfileId, CancellationToken cancellationToken);
    Task<PaymentRowDto> ApprovePaymentAsync(long transactionId, long? actorUserId, CancellationToken cancellationToken, ApprovePaymentRequest? request = null);
    /// <summary>
    /// Finance desk reject of an uncleared submission: status becomes REJECTED, no cash or credit note,
    /// and any unpaid invoice/arrears is reopened. Settled payments must use Reverse or Refund instead.
    /// </summary>
    Task<PaymentRowDto> RejectPaymentAsync(long transactionId, RejectPaymentRequest request, long? actorUserId, CancellationToken cancellationToken);
    /// <summary>
    /// Payer cancels an uncleared payment (PENDING / INITIATED / UNCLEARED) so they can pay again.
    /// </summary>
    Task<PaymentRowDto> VoidPaymentAsync(
        long transactionId,
        long requiredProfileId,
        VoidPaymentRequest? request,
        long? actorUserId,
        CancellationToken cancellationToken);
    /// <summary>
    /// Finance desk refund of a settled payment: marks Refunded, posts a credit note, keeps the invoice Paid.
    /// Pending clearance items cannot be refunded — reject the submission instead.
    /// </summary>
    Task<PaymentRowDto> RefundPaymentAsync(
        long transactionId,
        RefundPaymentRequest request,
        long? actorUserId,
        CancellationToken cancellationToken);
    /// <summary>
    /// Books-only reversal: original stays off Pending, status becomes REVERSED, and a negative contra is posted.
    /// </summary>
    Task<PaymentRowDto> ReversePaymentAsync(
        long transactionId,
        ReversePaymentRequest request,
        long? actorUserId,
        CancellationToken cancellationToken);
    Task<InvoiceDocumentDto> IssueSubscriptionInvoiceAsync(
        long accountId,
        int? year,
        bool sendEmail,
        long? actorUserId,
        CancellationToken cancellationToken,
        bool publishToMember = true,
        string? invoiceHtml = null);
    Task<InvoiceDocumentDto?> GetSubscriptionInvoiceAsync(
        long accountId,
        int? year,
        CancellationToken cancellationToken,
        bool memberPortalOnly = false);
    Task<PagedResult<InvoiceQueueRowDto>> ListInvoiceQueueAsync(
        SubscriptionListFilter filter,
        PagedRequest paging,
        CancellationToken cancellationToken);
    Task<PagedResult<InvoiceRosterRowDto>> ListInvoiceRosterAsync(
        SubscriptionListFilter filter,
        PagedRequest paging,
        bool? received,
        CancellationToken cancellationToken);
    Task<InvoiceRunStatsDto> GetInvoiceRunStatsAsync(int year, string? membershipType, CancellationToken cancellationToken);
    Task<PaymentSetupDto> GetInvoiceSetupAsync(CancellationToken cancellationToken);
    Task<PaymentSetupDto> SaveInvoiceSetupAsync(PaymentSetupDto setup, long? actorUserId, CancellationToken cancellationToken);
    Task<InvoiceIssueBatchResult> IssueAnnualInvoicesForYearAsync(
        int year,
        long? actorUserId,
        bool sendEmail,
        CancellationToken cancellationToken,
        IReadOnlyList<long>? accountIds = null,
        bool publishToMember = true,
        IReadOnlyDictionary<long, string>? invoiceHtmlByAccountId = null);
    Task ReconcileAccountDuesAsync(long accountId, CancellationToken cancellationToken);
    Task<StatementDocumentDto> GetMemberStatementAsync(
        long accountId,
        DateOnly from,
        DateOnly to,
        CancellationToken cancellationToken);
    Task<PaymentRowDto?> EnsurePendingFromChequeDocumentAsync(long applicationId, long applicationDocumentId, long? actorUserId, CancellationToken cancellationToken);
    Task<int> SyncPendingChequeDocumentsAsync(CancellationToken cancellationToken);
    Task<FinanceDeskSummaryDto> GetDeskSummaryAsync(int year, CancellationToken cancellationToken);
    Task<string> PeekNextReceiptNumberAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<PaymentRowDto>> ListPaymentsAsync(long? accountId, CancellationToken cancellationToken);
    Task<PagedResult<PaymentRowDto>> ListPaymentsAsync(long? accountId, PagedRequest paging, CancellationToken cancellationToken);
    Task<PagedResult<PaymentRowDto>> ListPaymentsAsync(PaymentListFilter filter, PagedRequest paging, CancellationToken cancellationToken);
    Task<IReadOnlyList<PaymentRowDto>> ListPaymentsByProfileAsync(long profileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<SubscriptionRowDto>> ListSubscriptionsAsync(int? year, CancellationToken cancellationToken);
    Task<PagedResult<SubscriptionRowDto>> ListSubscriptionsAsync(int? year, PagedRequest paging, CancellationToken cancellationToken);
    Task<PagedResult<SubscriptionRowDto>> ListSubscriptionsAsync(SubscriptionListFilter filter, PagedRequest paging, CancellationToken cancellationToken);
    Task<IReadOnlyList<SettlementMemberHitDto>> SearchSettlementMembersAsync(string? search, int? year, CancellationToken cancellationToken);
    Task<SettlementContextDto> GetSettlementContextAsync(long accountId, int? year, long? subscriptionId, CancellationToken cancellationToken);
    Task<DirectSettlementResultDto> DirectSettleAsync(DirectSettlementRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<int> RunPostingAsync(int year, long? actorUserId, CancellationToken cancellationToken);
    /// <summary>
    /// Full lifecycle for a chosen year (generate + post / mark unpaid when dates allow). Used by Finance demo / ops UI.
    /// </summary>
    Task<SubscriptionLifecycleResultDto> RunSubscriptionLifecycleForYearAsync(int year, long? actorUserId, CancellationToken cancellationToken);
    /// <summary>
    /// Background-job entry: enforce Jan 1 generation, Feb 28 posting, and Apr 30 unpaid (member stays active).
    /// </summary>
    Task<SubscriptionLifecycleResultDto> EnforceSubscriptionLifecycleAsync(CancellationToken cancellationToken);
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
}

public partial class FinanceService : IFinanceService
{
    private readonly ApplicationModuleDbContext _db;
    private readonly INonMembershipBillingService _nmBilling;

    public FinanceService(
        ApplicationModuleDbContext db,
        INonMembershipBillingService nmBilling,
        ClubManagement.Services.Identity.IEmailSender email,
        Microsoft.Extensions.Logging.ILogger<FinanceService> logger)
    {
        _db = db;
        _nmBilling = nmBilling;
        _email = email;
        _logger = logger;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.MTransaction', N'cheque_bank_name') IS NULL
    ALTER TABLE dbo.MTransaction ADD cheque_bank_name NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.MTransaction', N'cheque_bank_code') IS NULL
    ALTER TABLE dbo.MTransaction ADD cheque_bank_code NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.MTransaction', N'cheque_date') IS NULL
    ALTER TABLE dbo.MTransaction ADD cheque_date DATE NULL;
IF COL_LENGTH(N'dbo.MTransaction', N'cheque_document_id') IS NULL
    ALTER TABLE dbo.MTransaction ADD cheque_document_id BIGINT NULL;
IF COL_LENGTH(N'dbo.MReceiptMaster', N'cheque_document_id') IS NULL
    ALTER TABLE dbo.MReceiptMaster ADD cheque_document_id BIGINT NULL;
IF NOT EXISTS (SELECT 1 FROM dbo.Document_type WHERE code = N'CHEQUE')
    INSERT INTO dbo.Document_type (code, name, sort_order, is_active, created_at)
    VALUES (N'CHEQUE', N'Cheque copy', 10, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.Fee_type WHERE code = N'ACCOMMODATION')
    INSERT INTO dbo.Fee_type (code, name, sort_order, is_active, created_at)
    VALUES (N'ACCOMMODATION', N'Accommodation / room', 50, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.Fee_type WHERE code = N'CORKAGE')
    INSERT INTO dbo.Fee_type (code, name, sort_order, is_active, created_at)
    VALUES (N'CORKAGE', N'Corkage / outside food', 51, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.Fee_type WHERE code = N'OTHER')
    INSERT INTO dbo.Fee_type (code, name, sort_order, is_active, created_at)
    VALUES (N'OTHER', N'Other club charge', 52, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.Payment_method WHERE code = N'CLUB_CARD')
    INSERT INTO dbo.Payment_method (code, name, sort_order, is_active, created_at)
    VALUES (N'CLUB_CARD', N'Club card / account', 60, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.Payment_status WHERE code = N'REVERSED')
    INSERT INTO dbo.Payment_status (code, name, sort_order, is_active, created_at)
    VALUES (N'REVERSED', N'Reversed', 97, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.Payment_status WHERE code = N'PARTIALLY_PAID')
    INSERT INTO dbo.Payment_status (code, name, sort_order, is_active, created_at)
    VALUES (N'PARTIALLY_PAID', N'Partially paid', 25, 1, SYSUTCDATETIME());
IF OBJECT_ID(N'dbo.Reversal_entry', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Reversal_entry (
        reversal_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        source_transaction_id BIGINT NOT NULL,
        reversal_transaction_id BIGINT NOT NULL,
        account_id BIGINT NULL,
        reason NVARCHAR(500) NOT NULL,
        approved_by_committee BIT NOT NULL CONSTRAINT DF_rev_committee DEFAULT(0),
        approver_user_id BIGINT NULL,
        approver_name NVARCHAR(200) NULL,
        approver_role NVARCHAR(80) NULL,
        reversed_at DATETIME2 NOT NULL,
        reversed_by_user_id BIGINT NULL,
        created_at DATETIME2 NOT NULL
    );
    CREATE UNIQUE INDEX UX_reversal_source ON dbo.Reversal_entry(source_transaction_id);
END
IF OBJECT_ID(N'dbo.Membership_invoice', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Membership_invoice (
        invoice_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        invoice_no NVARCHAR(40) NOT NULL,
        account_id BIGINT NOT NULL,
        subscription_id BIGINT NULL,
        year INT NOT NULL,
        issued_at DATETIME2 NOT NULL,
        due_date DATE NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        status NVARCHAR(40) NOT NULL,
        sent_at DATETIME2 NULL,
        sent_to_email NVARCHAR(200) NULL,
        published_to_member BIT NOT NULL CONSTRAINT DF_inv_published DEFAULT(0),
        created_at DATETIME2 NOT NULL,
        created_by_user_id BIGINT NULL
    );
    CREATE UNIQUE INDEX UX_membership_invoice_account_year ON dbo.Membership_invoice(account_id, year);
    CREATE UNIQUE INDEX UX_membership_invoice_no ON dbo.Membership_invoice(invoice_no);
END
IF COL_LENGTH(N'dbo.Membership_invoice', N'published_to_member') IS NULL
BEGIN
    ALTER TABLE dbo.Membership_invoice ADD published_to_member BIT NOT NULL CONSTRAINT DF_inv_published DEFAULT(0);
    EXEC(N'UPDATE dbo.Membership_invoice SET published_to_member = 1 WHERE sent_at IS NOT NULL');
END
", cancellationToken);
    }

    public async Task<FeeQuoteDto> QuoteAsync(long membershipTypeId, DateOnly dateOfBirth, DateOnly asOf, CancellationToken cancellationToken)
    {
        var type = await _db.MembershipTypes.AsNoTracking().FirstAsync(x => x.MembershipTypeId == membershipTypeId, cancellationToken);
        var schedule = await _db.MembershipFeeSchedules.AsNoTracking()
            .Where(x => x.IsActive && x.MembershipTypeId == membershipTypeId && x.EffectiveDate <= asOf)
            .OrderByDescending(x => x.EffectiveDate)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No fee schedule is configured for this membership type.");

        var age = MembershipFeeCalculator.CompletedYears(dateOfBirth, asOf);
        var joining = age < 30 ? schedule.JoiningFeeUnder30 : schedule.JoiningFee;
        var annual = MembershipFeeCalculator.ProrateAnnual(schedule.AnnualSubscription, asOf);
        return new FeeQuoteDto(
            type.MembershipTypeId,
            type.Name,
            schedule.JoiningFee,
            schedule.JoiningFeeUnder30,
            schedule.AnnualSubscription,
            joining,
            annual.PayableAnnual,
            annual.IsProrated);
    }

    public async Task<MembershipFeeCalculation> CalculateMembershipFeesAsync(
        MembershipFeeInquiry inquiry,
        CancellationToken cancellationToken)
    {
        var type = await _db.MembershipTypes.AsNoTracking()
            .FirstAsync(x => x.MembershipTypeId == inquiry.MembershipTypeId, cancellationToken);
        var schedule = await _db.MembershipFeeSchedules.AsNoTracking()
            .Where(x => x.IsActive && x.MembershipTypeId == inquiry.MembershipTypeId && x.EffectiveDate <= inquiry.AsOf)
            .OrderByDescending(x => x.EffectiveDate)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No fee schedule is configured for this membership type.");

        string? parentStatus = null;
        int? parentYears = null;
        if (inquiry.IsChildOfMember)
            (parentStatus, parentYears) = await ResolveParentStandingAsync(
                inquiry.ParentAccountId,
                inquiry.ParentMembershipNo,
                inquiry.AsOf,
                cancellationToken);

        return MembershipFeeCalculator.Calculate(new MembershipFeeFacts(
            type.MembershipTypeId,
            type.Name,
            schedule.JoiningFee,
            schedule.AnnualSubscription,
            inquiry.DateOfBirth,
            inquiry.AsOf,
            inquiry.IsChildOfMember,
            parentStatus,
            parentYears));
    }

    private async Task<(string? StatusCode, int? ContinuousYears)> ResolveParentStandingAsync(
        long? parentAccountId,
        string? parentMembershipNo,
        DateOnly asOf,
        CancellationToken cancellationToken)
    {
        var query = _db.Accounts.AsNoTracking()
            .Include(a => a.CurrentMemberStatus)
            .Where(a => !a.IsDeleted);

        MAccount? parent = null;
        if (parentAccountId is long accountId)
            parent = await query.FirstOrDefaultAsync(a => a.AccountId == accountId, cancellationToken);
        else if (!string.IsNullOrWhiteSpace(parentMembershipNo))
        {
            var number = parentMembershipNo.Trim();
            parent = await query.FirstOrDefaultAsync(a => a.MembershipNo == number, cancellationToken);
        }

        if (parent is null)
            return (null, 0);

        var joined = parent.JoinedDate ?? parent.StartDate;
        var years = joined is DateOnly start ? MembershipFeeCalculator.CompletedYears(start, asOf) : 0;
        return (parent.CurrentMemberStatus?.Code, years);
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

        var accountIds = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == app.ApplicantProfileId && !a.IsDeleted)
            .Select(a => a.AccountId)
            .ToListAsync(cancellationToken);
        if (account is not null && !accountIds.Contains(account.AccountId))
            accountIds.Add(account.AccountId);

        var paidRows = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Where(t =>
                t.ProfileId == app.ApplicantProfileId
                || (t.AccountId != null && accountIds.Contains(t.AccountId.Value)))
            .ToListAsync(cancellationToken);

        var joiningPaid = paidRows
            .Where(t => t.FeeTypeId == joiningFeeType.FeeTypeId && CountsTowardDues(t.PaymentStatus?.Code) && t.Amount > 0)
            .Sum(t => t.Amount);
        var annualPaid = paidRows
            .Where(t => t.FeeTypeId == annualFeeType.FeeTypeId && CountsTowardDues(t.PaymentStatus?.Code) && t.Amount > 0)
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

    private static string NormalizeMembershipKey(string? value) =>
        (value ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");

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
            // Cheques/cards always clear through finance. Applicant M-Pesa / bank transfers also await confirmation.
            if (NeedsClearing(methodCode)
                || (request.ApplicationId is not null && NeedsApplicantClearance(methodCode)))
                requestedStatus = "PENDING";
            else
                requestedStatus = "PAID";
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

        await EnsureAmountWithinObligationAsync(request, profileId, cancellationToken);

        var feeExists = await _db.FeeTypes.AnyAsync(x => x.FeeTypeId == request.FeeTypeId, cancellationToken);
        if (!feeExists)
            throw new InvalidOperationException("Fee type was not found.");

        var isCheque = methodCode is "CHEQUE" or "CHEQUE_PAYMENT";
        long? chequeDocumentId = null;
        string? chequeFileName = request.ChequeFileName;
        string? chequeFileUrl = request.ChequeFileUrl;
        if (isCheque)
        {
            var hasBankName = !string.IsNullOrWhiteSpace(request.ChequeBankName);
            var hasBankCode = !string.IsNullOrWhiteSpace(request.ChequeBankCode);
            if (!hasBankName && !hasBankCode)
                throw new InvalidOperationException("Every cheque row requires either a bank name or a bank code.");
            if (hasBankName && hasBankCode)
                throw new InvalidOperationException("Enter cheque bank name or bank code on each cheque row, not both.");
            if (string.IsNullOrWhiteSpace(request.ChequeNo))
                throw new InvalidOperationException("Every cheque row requires a cheque number.");
            if (request.ChequeDate is null)
                throw new InvalidOperationException("Every cheque row requires the cheque date.");
            // Applicant cheques require an uploaded copy; member ledger cheques may be recorded with bank details alone.
            if (request.ApplicationId is not null
                && (string.IsNullOrWhiteSpace(chequeFileName) || string.IsNullOrWhiteSpace(chequeFileUrl)))
                throw new InvalidOperationException("Attach a picture, PDF, or Word copy of the cheque.");

            if (request.ApplicationId is long chequeApplicationId
                && !string.IsNullOrWhiteSpace(chequeFileName)
                && !string.IsNullOrWhiteSpace(chequeFileUrl))
            {
                var chequeType = await _db.DocumentTypes
                    .FirstOrDefaultAsync(x => x.Code == "CHEQUE", cancellationToken);
                if (chequeType is null)
                {
                    chequeType = new DocumentType
                    {
                        Code = "CHEQUE",
                        Name = "Cheque copy",
                        SortOrder = 10,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };
                    _db.DocumentTypes.Add(chequeType);
                    await _db.SaveChangesAsync(cancellationToken);
                }

                var chequeDoc = new AplicationDocument
                {
                    ApplicationId = chequeApplicationId,
                    DocumentTypeId = chequeType.DocumentTypeId,
                    FileName = chequeFileName.Trim(),
                    FileUrl = chequeFileUrl.Trim(),
                    UploadedAt = DateTime.UtcNow,
                    UploadedByUserId = actorUserId,
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = actorUserId
                };
                _db.ApplicationDocuments.Add(chequeDoc);
                await _db.SaveChangesAsync(cancellationToken);
                chequeDocumentId = chequeDoc.ApplicationDocumentId;
            }
        }

        var feeCodeForBind = await _db.FeeTypes.AsNoTracking()
            .Where(f => f.FeeTypeId == request.FeeTypeId)
            .Select(f => f.Code)
            .FirstOrDefaultAsync(cancellationToken);
        long? boundSubscriptionId = null;
        if (IsAnnualFee(feeCodeForBind) && request.AccountId is long bindAccountId)
        {
            var bindYear = request.SubscriptionYear ?? request.PaymentDate.Year;
            boundSubscriptionId = await _db.Subscriptions.AsNoTracking()
                .Where(s => s.AccountId == bindAccountId && s.SubscriptionYear == bindYear)
                .Select(s => (long?)s.SubscriptionId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        var tx = new MTransaction
        {
            AccountId = request.AccountId,
            ProfileId = profileId,
            SubscriptionId = boundSubscriptionId,
            FeeTypeId = request.FeeTypeId,
            PaymentMethodId = request.PaymentMethodId,
            PaymentStatusId = paymentStatus.PaymentStatusId,
            Amount = request.Amount,
            PaymentDate = request.PaymentDate,
            ChequeNo = request.ChequeNo,
            ChequeBankName = isCheque ? request.ChequeBankName?.Trim() : null,
            ChequeBankCode = isCheque ? request.ChequeBankCode?.Trim() : null,
            ChequeDate = isCheque ? request.ChequeDate : null,
            ChequeDocumentId = chequeDocumentId,
            MpesaCode = request.MpesaCode,
            ReferenceNote = request.ReferenceNote,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.Transactions.Add(tx);
        await _db.SaveChangesAsync(cancellationToken);

        string? receiptNo = null;
        var isPaidNow = string.Equals(paymentStatus.Code, "PAID", StringComparison.OrdinalIgnoreCase)
            || string.Equals(paymentStatus.Code, "WAIVED", StringComparison.OrdinalIgnoreCase);
        if (isPaidNow)
        {
            if (request.AccountId is long paidAccountId)
            {
                var feeCode = await _db.FeeTypes.AsNoTracking()
                    .Where(f => f.FeeTypeId == request.FeeTypeId)
                    .Select(f => f.Code)
                    .FirstOrDefaultAsync(cancellationToken);
                if (IsAnnualFee(feeCode))
                    await ReconcileAccountDuesAsync(paidAccountId, cancellationToken);
                else
                    await TryRestoreActiveMembershipAsync(paidAccountId, actorUserId, cancellationToken);
            }

            var obligation = await TryGetFeeObligationAsync(
                request.AccountId,
                profileId,
                request.FeeTypeId,
                request.SubscriptionYear,
                null,
                cancellationToken);
            await FinalizeRecognizedStatusAsync(tx, obligation?.RemainingCap ?? 0, actorUserId, cancellationToken);
            paymentStatus = tx.PaymentStatus ?? paymentStatus;
            isPaidNow = RecognizesPayment(paymentStatus.Code);
        }

        if (isPaidNow)
        {
            receiptNo = $"RCT-{tx.TransactionId:D6}";
            var receipt = new MReceiptMaster
            {
                TransactionId = tx.TransactionId,
                ReceiptNumber = receiptNo,
                Amount = request.Amount,
                IssuedDate = request.PaymentDate,
                IssuedByUserId = actorUserId,
                ChequeDocumentId = chequeDocumentId,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.Receipts.Add(receipt);
            await _db.SaveChangesAsync(cancellationToken);
            tx.ReceiptId = receipt.ReceiptId;
            await _db.SaveChangesAsync(cancellationToken);
        }

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

        var feeMeta = await _db.FeeTypes.AsNoTracking()
            .Where(f => f.FeeTypeId == request.FeeTypeId)
            .Select(f => new { f.Name, f.Code })
            .FirstOrDefaultAsync(cancellationToken);

        var row = new PaymentRowDto(
            tx.TransactionId,
            receiptNo,
            null,
            method.Name,
            paymentStatus.Name,
            tx.Amount,
            tx.PaymentDate,
            tx.MpesaCode,
            tx.ChequeNo,
            feeMeta?.Name,
            tx.ReferenceNote,
            tx.ChequeBankName,
            tx.ChequeBankCode,
            tx.ChequeDate,
            chequeFileName,
            chequeFileUrl,
            method.Code,
            null,
            paymentStatus.Code,
            feeMeta?.Code,
            request.ApplicationId,
            null,
            tx.CreatedAt,
            profileId);
        return await AttachObligationAsync(
            row,
            request.AccountId,
            profileId,
            request.FeeTypeId,
            request.SubscriptionYear,
            cancellationToken);
    }

    public async Task<PaymentRowDto> ApprovePaymentAsync(
        long transactionId,
        long? actorUserId,
        CancellationToken cancellationToken,
        ApprovePaymentRequest? request = null)
    {
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

        var methodCode = (tx.PaymentMethod?.Code ?? "").Trim().ToUpperInvariant().Replace("-", "_");
        if (!NeedsClearing(methodCode))
            throw new InvalidOperationException("Only cheque and credit payments need finance approval.");

        var current = (tx.PaymentStatus?.Code ?? "").Trim().ToUpperInvariant().Replace("-", "_");
        if (current is "PAID" or "WAIVED" or "PARTIALLY_PAID")
            return await EnsureReceiptAsync(transactionId, null, actorUserId, cancellationToken, request?.ReceiptNumber);

        if (!string.IsNullOrWhiteSpace(request?.ChequeNo))
            tx.ChequeNo = request.ChequeNo.Trim();
        if (!string.IsNullOrWhiteSpace(request?.ChequeBankName))
            tx.ChequeBankName = request.ChequeBankName.Trim();
        if (!string.IsNullOrWhiteSpace(request?.ChequeBankCode))
            tx.ChequeBankCode = request.ChequeBankCode.Trim();
        if (!string.IsNullOrWhiteSpace(request?.MpesaCode))
            tx.MpesaCode = request.MpesaCode.Trim();
        if (request?.AmountCleared is decimal cleared && cleared > 0)
        {
            var cap = await TryGetFeeObligationAsync(
                tx.AccountId,
                tx.ProfileId,
                tx.FeeTypeId,
                tx.PaymentDate?.Year,
                tx.TransactionId,
                cancellationToken);
            if (cap is not null && cleared > cap.RemainingCap + 0.01m)
                throw new InvalidOperationException(
                    $"Cleared amount cannot exceed the remaining due ({cap.RemainingCap:0.00}).");
            tx.Amount = cleared;
        }

        var paidStatus = await _db.PaymentStatuses.FirstOrDefaultAsync(x => x.Code == "PAID", cancellationToken)
            ?? throw new InvalidOperationException("Paid payment status was not found.");
        tx.PaymentStatusId = paidStatus.PaymentStatusId;
        tx.UpdatedByUserId = actorUserId;
        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransaction",
            RecordId = tx.TransactionId,
            Action = "UPDATE",
            NewValues = $"status=PAID; method={methodCode}; amount={tx.Amount}; chequeNo={tx.ChequeNo}; receipt={request?.ReceiptNumber}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        tx.PaymentStatus = paidStatus;

        if (tx.AccountId is long accountId && IsAnnualFee(tx.FeeType?.Code))
        {
            if (tx.SubscriptionId is null)
            {
                var bindYear = tx.PaymentDate?.Year ?? DateTime.UtcNow.Year;
                tx.SubscriptionId = await _db.Subscriptions.AsNoTracking()
                    .Where(s => s.AccountId == accountId && s.SubscriptionYear == bindYear)
                    .Select(s => (long?)s.SubscriptionId)
                    .FirstOrDefaultAsync(cancellationToken);
            }
            await _db.SaveChangesAsync(cancellationToken);
            await ReconcileAccountDuesAsync(accountId, cancellationToken);
        }

        var remaining = await TryGetFeeObligationAsync(
            tx.AccountId,
            tx.ProfileId,
            tx.FeeTypeId,
            tx.PaymentDate?.Year,
            null,
            cancellationToken);
        await FinalizeRecognizedStatusAsync(tx, remaining?.RemainingCap ?? 0, actorUserId, cancellationToken);

        if (tx.AccountId is long nmAccountId
            && IsNmFee(tx.FeeType?.Code))
        {
            try
            {
                var (kind, chargeId) = ParseNmTag(tx.ReferenceNote);
                await _nmBilling.SettleFromMemberPaymentAsync(
                    nmAccountId,
                    tx.FeeType!.Code,
                    tx.Amount,
                    methodCode,
                    tx.MpesaCode ?? tx.ChequeNo ?? tx.ReferenceNote,
                    chargeId,
                    actorUserId,
                    cancellationToken);
                _ = kind;
            }
            catch (InvalidOperationException)
            {
                // Finance clearance succeeded; NM charge may already be settled.
            }
        }

        return await EnsureReceiptAsync(transactionId, null, actorUserId, cancellationToken, request?.ReceiptNumber);
    }

    public async Task<PaymentRowDto> RejectPaymentAsync(
        long transactionId,
        RejectPaymentRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new InvalidOperationException("A rejection reason is required.");

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
        if (current is "REJECTED" or "VOIDED" or "CANCELLED" or "CANCELED")
        {
            if (tx.AccountId is long alreadyRejectedAccountId)
                await ReconcileAccountDuesAsync(alreadyRejectedAccountId, cancellationToken);
            return await MapApprovedRow(tx, cancellationToken);
        }
        if (current is "PAID" or "WAIVED" or "PARTIALLY_PAID" or "SETTLED" or "REFUNDED" or "REVERSED")
            throw new InvalidOperationException("Settled payments cannot be rejected. Use Reverse or Refund instead.");
        if (tx.Receipt is not null)
            throw new InvalidOperationException("A receipted payment cannot be rejected. Use Reverse or Refund instead.");
        if (current is not ("PENDING" or "INITIATED" or "UNCLEARED"))
            throw new InvalidOperationException($"Only uncleared submissions can be rejected (current status: {tx.PaymentStatus?.Name ?? current}).");

        var rejected = await EnsurePaymentStatusAsync("REJECTED", "Rejected", 90, cancellationToken);
        var reason = request.Reason.Trim();
        tx.PaymentStatusId = rejected.PaymentStatusId;
        tx.ReferenceNote = string.IsNullOrWhiteSpace(tx.ReferenceNote)
            ? $"REJECTED: {reason}"
            : $"{tx.ReferenceNote} | REJECTED: {reason}";
        tx.UpdatedByUserId = actorUserId;
        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransaction",
            RecordId = tx.TransactionId,
            Action = "UPDATE",
            NewValues = $"status=REJECTED; reason={reason}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        tx.PaymentStatus = rejected;

        if (tx.AccountId is long accountId)
            await ReconcileAccountDuesAsync(accountId, cancellationToken);

        return await MapApprovedRow(tx, cancellationToken);
    }

    public async Task<PaymentRowDto> VoidPaymentAsync(
        long transactionId,
        long requiredProfileId,
        VoidPaymentRequest? request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
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

        var ownerProfileId = tx.ProfileId ?? tx.Account?.ProfileId;
        if (ownerProfileId is null || ownerProfileId.Value != requiredProfileId)
            throw new InvalidOperationException("You can only void your own payments.");

        if (tx.Receipt is not null)
            throw new InvalidOperationException("A receipted payment cannot be voided. Contact finance.");

        var current = (tx.PaymentStatus?.Code ?? "").Trim().ToUpperInvariant().Replace("-", "_");
        if (current is "PAID" or "WAIVED")
            throw new InvalidOperationException("Settled payments cannot be voided.");
        if (current is "VOIDED" or "CANCELLED" or "CANCELED")
            return await MapApprovedRow(tx, cancellationToken);
        if (current is not ("PENDING" or "INITIATED" or "UNCLEARED"))
            throw new InvalidOperationException($"Only uncleared payments can be voided (current status: {tx.PaymentStatus?.Name ?? current}).");

        var voided = await _db.PaymentStatuses.FirstOrDefaultAsync(x => x.Code == "VOIDED", cancellationToken);
        if (voided is null)
        {
            voided = new PaymentStatus
            {
                Code = "VOIDED",
                Name = "Voided",
                SortOrder = 95,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.PaymentStatuses.Add(voided);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var reason = string.IsNullOrWhiteSpace(request?.Reason)
            ? "Voided by payer"
            : request!.Reason!.Trim();
        tx.PaymentStatusId = voided.PaymentStatusId;
        tx.ReferenceNote = string.IsNullOrWhiteSpace(tx.ReferenceNote)
            ? $"VOIDED: {reason}"
            : $"{tx.ReferenceNote} | VOIDED: {reason}";
        tx.UpdatedByUserId = actorUserId;
        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransaction",
            RecordId = tx.TransactionId,
            Action = "UPDATE",
            NewValues = $"status=VOIDED; reason={reason}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        tx.PaymentStatus = voided;
        return await MapApprovedRow(tx, cancellationToken);
    }

    public async Task<PaymentRowDto> RefundPaymentAsync(
        long transactionId,
        RefundPaymentRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new InvalidOperationException("A refund reason is required.");

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
        if (current is "REFUNDED")
        {
            if (tx.AccountId is long alreadyRefundedAccountId)
                await ReconcileAccountDuesAsync(alreadyRefundedAccountId, cancellationToken);
            return await MapApprovedRow(tx, cancellationToken);
        }
        if (current is "REVERSED")
            throw new InvalidOperationException("Reversed payments cannot be refunded. Reversal is books-only.");
        if (current is "VOIDED" or "CANCELLED" or "CANCELED" or "REJECTED")
            throw new InvalidOperationException($"This payment is already {tx.PaymentStatus?.Name ?? current} and cannot be refunded.");
        if (current is "PENDING" or "INITIATED" or "UNCLEARED")
            throw new InvalidOperationException("Pending clearance items cannot be refunded. Reject the submission instead.");
        if (current is not ("PAID" or "WAIVED" or "PARTIALLY_PAID"))
            throw new InvalidOperationException($"Payment status '{tx.PaymentStatus?.Name ?? current}' cannot be refunded.");

        var refunded = await EnsurePaymentStatusAsync("REFUNDED", "Refunded", 96, cancellationToken);
        var reason = request.Reason.Trim();
        var receiptNo = tx.Receipt?.ReceiptNumber;
        var sourceLabel = receiptNo ?? $"TX-{tx.TransactionId}";

        var alreadyCredit = await _db.Transactions.AsNoTracking()
            .AnyAsync(t =>
                t.Amount < 0
                && t.PaymentStatus.Code == "REFUNDED"
                && t.FeeTypeId == tx.FeeTypeId
                && t.AccountId == tx.AccountId
                && t.ProfileId == tx.ProfileId
                && t.ReferenceNote != null
                && (t.ReferenceNote.Contains($"refund of {sourceLabel}")
                    || t.ReferenceNote.Contains($"TX-{tx.TransactionId}")),
                cancellationToken);

        long? creditNoteId = null;
        if (!alreadyCredit)
        {
            var creditNote = new MTransaction
            {
                AccountId = tx.AccountId,
                ProfileId = tx.ProfileId,
                SubscriptionId = tx.SubscriptionId,
                FeeTypeId = tx.FeeTypeId,
                PaymentMethodId = tx.PaymentMethodId,
                PaymentStatusId = refunded.PaymentStatusId,
                Amount = -Math.Abs(tx.Amount),
                PaymentDate = DateOnly.FromDateTime(DateTime.UtcNow),
                ReferenceNote = $"Credit note / refund of {sourceLabel}: {reason}",
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.Transactions.Add(creditNote);
            await _db.SaveChangesAsync(cancellationToken);
            creditNoteId = creditNote.TransactionId;
        }

        tx.PaymentStatusId = refunded.PaymentStatusId;
        tx.PaymentStatus = refunded;
        tx.ReferenceNote = string.IsNullOrWhiteSpace(tx.ReferenceNote)
            ? $"REFUNDED: {reason}"
            : $"{tx.ReferenceNote} | REFUNDED: {reason}";
        tx.UpdatedByUserId = actorUserId;
        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransaction",
            RecordId = tx.TransactionId,
            Action = "UPDATE",
            NewValues = $"status=REFUNDED; was={current}; creditNote={creditNoteId}; reason={reason}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (tx.AccountId is long refundAccountId)
            await ReconcileAccountDuesAsync(refundAccountId, cancellationToken);
        return await MapApprovedRow(tx, cancellationToken);
    }

    public async Task<PaymentRowDto?> EnsurePendingFromChequeDocumentAsync(
        long applicationId,
        long applicationDocumentId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var doc = await _db.ApplicationDocuments
            .Include(d => d.DocumentType)
            .FirstOrDefaultAsync(
                d => d.ApplicationId == applicationId && d.ApplicationDocumentId == applicationDocumentId,
                cancellationToken);
        if (doc?.DocumentType is null) return null;

        var typeCode = (doc.DocumentType.Code ?? "").Trim().ToUpperInvariant().Replace("-", "_");
        if (typeCode is not ("CHEQUE_ANNUAL" or "CHEQUE_JOINING" or "CHEQUE"))
            return null;

        var feeCode = typeCode == "CHEQUE_JOINING" ? "JOINING" : "ANNUAL";
        return await UpsertPendingChequeForApplicationAsync(applicationId, doc, feeCode, actorUserId, cancellationToken);
    }

    public async Task<int> SyncPendingChequeDocumentsAsync(CancellationToken cancellationToken)
    {
        var codes = new[] { "CHEQUE_ANNUAL", "CHEQUE_JOINING" };
        var docs = await _db.ApplicationDocuments
            .Include(d => d.DocumentType)
            .Where(d => d.DocumentType != null && codes.Contains(d.DocumentType.Code))
            .OrderByDescending(d => d.UploadedAt)
            .ThenByDescending(d => d.ApplicationDocumentId)
            .ToListAsync(cancellationToken);

        var created = 0;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var doc in docs)
        {
            var typeCode = (doc.DocumentType?.Code ?? "").Trim().ToUpperInvariant().Replace("-", "_");
            var feeCode = typeCode == "CHEQUE_JOINING" ? "JOINING" : "ANNUAL";
            var key = $"{doc.ApplicationId}:{feeCode}";
            if (!seen.Add(key)) continue;

            var alreadyLinked = await _db.Transactions.AsNoTracking()
                .AnyAsync(t => t.ChequeDocumentId == doc.ApplicationDocumentId, cancellationToken);
            if (alreadyLinked) continue;

            var row = await UpsertPendingChequeForApplicationAsync(
                doc.ApplicationId,
                doc,
                feeCode,
                null,
                cancellationToken);
            if (row is not null) created++;
        }
        return created;
    }

    public async Task<FinanceDeskSummaryDto> GetDeskSummaryAsync(int year, CancellationToken cancellationToken)
    {
        await SyncPendingChequeDocumentsAsync(cancellationToken);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await HealReversedLedgersAsync(cancellationToken);

        var pendingClearance = await _db.Transactions.AsNoTracking()
            .CountAsync(t =>
                (t.PaymentStatus.Code == "PENDING"
                    || t.PaymentStatus.Code == "INITIATED"
                    || t.PaymentStatus.Code == "UNCLEARED")
                && (t.PaymentMethod.Code == "CHEQUE"
                    || t.PaymentMethod.Code == "CHEQUE_PAYMENT"
                    || t.PaymentMethod.Code == "CARD"
                    || t.PaymentMethod.Code == "CREDIT"
                    || t.PaymentMethod.Code == "CREDIT_CARD"
                    || t.PaymentMethod.Code == "MPESA"
                    || t.PaymentMethod.Code == "BANK_TRANSFER"
                    || t.PaymentMethod.Code == "BANKWIRE"
                    || t.PaymentMethod.Code == "BANK_WIRE"),
                cancellationToken);

        var todaysCollections = await _db.Transactions.AsNoTracking()
            .Where(t =>
                t.PaymentDate == today
                && (t.PaymentStatus.Code == "PAID"
                    || t.PaymentStatus.Code == "WAIVED"
                    || t.PaymentStatus.Code == "PARTIALLY_PAID"))
            .SumAsync(t => (decimal?)t.Amount, cancellationToken) ?? 0m;

        var unreceipted = await _db.Transactions.AsNoTracking()
            .CountAsync(t =>
                (t.PaymentStatus.Code == "PAID"
                    || t.PaymentStatus.Code == "WAIVED"
                    || t.PaymentStatus.Code == "PARTIALLY_PAID")
                && (t.ReceiptId == null)
                && !_db.Receipts.Any(r => r.TransactionId == t.TransactionId),
                cancellationToken);

        var membersInArrears = await _db.Subscriptions.AsNoTracking()
            .CountAsync(s =>
                s.SubscriptionYear == year
                && (s.ArrearsAmount > 0 || s.AmountPaid < s.AmountDue),
                cancellationToken);

        return new FinanceDeskSummaryDto(pendingClearance, todaysCollections, unreceipted, membersInArrears);
    }

    public async Task<string> PeekNextReceiptNumberAsync(CancellationToken cancellationToken)
    {
        var maxTx = await _db.Transactions.AsNoTracking()
            .Select(t => (long?)t.TransactionId)
            .MaxAsync(cancellationToken) ?? 0;
        return $"RCT-{(maxTx + 1):D6}";
    }

    private async Task<PaymentRowDto?> UpsertPendingChequeForApplicationAsync(
        long applicationId,
        AplicationDocument doc,
        string feeCode,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var app = await _db.Applications.AsNoTracking()
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (app is null) return null;

        var fee = await _db.FeeTypes.FirstOrDefaultAsync(
            x => x.Code == feeCode || x.Code == feeCode.ToLowerInvariant(),
            cancellationToken);
        if (fee is null) return null;

        var chequeMethod = await _db.PaymentMethods.FirstOrDefaultAsync(
            x => x.Code == "CHEQUE" || x.Code == "CHEQUE_PAYMENT",
            cancellationToken);
        if (chequeMethod is null) return null;

        var pendingStatus = await _db.PaymentStatuses.FirstOrDefaultAsync(x => x.Code == "PENDING", cancellationToken)
            ?? await _db.PaymentStatuses.FirstAsync(x => x.Code == "PAID", cancellationToken);

        var open = await _db.Transactions
            .Include(t => t.PaymentStatus)
            .Include(t => t.PaymentMethod)
            .Include(t => t.FeeType)
            .Include(t => t.Receipt)
            .Include(t => t.Profile)
            .Include(t => t.Account).ThenInclude(a => a!.Profile)
            .Where(t =>
                t.ProfileId == app.ApplicantProfileId
                && t.FeeTypeId == fee.FeeTypeId
                && t.PaymentStatus.Code == "PENDING")
            .OrderByDescending(t => t.TransactionId)
            .FirstOrDefaultAsync(cancellationToken);

        if (open is not null)
        {
            if (open.ChequeDocumentId != doc.ApplicationDocumentId)
            {
                open.ChequeDocumentId = doc.ApplicationDocumentId;
                open.UpdatedByUserId = actorUserId;
                await _db.SaveChangesAsync(cancellationToken);
            }
            return await MapApprovedRow(open, cancellationToken);
        }

        decimal amount = 0;
        try
        {
            var dues = await GetApplicationDuesAsync(applicationId, cancellationToken);
            amount = feeCode == "JOINING" ? dues.JoiningBalance : dues.AnnualBalance;
            if (amount <= 0)
                amount = feeCode == "JOINING" ? dues.JoiningFee : dues.AnnualSubscription;
        }
        catch
        {
            amount = 0;
        }

        if (amount <= 0) amount = 0.01m; // keep row visible until finance confirms the cleared amount

        var tx = new MTransaction
        {
            ProfileId = app.ApplicantProfileId,
            FeeTypeId = fee.FeeTypeId,
            PaymentMethodId = chequeMethod.PaymentMethodId,
            PaymentStatusId = pendingStatus.PaymentStatusId,
            Amount = amount,
            PaymentDate = DateOnly.FromDateTime(doc.UploadedAt ?? (doc.CreatedAt == default ? DateTime.UtcNow : doc.CreatedAt)),
            ChequeDocumentId = doc.ApplicationDocumentId,
            ReferenceNote = $"Application cheque upload · {app.ApplicationNo}",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.Transactions.Add(tx);
        await _db.SaveChangesAsync(cancellationToken);
        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MTransaction",
            RecordId = tx.TransactionId,
            Action = "INSERT",
            NewValues = $"fromDocument={doc.ApplicationDocumentId}; application={applicationId}; fee={feeCode}; status=PENDING",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        tx.PaymentMethod = chequeMethod;
        tx.PaymentStatus = pendingStatus;
        tx.FeeType = fee;
        return await MapApprovedRow(tx, cancellationToken);
    }

    private async Task<PaymentRowDto> MapApprovedRow(MTransaction tx, CancellationToken cancellationToken)
    {
        string? fileName = null;
        string? fileUrl = null;
        if (tx.ChequeDocumentId is long docId)
        {
            var doc = await _db.ApplicationDocuments.AsNoTracking()
                .FirstOrDefaultAsync(d => d.ApplicationDocumentId == docId, cancellationToken);
            fileName = doc?.FileName;
            fileUrl = doc?.FileUrl;
        }
        return ToPaymentRow(tx, tx.Receipt?.ReceiptNumber, fileName, fileUrl);
    }

    private async Task ApplyPaidAmountToAccountAsync(
        long accountId,
        decimal amount,
        DateOnly paymentDate,
        long transactionId,
        long? actorUserId,
        CancellationToken cancellationToken,
        int? subscriptionYear = null)
    {
        var year = subscriptionYear ?? paymentDate.Year;
        var sub = await _db.Subscriptions.FirstOrDefaultAsync(
            s => s.AccountId == accountId && s.SubscriptionYear == year,
            cancellationToken);
        if (sub is null) return;

        sub.AmountPaid += amount;
        sub.ArrearsAmount = Math.Max(0, sub.AmountDue - sub.AmountPaid);
        if (sub.ArrearsAmount == 0)
        {
            var paidMemberStatus = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "PAID", cancellationToken);
            if (paidMemberStatus is not null) sub.SubscriptionStatusId = paidMemberStatus.MemberStatusId;
            var open = await _db.Arrearses
                .Where(a => a.AccountId == accountId && a.SubscriptionId == sub.SubscriptionId && a.Status == "OPEN")
                .ToListAsync(cancellationToken);
            foreach (var row in open)
            {
                row.Status = "SETTLED";
                row.SettledDate = paymentDate;
                row.SettledByTransactionId = transactionId;
            }
        }
        await _db.SaveChangesAsync(cancellationToken);
        await TryRestoreActiveMembershipAsync(accountId, actorUserId, cancellationToken);
    }

    private async Task ReversePaidAmountFromAccountAsync(
        long accountId,
        decimal amount,
        long transactionId,
        DateOnly paymentDate,
        CancellationToken cancellationToken)
    {
        var year = paymentDate.Year;
        var sub = await _db.Subscriptions.FirstOrDefaultAsync(
            s => s.AccountId == accountId && s.SubscriptionYear == year,
            cancellationToken);
        if (sub is not null)
        {
            sub.AmountPaid = Math.Max(0, sub.AmountPaid - amount);
            sub.ArrearsAmount = Math.Max(0, sub.AmountDue - sub.AmountPaid);
            if (sub.ArrearsAmount > 0)
            {
                var unpaid = await _db.MemberStatuses.FirstOrDefaultAsync(
                    s => s.Code == "UNPAID" || s.Code == "ARREARS" || s.Code == "DUE",
                    cancellationToken);
                if (unpaid is not null)
                    sub.SubscriptionStatusId = unpaid.MemberStatusId;
            }
        }

        var settledByTx = await _db.Arrearses
            .Where(a => a.SettledByTransactionId == transactionId)
            .ToListAsync(cancellationToken);
        foreach (var row in settledByTx)
        {
            row.Status = "OPEN";
            row.SettledDate = null;
            row.SettledByTransactionId = null;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// When annual arrears and joining dues are cleared, restore POSTED/REMOVED accounts to ACTIVE
    /// so member portal standing matches the paid-up ledger.
    /// </summary>
    private async Task TryRestoreActiveMembershipAsync(
        long accountId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var account = await _db.Accounts
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);
        if (account is null) return;

        var statusCode = (account.CurrentMemberStatus?.Code ?? "").Trim().ToUpperInvariant();
        if (statusCode is not "REMOVED" and not "POSTED") return;

        var year = DateTime.UtcNow.Year;
        var sub = await _db.Subscriptions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.AccountId == accountId && s.SubscriptionYear == year, cancellationToken);
        var subscriptionClear = sub is null || sub.ArrearsAmount <= 0 || sub.AmountPaid >= sub.AmountDue;

        var joiningDue = account.EntranceFeeWaivedFlag ? 0m : (account.EntranceFeeAmount ?? 0m);
        decimal joiningPaid = 0;
        if (joiningDue > 0)
        {
            joiningPaid = await _db.Transactions.AsNoTracking()
                .Where(t => t.AccountId == accountId
                    && t.FeeType != null
                    && (t.FeeType.Code == "JOINING" || t.FeeType.Code == "ENTRANCE")
                    && t.Amount > 0
                    && (t.PaymentStatus.Code == "PAID"
                        || t.PaymentStatus.Code == "WAIVED"
                        || t.PaymentStatus.Code == "PARTIALLY_PAID"
                        || t.PaymentStatus.Code == "SETTLED"
                        || t.PaymentStatus.Code == "REFUNDED"))
                .SumAsync(t => (decimal?)t.Amount, cancellationToken) ?? 0m;
        }
        var joiningClear = joiningDue <= 0 || joiningPaid >= joiningDue;
        if (!subscriptionClear || !joiningClear) return;

        var active = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "ACTIVE", cancellationToken);
        if (active is null) return;

        account.CurrentMemberStatusId = active.MemberStatusId;
        account.IsActive = true;
        account.EndDate = null;
        account.UpdatedByUserId = actorUserId;
        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MAccount",
            RecordId = account.AccountId,
            Action = "UPDATE",
            NewValues = $"restored ACTIVE after dues cleared (was {statusCode})",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static bool NeedsClearing(string methodCode) =>
        methodCode is "CHEQUE" or "CHEQUE_PAYMENT" or "CARD" or "CREDIT" or "CREDIT_CARD" or "CREDITCARD";

    private static bool NeedsApplicantClearance(string methodCode) =>
        methodCode is "MPESA" or "BANK_TRANSFER" or "BANKWIRE" or "BANK_WIRE" or "BANK";

    private static bool IsAnnualFee(string? feeCode)
    {
        var code = (feeCode ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        return code is "ANNUAL" or "SUBSCRIPTION" or "ANNUAL_SUBSCRIPTION";
    }

    private static bool IsNmFee(string? feeCode)
    {
        var code = (feeCode ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        return code is "ACCOMMODATION" or "CORKAGE" or "OTHER" or "CUSTOM" or "ROOM";
    }

    private static (string? Kind, long? ChargeId) ParseNmTag(string? note)
    {
        if (string.IsNullOrWhiteSpace(note)) return (null, null);
        var match = System.Text.RegularExpressions.Regex.Match(
            note,
            @"nm:(accommodation|corkage|custom):(\d+)",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!match.Success) return (null, null);
        return (match.Groups[1].Value.ToLowerInvariant(), long.Parse(match.Groups[2].Value));
    }

    public async Task<PaymentRowDto> EnsureReceiptAsync(
        long transactionId,
        long? requiredProfileId,
        long? actorUserId,
        CancellationToken cancellationToken,
        string? receiptNumber = null)
    {
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

        if (requiredProfileId is long profileId)
        {
            var accountIds = await _db.Accounts.AsNoTracking()
                .Where(a => a.ProfileId == profileId && !a.IsDeleted)
                .Select(a => a.AccountId)
                .ToListAsync(cancellationToken);
            var belongs =
                tx.ProfileId == profileId
                || (tx.AccountId is long accountId && accountIds.Contains(accountId));
            if (!belongs)
                throw new InvalidOperationException("Payment does not belong to this application.");
        }

        var desiredNumber = string.IsNullOrWhiteSpace(receiptNumber)
            ? $"RCT-{tx.TransactionId:D6}"
            : receiptNumber.Trim().ToUpperInvariant();

        var receipt = await _db.Receipts
            .FirstOrDefaultAsync(r => r.TransactionId == transactionId, cancellationToken);
        if (receipt is null)
        {
            var taken = await _db.Receipts.AsNoTracking()
                .AnyAsync(r => r.ReceiptNumber == desiredNumber, cancellationToken);
            if (taken)
                throw new InvalidOperationException($"Receipt number {desiredNumber} is already in use.");

            receipt = new MReceiptMaster
            {
                TransactionId = tx.TransactionId,
                ReceiptNumber = desiredNumber,
                Amount = tx.Amount,
                IssuedDate = tx.PaymentDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
                IssuedByUserId = actorUserId,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.Receipts.Add(receipt);
            await _db.SaveChangesAsync(cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(receiptNumber)
                 && !string.Equals(receipt.ReceiptNumber, desiredNumber, StringComparison.OrdinalIgnoreCase))
        {
            var taken = await _db.Receipts.AsNoTracking()
                .AnyAsync(r => r.ReceiptNumber == desiredNumber && r.ReceiptId != receipt.ReceiptId, cancellationToken);
            if (taken)
                throw new InvalidOperationException($"Receipt number {desiredNumber} is already in use.");
            receipt.ReceiptNumber = desiredNumber;
            await _db.SaveChangesAsync(cancellationToken);
        }

        if (tx.ReceiptId != receipt.ReceiptId)
        {
            tx.ReceiptId = receipt.ReceiptId;
            await _db.SaveChangesAsync(cancellationToken);
        }

        tx.Receipt = receipt;
        return await MapApprovedRow(tx, cancellationToken);
    }

    public async Task<MembershipReceiptDto> GetMembershipReceiptAsync(
        long transactionId,
        long? requiredProfileId,
        CancellationToken cancellationToken)
    {
        var tx = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentMethod)
            .Include(t => t.PaymentStatus)
            .Include(t => t.FeeType)
            .Include(t => t.Receipt)
            .Include(t => t.Profile)
            .Include(t => t.Account!)
                .ThenInclude(a => a.Profile)
            .Include(t => t.Account!)
                .ThenInclude(a => a.MembershipType)
            .FirstOrDefaultAsync(t => t.TransactionId == transactionId, cancellationToken)
            ?? throw new InvalidOperationException("Payment was not found.");

        if (requiredProfileId is long profileId)
        {
            var accountIds = await _db.Accounts.AsNoTracking()
                .Where(a => a.ProfileId == profileId && !a.IsDeleted)
                .Select(a => a.AccountId)
                .ToListAsync(cancellationToken);
            var belongs =
                tx.ProfileId == profileId
                || (tx.AccountId is long accountId && accountIds.Contains(accountId));
            if (!belongs)
                throw new InvalidOperationException("Receipt does not belong to this member.");
        }

        var statusCode = (tx.PaymentStatus?.Code ?? "").Trim().ToUpperInvariant().Replace("-", "_");
        if (statusCode is not ("PAID" or "WAIVED" or "SETTLED" or "PARTIALLY_PAID" or "REFUNDED" or "REVERSED"))
            throw new InvalidOperationException("Receipt is available only after the payment is cleared / paid.");

        var receipt = tx.Receipt
            ?? await _db.Receipts.AsNoTracking().FirstOrDefaultAsync(r => r.TransactionId == transactionId, cancellationToken);
        if (receipt is null)
            throw new InvalidOperationException("No receipt has been issued for this payment yet. Clear the payment first.");

        var tenant = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .OrderByDescending(t => t.IsActive)
            .FirstOrDefaultAsync(cancellationToken);

        string? issuedBy = null;
        if (receipt.IssuedByUserId is long issuerId)
        {
            var user = await _db.UserAccounts.AsNoTracking()
                .Include(u => u.Profile)
                .FirstOrDefaultAsync(u => u.UserAccountId == issuerId, cancellationToken);
            if (user?.Profile is { } issuerProfile)
            {
                var name = $"{issuerProfile.FirstName} {issuerProfile.LastName}".Trim();
                issuedBy = string.IsNullOrWhiteSpace(name) ? user.Username : name;
            }
            else
            {
                issuedBy = user?.Username;
            }
        }

        var profile = tx.Account?.Profile ?? tx.Profile;
        var payerName = profile is null
            ? "Member / Applicant"
            : $"{profile.FirstName} {profile.LastName}".Trim();
        if (string.IsNullOrWhiteSpace(payerName))
            payerName = "Member / Applicant";

        string? applicationNo = null;
        // Membership type is member-account only (not applicants / election type).
        string? membershipTypeName = tx.Account?.MembershipType?.Name;
        var profileKey = tx.ProfileId ?? tx.Account?.ProfileId;
        if (profileKey is long pid)
        {
            var app = await _db.Applications.AsNoTracking()
                .Where(a => a.ApplicantProfileId == pid)
                .OrderByDescending(a => a.ApplicationId)
                .FirstOrDefaultAsync(cancellationToken);
            applicationNo = app?.ApplicationNo;
        }

        var feeName = tx.FeeType?.Name ?? tx.FeeType?.Code ?? "Membership fee";
        var clubName = string.IsNullOrWhiteSpace(tenant?.Name) ? "Aero Club of East Africa" : tenant!.Name;
        var purpose = $"Being payment of {feeName} towards membership of {clubName}.";

        return new MembershipReceiptDto(
            tx.TransactionId,
            receipt.ReceiptId,
            clubName,
            tenant?.ShortName,
            tenant?.AddressLine,
            tenant?.ContactEmail,
            tenant?.ContactPhone,
            receipt.ReceiptNumber,
            receipt.IssuedDate.ToString("yyyy-MM-dd"),
            tx.PaymentDate?.ToString("yyyy-MM-dd"),
            payerName,
            tx.AccountId is long ? "Member" : "Applicant",
            tx.Account?.MembershipNo,
            applicationNo,
            membershipTypeName,
            feeName,
            tx.FeeType?.Code,
            tx.PaymentMethod?.Name ?? tx.PaymentMethod?.Code ?? "—",
            tx.PaymentMethod?.Code,
            tx.ChequeNo,
            tx.ChequeBankName,
            tx.ChequeBankCode,
            tx.MpesaCode,
            tx.ReferenceNote,
            receipt.Amount > 0 ? receipt.Amount : tx.Amount,
            AmountToWordsKes(receipt.Amount > 0 ? receipt.Amount : tx.Amount),
            "KES",
            ReceiptDisplayStatus(statusCode, tx.PaymentStatus?.Name),
            issuedBy,
            purpose);
    }

    private static string AmountToWordsKes(decimal amount)
    {
        var whole = (long)Math.Floor(Math.Abs(amount));
        var cents = (int)Math.Round((Math.Abs(amount) - whole) * 100m, MidpointRounding.AwayFromZero);
        if (cents == 100)
        {
            whole += 1;
            cents = 0;
        }

        var words = $"{NumberToWords(whole)} shilling{(whole == 1 ? "" : "s")}";
        if (cents > 0)
            words += $" and {NumberToWords(cents)} cent{(cents == 1 ? "" : "s")}";
        return char.ToUpperInvariant(words[0]) + words[1..] + " only";
    }

    private static string NumberToWords(long number)
    {
        if (number == 0) return "zero";
        if (number < 0) return "minus " + NumberToWords(Math.Abs(number));

        string[] units =
        [
            "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
            "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"
        ];
        string[] tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

        if (number < 20) return units[number];
        if (number < 100)
            return tens[number / 10] + (number % 10 == 0 ? "" : "-" + units[number % 10]);
        if (number < 1000)
            return units[number / 100] + " hundred" + (number % 100 == 0 ? "" : " and " + NumberToWords(number % 100));
        if (number < 1_000_000)
            return NumberToWords(number / 1000) + " thousand" + (number % 1000 == 0 ? "" : " " + NumberToWords(number % 1000));
        if (number < 1_000_000_000)
            return NumberToWords(number / 1_000_000) + " million" + (number % 1_000_000 == 0 ? "" : " " + NumberToWords(number % 1_000_000));
        return NumberToWords(number / 1_000_000_000) + " billion" + (number % 1_000_000_000 == 0 ? "" : " " + NumberToWords(number % 1_000_000_000));
    }

    public async Task<IReadOnlyList<PaymentRowDto>> ListPaymentsAsync(long? accountId, CancellationToken cancellationToken)
    {
        var paged = await ListPaymentsAsync(new PaymentListFilter(AccountId: accountId), new PagedRequest { Page = 1, PageSize = 100 }, cancellationToken);
        return paged.Items;
    }

    public async Task<PagedResult<PaymentRowDto>> ListPaymentsAsync(long? accountId, PagedRequest paging, CancellationToken cancellationToken) =>
        await ListPaymentsAsync(new PaymentListFilter(AccountId: accountId), paging, cancellationToken);

    public async Task<PagedResult<PaymentRowDto>> ListPaymentsAsync(
        PaymentListFilter filter,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var status = (filter.Status ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        if (status is "PENDING" or "UNCLEARED" or "CLEARANCE")
            await SyncPendingChequeDocumentsAsync(cancellationToken);

        var query = _db.Transactions.AsNoTracking().AsQueryable();
        query = query.Where(t => t.Amount > 0);
        if (filter.AccountId is not null)
            query = query.Where(t => t.AccountId == filter.AccountId);
        if (filter.Year is int year)
            query = query.Where(t => t.PaymentDate != null && t.PaymentDate.Value.Year == year);
        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            if (status is "SETTLED" or "PAID")
                query = query.Where(t =>
                    t.Amount > 0
                    && (t.PaymentStatus.Code == "PAID"
                    || t.PaymentStatus.Code == "WAIVED"
                    || t.PaymentStatus.Code == "PARTIALLY_PAID"
                    || t.PaymentStatus.Code == "REFUNDED"
                    || t.PaymentStatus.Code == "REVERSED"));
            else if (status is "PENDING" or "UNCLEARED" or "CLEARANCE")
                query = query.Where(t =>
                    t.PaymentStatus.Code == "PENDING"
                    || t.PaymentStatus.Code == "INITIATED"
                    || t.PaymentStatus.Code == "UNCLEARED");
            else if (status is "UNRECEIPTED")
                query = query.Where(t =>
                    (t.PaymentStatus.Code == "PAID"
                        || t.PaymentStatus.Code == "WAIVED"
                        || t.PaymentStatus.Code == "PARTIALLY_PAID")
                    && t.ReceiptId == null
                    && !_db.Receipts.Any(r => r.TransactionId == t.TransactionId));
            else
                query = query.Where(t => t.PaymentStatus.Code == status || t.PaymentStatus.Name == filter.Status);
        }
        if (!string.IsNullOrWhiteSpace(filter.Method))
        {
            var method = filter.Method.Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
            query = query.Where(t =>
                t.PaymentMethod.Code == method
                || t.PaymentMethod.Name.ToUpper().Contains(method));
        }
        if (!string.IsNullOrWhiteSpace(filter.FeeType))
        {
            var fee = filter.FeeType.Trim().ToUpperInvariant();
            query = query.Where(t =>
                t.FeeType != null
                && (t.FeeType.Code == fee || t.FeeType.Name.ToUpper().Contains(fee)));
        }
        if (!string.IsNullOrWhiteSpace(filter.MembershipType))
        {
            // Membership type applies to members (accounts) only — never applicants.
            var mtRaw = filter.MembershipType.Trim();
            var mt = NormalizeMembershipKey(mtRaw);
            var matchingTypeIds = await _db.MembershipTypes.AsNoTracking()
                .Where(x =>
                    x.Code.ToUpper().Replace("-", "_").Replace(" ", "_") == mt
                    || x.Name.ToUpper().Contains(mtRaw.ToUpper())
                    || x.Code.ToUpper().Contains(mt))
                .Select(x => x.MembershipTypeId)
                .ToListAsync(cancellationToken);

            query = query.Where(t =>
                t.AccountId != null
                && t.Account != null
                && matchingTypeIds.Contains(t.Account.MembershipTypeId));
        }
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim().ToLowerInvariant();
            query = query.Where(t =>
                (t.Account != null && t.Account.MembershipNo != null && t.Account.MembershipNo.ToLower().Contains(term))
                || (t.Account != null && t.Account.Profile != null && (
                    (t.Account.Profile.FirstName + " " + t.Account.Profile.LastName).ToLower().Contains(term)
                    || (t.Account.Profile.LastName + " " + t.Account.Profile.FirstName).ToLower().Contains(term)))
                || (t.Profile != null && (
                    (t.Profile.FirstName + " " + t.Profile.LastName).ToLower().Contains(term)))
                || (t.Receipt != null && t.Receipt.ReceiptNumber != null && t.Receipt.ReceiptNumber.ToLower().Contains(term))
                || (t.MpesaCode != null && t.MpesaCode.ToLower().Contains(term))
                || (t.ChequeNo != null && t.ChequeNo.ToLower().Contains(term))
                || (t.ReferenceNote != null && t.ReferenceNote.ToLower().Contains(term)));
        }

        return await MapPaymentRows(query, paging, cancellationToken);
    }

    public async Task<IReadOnlyList<PaymentRowDto>> ListPaymentsByProfileAsync(long profileId, CancellationToken cancellationToken)
    {
        var accountIds = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => a.AccountId)
            .ToListAsync(cancellationToken);
        var query = _db.Transactions.AsNoTracking().Where(t =>
            t.Amount > 0
            && (t.ProfileId == profileId
                || (t.AccountId != null && accountIds.Contains(t.AccountId.Value))));
        return await MapPaymentRows(query, cancellationToken);
    }

    private async Task<IReadOnlyList<PaymentRowDto>> MapPaymentRows(
        IQueryable<MTransaction> query,
        CancellationToken cancellationToken)
    {
        var paged = await MapPaymentRows(query, new PagedRequest { Page = 1, PageSize = 100 }, cancellationToken);
        return paged.Items;
    }

    private async Task<PagedResult<PaymentRowDto>> MapPaymentRows(
        IQueryable<MTransaction> query,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var total = await query.CountAsync(cancellationToken);
        var rows = await query
            .Include(t => t.PaymentMethod)
            .Include(t => t.PaymentStatus)
            .Include(t => t.FeeType)
            .Include(t => t.Receipt)
            .Include(t => t.Profile)
            .Include(t => t.Account)
                .ThenInclude(a => a!.Profile)
            .Include(t => t.Account)
                .ThenInclude(a => a!.MembershipType)
            .OrderByDescending(t => t.PaymentDate)
            .ThenByDescending(t => t.TransactionId)
            .Skip(paging.Skip)
            .Take(paging.PageSize)
            .ToListAsync(cancellationToken);

        var txIds = rows.Select(t => t.TransactionId).ToList();
        var receiptRows = txIds.Count == 0
            ? []
            : await _db.Receipts.AsNoTracking()
                .Where(r => txIds.Contains(r.TransactionId))
                .Select(r => new { r.TransactionId, r.ReceiptNumber })
                .ToListAsync(cancellationToken);
        var receipts = receiptRows
            .GroupBy(r => r.TransactionId)
            .ToDictionary(g => g.Key, g => g.First().ReceiptNumber);

        var docIds = rows
            .Where(t => t.ChequeDocumentId != null)
            .Select(t => t.ChequeDocumentId!.Value)
            .Distinct()
            .ToList();
        var chequeDocs = docIds.Count == 0
            ? new Dictionary<long, AplicationDocument>()
            : await _db.ApplicationDocuments.AsNoTracking()
                .Where(d => docIds.Contains(d.ApplicationDocumentId))
                .ToDictionaryAsync(d => d.ApplicationDocumentId, cancellationToken);

        var profileIds = rows
            .Select(t => t.ProfileId ?? t.Account?.ProfileId)
            .Where(id => id is > 0)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();
        var applications = profileIds.Count == 0
            ? new Dictionary<long, (long ApplicationId, string ApplicationNo)>()
            : (await _db.Applications.AsNoTracking()
                .Where(a => profileIds.Contains(a.ApplicantProfileId))
                .Select(a => new { a.ApplicantProfileId, a.ApplicationId, a.ApplicationNo })
                .ToListAsync(cancellationToken))
                .GroupBy(a => a.ApplicantProfileId)
                .ToDictionary(
                    g => g.Key,
                    g =>
                    {
                        var latest = g.OrderByDescending(x => x.ApplicationId).First();
                        return (latest.ApplicationId, latest.ApplicationNo);
                    });

        // Resolve membership types for members only, via account id → membership_type_id.
        // Do not rely on Account.MembershipType Include (tenant query filters often leave it null).
        var accountIds = rows
            .Select(t => t.AccountId ?? t.Account?.AccountId)
            .Where(id => id is > 0)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();
        var accountTypeIds = accountIds.Count == 0
            ? new Dictionary<long, long>()
            : await _db.Accounts.AsNoTracking()
                .IgnoreQueryFilters()
                .Where(a => accountIds.Contains(a.AccountId) && !a.IsDeleted)
                .ToDictionaryAsync(a => a.AccountId, a => a.MembershipTypeId, cancellationToken);
        var membershipTypeIds = accountTypeIds.Values.Where(id => id > 0).Distinct().ToList();
        var membershipTypes = membershipTypeIds.Count == 0
            ? new Dictionary<long, (string Name, string Code)>()
            : (await _db.MembershipTypes.AsNoTracking()
                .IgnoreQueryFilters()
                .Where(mt => membershipTypeIds.Contains(mt.MembershipTypeId))
                .Select(mt => new { mt.MembershipTypeId, mt.Name, mt.Code })
                .ToListAsync(cancellationToken))
                .ToDictionary(mt => mt.MembershipTypeId, mt => (mt.Name, mt.Code));

        var items = rows.Select(t =>
        {
            var receiptNo = t.Receipt?.ReceiptNumber;
            if (string.IsNullOrWhiteSpace(receiptNo))
                receipts.TryGetValue(t.TransactionId, out receiptNo);
            AplicationDocument? chequeDoc = null;
            if (t.ChequeDocumentId is long docId)
                chequeDocs.TryGetValue(docId, out chequeDoc);
            long? applicationId = null;
            string? applicationNo = null;
            var profileKey = t.ProfileId ?? t.Account?.ProfileId;
            if (profileKey is long pid && applications.TryGetValue(pid, out var app))
            {
                applicationId = app.ApplicationId;
                applicationNo = app.ApplicationNo;
            }

            // Membership type for members (accounts) only — never applicants.
            string? membershipType = null;
            string? membershipTypeCode = null;
            var accountId = t.AccountId ?? t.Account?.AccountId;
            if (accountId is long aid
                && accountTypeIds.TryGetValue(aid, out var typeId)
                && membershipTypes.TryGetValue(typeId, out var memberType))
            {
                membershipType = memberType.Name;
                membershipTypeCode = memberType.Code;
            }

            return ToPaymentRow(
                t,
                receiptNo,
                chequeDoc?.FileName,
                chequeDoc?.FileUrl,
                applicationId,
                applicationNo,
                membershipType,
                membershipTypeCode);
        }).ToList();
        return Paging.Create(items, paging, total);
    }

    private static PaymentRowDto ToPaymentRow(
        MTransaction t,
        string? receiptNumber,
        string? chequeFileName = null,
        string? chequeFileUrl = null,
        long? applicationId = null,
        string? applicationNo = null,
        string? membershipType = null,
        string? membershipTypeCode = null)
    {
        var memberName = t.Account?.Profile is { } accountProfile
            ? $"{accountProfile.FirstName} {accountProfile.LastName}".Trim()
            : t.Profile is { } profile
                ? $"{profile.FirstName} {profile.LastName}".Trim()
                : null;
        return new PaymentRowDto(
            t.TransactionId,
            receiptNumber,
            string.IsNullOrWhiteSpace(memberName) ? null : memberName,
            t.PaymentMethod?.Name,
            t.PaymentStatus?.Name,
            t.Amount,
            t.PaymentDate,
            t.MpesaCode,
            t.ChequeNo,
            t.FeeType?.Name,
            t.ReferenceNote,
            t.ChequeBankName,
            t.ChequeBankCode,
            t.ChequeDate,
            chequeFileName,
            chequeFileUrl,
            t.PaymentMethod?.Code,
            t.Account?.MembershipNo,
            t.PaymentStatus?.Code,
            t.FeeType?.Code,
            applicationId,
            applicationNo,
            t.CreatedAt,
            t.ProfileId ?? t.Account?.ProfileId,
            membershipType,
            membershipTypeCode);
    }

    public async Task<IReadOnlyList<SubscriptionRowDto>> ListSubscriptionsAsync(int? year, CancellationToken cancellationToken)
    {
        var paged = await ListSubscriptionsAsync(new SubscriptionListFilter(Year: year), new PagedRequest { Page = 1, PageSize = 100 }, cancellationToken);
        return paged.Items;
    }

    public async Task<PagedResult<SubscriptionRowDto>> ListSubscriptionsAsync(int? year, PagedRequest paging, CancellationToken cancellationToken) =>
        await ListSubscriptionsAsync(new SubscriptionListFilter(Year: year), paging, cancellationToken);

    public async Task<PagedResult<SubscriptionRowDto>> ListSubscriptionsAsync(
        SubscriptionListFilter filter,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var y = filter.Year ?? DateTime.UtcNow.Year;
        var query = _db.Subscriptions.AsNoTracking().Where(s => s.SubscriptionYear == y);
        if (filter.ArrearsOnly)
            query = query.Where(s => s.ArrearsAmount > 0 || s.AmountPaid < s.AmountDue);
        if (!string.IsNullOrWhiteSpace(filter.MembershipType))
        {
            var mtRaw = filter.MembershipType.Trim();
            var mt = NormalizeMembershipKey(mtRaw);
            query = query.Where(s =>
                s.Account.MembershipType.Code.ToUpper().Replace("-", "_").Replace(" ", "_") == mt
                || s.Account.MembershipType.Name.ToUpper().Contains(mtRaw.ToUpper())
                || s.Account.MembershipType.Code.ToUpper().Contains(mt));
        }
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim().ToLowerInvariant();
            query = query.Where(s =>
                (s.Account.MembershipNo != null && s.Account.MembershipNo.ToLower().Contains(term))
                || (s.Account.Profile.FirstName + " " + s.Account.Profile.LastName).ToLower().Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var rows = await query
            .Include(s => s.Account)
                .ThenInclude(a => a.Profile)
            .Include(s => s.Account)
                .ThenInclude(a => a.CurrentMemberStatus)
            .Include(s => s.Status)
            .OrderByDescending(s => s.ArrearsAmount)
            .ThenBy(s => s.Account.MembershipNo)
            .Skip(paging.Skip)
            .Take(paging.PageSize)
            .ToListAsync(cancellationToken);

        var typeIds = rows.Select(s => s.Account.MembershipTypeId).Where(id => id > 0).Distinct().ToList();
        // Prefer account ids from this page in case Include left MembershipTypeId stale.
        var accountIdsForTypes = rows.Select(s => s.AccountId).Distinct().ToList();
        var accountTypeMap = await _db.Accounts.AsNoTracking()
            .IgnoreQueryFilters()
            .Where(a => accountIdsForTypes.Contains(a.AccountId))
            .Select(a => new { a.AccountId, a.MembershipTypeId })
            .ToListAsync(cancellationToken);
        foreach (var row in accountTypeMap)
        {
            if (row.MembershipTypeId > 0)
                typeIds.Add(row.MembershipTypeId);
        }
        typeIds = typeIds.Distinct().ToList();

        var types = typeIds.Count == 0
            ? new Dictionary<long, (string Name, string Code)>()
            : (await _db.MembershipTypes.AsNoTracking()
                .IgnoreQueryFilters()
                .Where(mt => typeIds.Contains(mt.MembershipTypeId))
                .Select(mt => new { mt.MembershipTypeId, mt.Name, mt.Code })
                .ToListAsync(cancellationToken))
                .ToDictionary(mt => mt.MembershipTypeId, mt => (mt.Name, mt.Code));

        var accountToTypeId = accountTypeMap.ToDictionary(a => a.AccountId, a => a.MembershipTypeId);

        var items = rows.Select(s =>
        {
            string? typeName = null;
            string? typeCode = null;
            var typeId = accountToTypeId.TryGetValue(s.AccountId, out var tid) ? tid : s.Account.MembershipTypeId;
            if (types.TryGetValue(typeId, out var mt))
            {
                typeName = mt.Name;
                typeCode = mt.Code;
            }
            return new SubscriptionRowDto(
                s.SubscriptionId,
                s.AccountId,
                s.Account.MembershipNo ?? "",
                (s.Account.Profile.FirstName + " " + s.Account.Profile.LastName).Trim(),
                s.SubscriptionYear,
                s.AmountDue,
                s.AmountPaid,
                s.ArrearsAmount,
                s.Status.Name,
                s.DueDate,
                s.PostedDate,
                s.RemovalDate,
                typeName,
                typeCode,
                s.Account.CurrentMemberStatus?.Name,
                s.Account.CurrentMemberStatus?.Code);
        }).ToList();

        return Paging.Create(items, paging, total);
    }

    public async Task<IReadOnlyList<SettlementMemberHitDto>> SearchSettlementMembersAsync(
        string? search,
        int? year,
        CancellationToken cancellationToken)
    {
        var term = (search ?? "").Trim();
        if (term.Length < 2) return [];
        var y = year ?? DateTime.UtcNow.Year;
        var lower = term.ToLowerInvariant();

        var accounts = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .Include(a => a.Application)
            .Where(a => !a.IsDeleted)
            .Where(a =>
                (a.MembershipNo != null && a.MembershipNo.ToLower().Contains(lower))
                || (a.Profile.Email != null && a.Profile.Email.ToLower().Contains(lower))
                || ((a.Profile.FirstName ?? "") + " " + (a.Profile.LastName ?? "")).ToLower().Contains(lower)
                || (a.ApplicationId.HasValue && a.ApplicationId.Value.ToString().Contains(term))
                || (a.Application != null && (a.Application.ApplicationNo ?? "").ToLower().Contains(lower)))
            .OrderBy(a => a.MembershipNo)
            .Take(25)
            .ToListAsync(cancellationToken);

        if (accounts.Count == 0)
        {
            // Fallback: application no / APP-#### search without requiring Application nav filter translation.
            accounts = await _db.Accounts.AsNoTracking()
                .Include(a => a.Profile)
                .Include(a => a.MembershipType)
                .Include(a => a.CurrentMemberStatus)
                .Where(a => !a.IsDeleted)
                .Take(300)
                .ToListAsync(cancellationToken);
            accounts = accounts
                .Where(a =>
                    $"{a.MembershipNo} {a.Profile.FirstName} {a.Profile.LastName} {a.Profile.Email} APP-{a.ApplicationId} {a.ApplicationId}"
                        .Contains(term, StringComparison.OrdinalIgnoreCase))
                .Take(25)
                .ToList();
        }

        var accountIds = accounts.Select(a => a.AccountId).ToList();
        var subs = await _db.Subscriptions.AsNoTracking()
            .Where(s => accountIds.Contains(s.AccountId) && s.SubscriptionYear == y)
            .Select(s => new { s.AccountId, s.SubscriptionId, s.ArrearsAmount })
            .ToListAsync(cancellationToken);
        var subByAccount = subs
            .GroupBy(s => s.AccountId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.ArrearsAmount).First());

        return accounts.Select(a =>
        {
            subByAccount.TryGetValue(a.AccountId, out var sub);
            return new SettlementMemberHitDto(
                a.AccountId,
                sub?.SubscriptionId,
                a.MembershipNo ?? "",
                $"{a.Profile.FirstName} {a.Profile.LastName}".Trim(),
                a.CurrentMemberStatus?.Name ?? "—",
                a.MembershipType?.Name,
                sub?.ArrearsAmount ?? 0,
                y);
        }).ToList();
    }

    public async Task<SettlementContextDto> GetSettlementContextAsync(
        long accountId,
        int? year,
        long? subscriptionId,
        CancellationToken cancellationToken)
    {
        var y = year ?? DateTime.UtcNow.Year;
        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Member account was not found.");

        var subQuery = _db.Subscriptions.AsQueryable().Where(s => s.AccountId == accountId);
        var sub = subscriptionId is long sid
            ? await subQuery.Include(s => s.Status).FirstOrDefaultAsync(s => s.SubscriptionId == sid, cancellationToken)
            : await subQuery.Include(s => s.Status)
                .Where(s => s.SubscriptionYear == y)
                .OrderByDescending(s => s.ArrearsAmount)
                .FirstOrDefaultAsync(cancellationToken);
        if (sub is null)
            throw new InvalidOperationException($"No subscription was found for this member in {y}.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (eligibleSenior, seniorReason) = EvaluateSeniorEligibility(account, today);
        var suggestedAfterSenior = eligibleSenior
            ? Math.Round(Math.Max(0, (sub.AmountDue * 0.5m) - sub.AmountPaid), 2)
            : sub.ArrearsAmount;
        if (suggestedAfterSenior < 0) suggestedAfterSenior = 0;

        var statusCode = (account.CurrentMemberStatus?.Code ?? "").ToUpperInvariant();
        var canReactivate = statusCode is "REMOVED" or "POSTED";
        decimal reactivationFee = 0;
        if (canReactivate && statusCode == "REMOVED")
        {
            var schedule = await _db.MembershipFeeSchedules.AsNoTracking()
                .Where(x => x.IsActive && x.MembershipTypeId == account.MembershipTypeId && x.EffectiveDate <= today)
                .OrderByDescending(x => x.EffectiveDate)
                .FirstOrDefaultAsync(cancellationToken);
            if (schedule is not null)
            {
                var dob = account.Profile.DateOfBirth;
                var age = dob is DateOnly d
                    ? today.Year - d.Year - (today < d.AddYears(today.Year - d.Year) ? 1 : 0)
                    : 30;
                reactivationFee = age < 30 ? schedule.JoiningFeeUnder30 : schedule.JoiningFee;
            }
        }

        return new SettlementContextDto(
            account.AccountId,
            sub.SubscriptionId,
            $"{account.Profile.FirstName} {account.Profile.LastName}".Trim(),
            account.MembershipNo ?? "",
            account.CurrentMemberStatus?.Name ?? sub.Status.Name,
            statusCode,
            account.MembershipType?.Name,
            sub.SubscriptionYear,
            sub.AmountDue,
            sub.AmountPaid,
            sub.ArrearsAmount,
            eligibleSenior,
            seniorReason,
            suggestedAfterSenior,
            canReactivate && statusCode == "REMOVED",
            reactivationFee);
    }

    public async Task<DirectSettlementResultDto> DirectSettleAsync(
        DirectSettlementRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        if (request.AmountPaid <= 0)
            throw new InvalidOperationException("Amount paid must be greater than zero.");

        var paymentDate = request.PaymentDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var methodCode = NormalizeSettlementMethodCode(request.PaymentMethodCode);
        if (methodCode is not "CASH" && string.IsNullOrWhiteSpace(request.ReferenceCode))
            throw new InvalidOperationException("Transaction / reference code is required for this payment method.");

        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.AccountId == request.AccountId && !a.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Member account was not found.");

        var sub = request.SubscriptionId is long sid
            ? await _db.Subscriptions.Include(s => s.Status).FirstOrDefaultAsync(s => s.SubscriptionId == sid && s.AccountId == account.AccountId, cancellationToken)
            : await _db.Subscriptions.Include(s => s.Status)
                .Where(s => s.AccountId == account.AccountId && s.SubscriptionYear == paymentDate.Year)
                .OrderByDescending(s => s.ArrearsAmount)
                .FirstOrDefaultAsync(cancellationToken);
        if (sub is null)
            throw new InvalidOperationException("Subscription was not found for settlement.");

        // Align payment date year with the subscription being cleared.
        if (paymentDate.Year != sub.SubscriptionYear)
            paymentDate = new DateOnly(sub.SubscriptionYear, Math.Min(12, paymentDate.Month), Math.Min(28, paymentDate.Day));

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (eligibleSenior, _) = EvaluateSeniorEligibility(account, today);
        decimal seniorDiscountApplied = 0;
        if (request.ApplySeniorDiscount && !eligibleSenior)
            throw new InvalidOperationException("This member is not eligible for the senior discount (age 55+ with 25+ years membership).");

        // Preview arrears after optional senior discount (applied inside the DB transaction).
        var typeCode = (account.MembershipType?.Code ?? "").Trim().ToUpperInvariant();
        var previewDue = sub.AmountDue;
        var previewPaid = sub.AmountPaid;
        if (request.ApplySeniorDiscount && typeCode is not "SENIOR" and not "SENIOR_LIFE")
            previewDue = Math.Round(sub.AmountDue * 0.5m, 2);
        var previewArrears = Math.Max(0, previewDue - previewPaid);
        if (request.AmountPaid > previewArrears + 0.01m)
            throw new InvalidOperationException($"Amount paid cannot exceed outstanding arrears ({previewArrears:0.00}).");

        var paymentMethod = await ResolveSettlementPaymentMethodAsync(methodCode, cancellationToken);
        var annualFee = await _db.FeeTypes.FirstOrDefaultAsync(f => f.Code == "ANNUAL", cancellationToken)
            ?? throw new InvalidOperationException("ANNUAL fee type is not configured.");

        await using var dbTx = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            if (request.ApplySeniorDiscount && typeCode is not "SENIOR" and not "SENIOR_LIFE")
            {
                var discountedDue = Math.Round(sub.AmountDue * 0.5m, 2);
                if (discountedDue < sub.AmountDue)
                {
                    seniorDiscountApplied = sub.AmountDue - discountedDue;
                    sub.AmountDue = discountedDue;
                    sub.ArrearsAmount = Math.Max(0, sub.AmountDue - sub.AmountPaid);
                    await _db.SaveChangesAsync(cancellationToken);
                }
            }

            var annualRow = await RecordPaymentAsync(new RecordPaymentRequest(
                account.AccountId,
                null,
                annualFee.FeeTypeId,
                paymentMethod.PaymentMethodId,
                request.AmountPaid,
                paymentDate,
                methodCode == "CHEQUE" ? request.ReferenceCode?.Trim() : null,
                methodCode is "MPESA" or "MPESA_STK" ? request.ReferenceCode?.Trim() : null,
                BuildSettlementReferenceNote(methodCode, request.ReferenceCode, request.ApplySeniorDiscount, request.IncludeReactivationFee),
                "PAID",
                methodCode == "CHEQUE" ? "Finance desk" : null,
                null,
                methodCode == "CHEQUE" ? paymentDate : null,
                null,
                null), actorUserId, cancellationToken);

            decimal reactivationCharged = 0;
            PaymentRowDto? reactivationRow = null;
            var statusCode = (account.CurrentMemberStatus?.Code ?? "").ToUpperInvariant();
            if (request.IncludeReactivationFee)
            {
                if (statusCode != "REMOVED")
                    throw new InvalidOperationException("Re-activation fee applies only when the member status is Removed.");
                var schedule = await _db.MembershipFeeSchedules.AsNoTracking()
                    .Where(x => x.IsActive && x.MembershipTypeId == account.MembershipTypeId && x.EffectiveDate <= today)
                    .OrderByDescending(x => x.EffectiveDate)
                    .FirstOrDefaultAsync(cancellationToken)
                    ?? throw new InvalidOperationException("No fee schedule found for reactivation fee.");
                var dob = account.Profile.DateOfBirth;
                var age = dob is DateOnly d
                    ? today.Year - d.Year - (today < d.AddYears(today.Year - d.Year) ? 1 : 0)
                    : 30;
                reactivationCharged = age < 30 ? schedule.JoiningFeeUnder30 : schedule.JoiningFee;
                if (reactivationCharged > 0)
                {
                    var joiningFee = await _db.FeeTypes.FirstOrDefaultAsync(f => f.Code == "JOINING", cancellationToken)
                        ?? throw new InvalidOperationException("JOINING fee type is not configured.");
                    reactivationRow = await RecordPaymentAsync(new RecordPaymentRequest(
                        account.AccountId,
                        null,
                        joiningFee.FeeTypeId,
                        paymentMethod.PaymentMethodId,
                        reactivationCharged,
                        paymentDate,
                        methodCode == "CHEQUE" ? request.ReferenceCode?.Trim() : null,
                        methodCode is "MPESA" or "MPESA_STK" ? request.ReferenceCode?.Trim() : null,
                        "Re-activation / entrance fee on direct settlement",
                        "PAID",
                        methodCode == "CHEQUE" ? "Finance desk" : null,
                        null,
                        methodCode == "CHEQUE" ? paymentDate : null,
                        null,
                        null), actorUserId, cancellationToken);
                }
            }

            // Reload subscription after ApplyPaidAmountToAccountAsync inside RecordPayment.
            await _db.Entry(sub).ReloadAsync(cancellationToken);
            var remaining = sub.ArrearsAmount;
            var reactivated = false;
            if (remaining <= 0 && statusCode is "REMOVED" or "POSTED")
            {
                var active = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "ACTIVE", cancellationToken)
                    ?? throw new InvalidOperationException("ACTIVE member status is not configured.");
                account.CurrentMemberStatusId = active.MemberStatusId;
                account.IsActive = true;
                account.EndDate = null;
                account.UpdatedByUserId = actorUserId;
                _db.AuditLogs.Add(new AuditLog
                {
                    TableName = "MAccount",
                    RecordId = account.AccountId,
                    Action = "UPDATE",
                    NewValues = $"direct-settlement:reactivated from {statusCode}; annualTx={annualRow.TransactionId}",
                    ChangedByUserId = actorUserId,
                    ChangedAt = DateTime.UtcNow
                });
                await _db.SaveChangesAsync(cancellationToken);
                reactivated = true;
                statusCode = "ACTIVE";
            }

            await dbTx.CommitAsync(cancellationToken);

            var statusName = reactivated
                ? "Active"
                : (account.CurrentMemberStatus?.Name ?? statusCode);
            if (reactivated)
            {
                var activeName = await _db.MemberStatuses.AsNoTracking()
                    .Where(s => s.Code == "ACTIVE")
                    .Select(s => s.Name)
                    .FirstOrDefaultAsync(cancellationToken);
                statusName = activeName ?? "Active";
            }

            return new DirectSettlementResultDto(
                account.AccountId,
                account.MembershipNo ?? "",
                $"{account.Profile.FirstName} {account.Profile.LastName}".Trim(),
                statusName,
                reactivated,
                request.AmountPaid,
                seniorDiscountApplied,
                reactivationCharged,
                remaining,
                annualRow.ReceiptNumber ?? reactivationRow?.ReceiptNumber,
                annualRow.TransactionId);
        }
        catch
        {
            await dbTx.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static (bool Eligible, string? Reason) EvaluateSeniorEligibility(MAccount account, DateOnly today)
    {
        var typeCode = (account.MembershipType?.Code ?? "").Trim().ToUpperInvariant();
        if (typeCode is "SENIOR" or "SENIOR_LIFE")
            return (true, "Membership class already includes senior privileges.");

        var dob = account.Profile.DateOfBirth;
        if (dob is null) return (false, null);
        var age = today.Year - dob.Value.Year - (today < dob.Value.AddYears(today.Year - dob.Value.Year) ? 1 : 0);
        var joined = account.JoinedDate ?? account.StartDate;
        var years = joined is null ? 0 : today.Year - joined.Value.Year - (today < joined.Value.AddYears(today.Year - joined.Value.Year) ? 1 : 0);
        if (age >= 55 && years >= 25)
            return (true, "Age 55+ with 25+ years continuous membership — 50% annual subscription.");
        return (false, null);
    }

    private static string NormalizeSettlementMethodCode(string? raw)
    {
        var code = (raw ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        return code switch
        {
            "MPESA_EXPRESS" or "MPESA_STK" or "STK" or "STK_PUSH" => "MPESA",
            "MPESA_MANUAL" or "MPESA_REFERENCE" or "MPESA_REF" => "MPESA",
            "CREDIT" or "DEBIT" or "CREDIT_CARD" or "DEBIT_CARD" => "CARD",
            _ => code
        };
    }

    private async Task<PaymentMethod> ResolveSettlementPaymentMethodAsync(string methodCode, CancellationToken cancellationToken)
    {
        var method = await _db.PaymentMethods.FirstOrDefaultAsync(
            m => m.IsActive && (m.Code == methodCode || m.Code.ToUpper() == methodCode),
            cancellationToken);
        if (method is not null) return method;
        // STK / manual both map to MPESA seed row.
        if (methodCode == "MPESA")
        {
            method = await _db.PaymentMethods.FirstOrDefaultAsync(m => m.Code == "MPESA", cancellationToken);
            if (method is not null) return method;
        }
        throw new InvalidOperationException($"Payment method '{methodCode}' was not found.");
    }

    private static string BuildSettlementReferenceNote(
        string methodCode,
        string? reference,
        bool senior,
        bool reactivation)
    {
        var parts = new List<string> { "Direct settlement (finance desk)" };
        if (methodCode is "MPESA" && !string.IsNullOrWhiteSpace(reference))
            parts.Add($"ref={reference.Trim()}");
        if (methodCode is "CARD" && !string.IsNullOrWhiteSpace(reference))
            parts.Add($"card-ref={reference.Trim()}");
        if (senior) parts.Add("senior-discount");
        if (reactivation) parts.Add("with-reactivation-fee");
        return string.Join("; ", parts);
    }

    public async Task<SubscriptionLifecycleResultDto> EnforceSubscriptionLifecycleAsync(CancellationToken cancellationToken) =>
        await RunSubscriptionLifecycleCoreAsync(
            DateTime.UtcNow.Year,
            actorUserId: null,
            clearUnpaidFutureYears: false,
            cancellationToken);

    public async Task<SubscriptionLifecycleResultDto> RunSubscriptionLifecycleForYearAsync(
        int year,
        long? actorUserId,
        CancellationToken cancellationToken) =>
        await RunSubscriptionLifecycleCoreAsync(
            year,
            actorUserId,
            clearUnpaidFutureYears: true,
            cancellationToken);

    public async Task<int> RunPostingAsync(int year, long? actorUserId, CancellationToken cancellationToken)
    {
        var result = await RunSubscriptionLifecycleCoreAsync(
            year,
            actorUserId,
            clearUnpaidFutureYears: true,
            cancellationToken);
        return result.TotalUpdated;
    }

    /// <summary>
    /// Aero Club annual subscription lifecycle:
    /// 1 Jan — generate unpaid annual subscriptions;
    /// after 28 Feb — POSTED + restrict access;
    /// after 30 Apr — payment status UNPAID, member remains ACTIVE (not removed).
    /// When <paramref name="clearUnpaidFutureYears"/> is true (Finance demo button), unpaid rows for
    /// years after the selected year are removed so the member Payment card can toggle back.
    /// </summary>
    private async Task<SubscriptionLifecycleResultDto> RunSubscriptionLifecycleCoreAsync(
        int year,
        long? actorUserId,
        bool clearUnpaidFutureYears,
        CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var clearedFuture = clearUnpaidFutureYears
            ? await ClearUnpaidFutureSubscriptionsBeyondAsync(year, actorUserId, cancellationToken)
            : 0;

        var restored = await RestoreRemovedUnpaidMembersAsync(today, actorUserId, cancellationToken);
        var generated = await GenerateAnnualSubscriptionsForYearAsync(year, actorUserId, cancellationToken);
        const int invoicesIssued = 0;

        var posted = 0;
        var unpaidKeptActive = 0;
        if (today >= new DateOnly(year, 4, 30))
            unpaidKeptActive = await MarkUnpaidKeepMemberActiveAsync(year, today, actorUserId, cancellationToken);
        else if (today >= new DateOnly(year, 2, 28))
            posted = await ApplyUnpaidStatusAsync(year, today, "POSTED", actorUserId, cancellationToken);

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "Subscription",
            RecordId = year,
            Action = "UPDATE",
            NewValues = $"lifecycle:generated={generated};posted={posted};unpaidActive={unpaidKeptActive};restored={restored};futureCleared={clearedFuture};invoices={invoicesIssued}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        return new SubscriptionLifecycleResultDto(
            year,
            today.ToString("yyyy-MM-dd"),
            generated,
            posted,
            unpaidKeptActive,
            generated + posted + unpaidKeptActive + restored + clearedFuture,
            clearedFuture,
            invoicesIssued);
    }

    /// <summary>
    /// Removes unpaid subscription rows for years after <paramref name="year"/> so demos can
    /// switch focus (generate 2027, then run 2026 to return the member Payment card to 2026).
    /// Rows with any payment are kept.
    /// </summary>
    private async Task<int> ClearUnpaidFutureSubscriptionsBeyondAsync(
        int year,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var future = await _db.Subscriptions
            .Where(s => s.SubscriptionYear > year && s.AmountPaid <= 0)
            .ToListAsync(cancellationToken);
        if (future.Count == 0) return 0;

        var ids = future.Select(s => s.SubscriptionId).ToList();

        // Do not delete rows that already have payment transactions linked.
        var linked = await _db.Transactions.AsNoTracking()
            .Where(t => t.SubscriptionId != null && ids.Contains(t.SubscriptionId.Value))
            .Select(t => t.SubscriptionId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);
        var linkedSet = linked.ToHashSet();
        var removable = future.Where(s => !linkedSet.Contains(s.SubscriptionId)).ToList();
        if (removable.Count == 0) return 0;

        var removableIds = removable.Select(s => s.SubscriptionId).ToList();
        var arrears = await _db.Arrearses
            .Where(a => a.SubscriptionId != null && removableIds.Contains(a.SubscriptionId.Value))
            .ToListAsync(cancellationToken);
        if (arrears.Count > 0)
            _db.Arrearses.RemoveRange(arrears);

        _db.Subscriptions.RemoveRange(removable);
        await _db.SaveChangesAsync(cancellationToken);

        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "Subscription",
            RecordId = year,
            Action = "DELETE",
            NewValues = $"demo-clear-future:count={removable.Count};beyond={year}",
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        return removable.Count;
    }
    private async Task<int> GenerateAnnualSubscriptionsForYearAsync(
        int year,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var dueStatus = await _db.MemberStatuses.FirstOrDefaultAsync(x => x.Code == "DUE", cancellationToken)
            ?? await _db.MemberStatuses.FirstAsync(cancellationToken);
        var asOf = new DateOnly(year, 1, 1);

        var existingAccountIds = await _db.Subscriptions.AsNoTracking()
            .Where(s => s.SubscriptionYear == year)
            .Select(s => s.AccountId)
            .ToListAsync(cancellationToken);
        var existing = existingAccountIds.ToHashSet();

        var accounts = await _db.Accounts
            .AsNoTracking()
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .Where(a =>
                !a.IsDeleted
                && a.MembershipType.CanAccessSubscriptions
                && a.CurrentMemberStatus.Code != "REMOVED")
            .ToListAsync(cancellationToken);

        var schedules = await _db.MembershipFeeSchedules.AsNoTracking()
            .Where(x => x.IsActive && x.EffectiveDate <= asOf)
            .ToListAsync(cancellationToken);

        var created = 0;
        var now = DateTime.UtcNow;
        foreach (var account in accounts)
        {
            if (existing.Contains(account.AccountId))
                continue;

            var priv = MemberClassPrivileges.ForCode(account.MembershipType.Code);
            if (!priv.PaysSubscription)
                continue;

            var schedule = schedules
                .Where(x => x.MembershipTypeId == account.MembershipTypeId)
                .OrderByDescending(x => x.EffectiveDate)
                .FirstOrDefault();
            var amount = schedule?.AnnualSubscription ?? 0m;
            var discount = string.Equals(account.MembershipType.Code, "SENIOR", StringComparison.OrdinalIgnoreCase)
                ? 50
                : priv.SubscriptionDiscountPercent;
            if (discount > 0)
                amount = Math.Round(amount * (100 - discount) / 100m, 2, MidpointRounding.AwayFromZero);

            _db.Subscriptions.Add(new Subscription
            {
                AccountId = account.AccountId,
                SubscriptionYear = year,
                AmountDue = amount,
                AmountPaid = 0,
                ArrearsAmount = amount,
                DueDate = asOf,
                SubscriptionStatusId = dueStatus.MemberStatusId,
                WaivedFlag = false,
                CreatedAt = now,
                CreatedByUserId = actorUserId
            });
            created++;
        }

        if (created > 0)
            await _db.SaveChangesAsync(cancellationToken);
        return created;
    }

    private async Task<int> RestoreRemovedUnpaidMembersAsync(
        DateOnly today,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var activeStatus = await _db.MemberStatuses.FirstOrDefaultAsync(x => x.Code == "ACTIVE", cancellationToken);
        if (activeStatus is null)
            return 0;

        var removedUnpaid = await _db.Subscriptions
            .Include(s => s.Account)
                .ThenInclude(a => a.CurrentMemberStatus)
            .Where(s =>
                !s.WaivedFlag
                && s.AmountPaid < s.AmountDue
                && s.Account.CurrentMemberStatus.Code == "REMOVED"
                && !s.Account.IsDeleted)
            .ToListAsync(cancellationToken);

        var seenAccounts = new HashSet<long>();
        var count = 0;
        var now = DateTime.UtcNow;
        foreach (var sub in removedUnpaid)
        {
            sub.RemovalDate = null;
            if (!seenAccounts.Add(sub.AccountId))
                continue;

            var fromStatusId = sub.Account.CurrentMemberStatusId;
            sub.Account.CurrentMemberStatusId = activeStatus.MemberStatusId;
            sub.Account.IsActive = true;
            sub.Account.EndDate = null;
            sub.Account.UpdatedByUserId = actorUserId;
            sub.RemovalDate = null;

            _db.MemberStatusHistories.Add(new MemberStatusHistory
            {
                AccountId = sub.AccountId,
                FromStatusId = fromStatusId,
                ToStatusId = activeStatus.MemberStatusId,
                EffectiveDate = today,
                Reason = $"Unpaid annual subscription after 30 April — member remains active; payment stays unpaid.",
                ReferenceType = "SUBSCRIPTION",
                ReferenceId = sub.SubscriptionId,
                ChangedByUserId = actorUserId,
                CreatedAt = now,
                CreatedByUserId = actorUserId
            });
            count++;
        }

        if (count > 0)
            await _db.SaveChangesAsync(cancellationToken);
        return count;
    }

    private async Task<MemberStatus> EnsureUnpaidMemberStatusAsync(CancellationToken cancellationToken)
    {
        var unpaid = await _db.MemberStatuses.FirstOrDefaultAsync(x => x.Code == "UNPAID", cancellationToken);
        if (unpaid is not null)
            return unpaid;

        unpaid = new MemberStatus
        {
            Code = "UNPAID",
            Name = "Unpaid",
            SortOrder = 15,
            IsActive = true,
            IsActiveStatus = true,
            IsTerminal = false,
            CreatedAt = DateTime.UtcNow
        };
        _db.MemberStatuses.Add(unpaid);
        await _db.SaveChangesAsync(cancellationToken);
        return unpaid;
    }

    /// <summary>
    /// After 30 April: keep (or restore) the member as ACTIVE and set subscription payment status to UNPAID.
    /// </summary>
    private async Task<int> MarkUnpaidKeepMemberActiveAsync(
        int year,
        DateOnly today,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var unpaidStatus = await EnsureUnpaidMemberStatusAsync(cancellationToken);
        var activeStatus = await _db.MemberStatuses.FirstOrDefaultAsync(x => x.Code == "ACTIVE", cancellationToken);

        var unpaid = await _db.Subscriptions
            .Include(s => s.Account)
                .ThenInclude(a => a.CurrentMemberStatus)
            .Include(s => s.Status)
            .Where(s => s.SubscriptionYear == year && !s.WaivedFlag && s.AmountPaid < s.AmountDue)
            .ToListAsync(cancellationToken);

        var count = 0;
        var now = DateTime.UtcNow;
        foreach (var sub in unpaid)
        {
            var accountCode = (sub.Account.CurrentMemberStatus?.Code ?? "").Trim().ToUpperInvariant();
            if (accountCode is "INACTIVE")
                continue;

            sub.ArrearsAmount = Math.Max(0, sub.AmountDue - sub.AmountPaid);
            sub.SubscriptionStatusId = unpaidStatus.MemberStatusId;
            sub.UpdatedByUserId = actorUserId;
            sub.RemovalDate = null;

            var restoredAccount = false;
            if (activeStatus is not null && accountCode is "REMOVED" or "POSTED")
            {
                var fromStatusId = sub.Account.CurrentMemberStatusId;
                sub.Account.CurrentMemberStatusId = activeStatus.MemberStatusId;
                sub.Account.IsActive = true;
                sub.Account.EndDate = null;
                sub.Account.UpdatedByUserId = actorUserId;
                restoredAccount = true;

                _db.MemberStatusHistories.Add(new MemberStatusHistory
                {
                    AccountId = sub.AccountId,
                    FromStatusId = fromStatusId,
                    ToStatusId = activeStatus.MemberStatusId,
                    EffectiveDate = today,
                    Reason = $"Unpaid annual subscription after 30 April {year} — member remains active; payment status Unpaid.",
                    ReferenceType = "SUBSCRIPTION",
                    ReferenceId = sub.SubscriptionId,
                    ChangedByUserId = actorUserId,
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
            }
            else if (accountCode is "ACTIVE" or "TEMPORARY")
            {
                sub.Account.IsActive = true;
                sub.Account.EndDate = null;
            }

            var paymentAlreadyUnpaid = string.Equals(sub.Status?.Code, unpaidStatus.Code, StringComparison.OrdinalIgnoreCase);
            if (restoredAccount || !paymentAlreadyUnpaid)
                count++;

            if (!await _db.Arrearses.AnyAsync(
                    a => a.SubscriptionId == sub.SubscriptionId && a.Status == "OPEN",
                    cancellationToken))
            {
                _db.Arrearses.Add(new Arrears
                {
                    AccountId = sub.AccountId,
                    SubscriptionId = sub.SubscriptionId,
                    OpenedDate = today,
                    Amount = sub.ArrearsAmount,
                    Status = "OPEN",
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
            }
        }

        if (unpaid.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);
        return count;
    }

    private async Task<int> ApplyUnpaidStatusAsync(
        int year,
        DateOnly today,
        string targetStatusCode,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var targetStatus = await _db.MemberStatuses.FirstOrDefaultAsync(x => x.Code == targetStatusCode, cancellationToken);
        if (targetStatus is null)
            return 0;

        var isRemoval = string.Equals(targetStatusCode, "REMOVED", StringComparison.OrdinalIgnoreCase);
        var unpaid = await _db.Subscriptions
            .Include(s => s.Account)
                .ThenInclude(a => a.CurrentMemberStatus)
            .Where(s => s.SubscriptionYear == year && !s.WaivedFlag && s.AmountPaid < s.AmountDue)
            .ToListAsync(cancellationToken);

        var count = 0;
        var now = DateTime.UtcNow;
        foreach (var sub in unpaid)
        {
            var accountCode = (sub.Account.CurrentMemberStatus?.Code ?? "").Trim().ToUpperInvariant();
            if (accountCode == "REMOVED" && !isRemoval)
                continue;

            sub.ArrearsAmount = Math.Max(0, sub.AmountDue - sub.AmountPaid);
            sub.SubscriptionStatusId = targetStatus.MemberStatusId;
            sub.UpdatedByUserId = actorUserId;

            if (isRemoval)
                sub.RemovalDate ??= today;
            else
                sub.PostedDate ??= today;

            var alreadyAtTarget = string.Equals(accountCode, targetStatusCode, StringComparison.OrdinalIgnoreCase);
            if (!alreadyAtTarget)
            {
                var fromStatusId = sub.Account.CurrentMemberStatusId;
                sub.Account.CurrentMemberStatusId = targetStatus.MemberStatusId;
                // POSTED and REMOVED are not active-status — restrict portal / privilege access.
                sub.Account.IsActive = targetStatus.IsActiveStatus && !targetStatus.IsTerminal;
                if (isRemoval)
                    sub.Account.EndDate ??= today;
                sub.Account.UpdatedByUserId = actorUserId;

                _db.MemberStatusHistories.Add(new MemberStatusHistory
                {
                    AccountId = sub.AccountId,
                    FromStatusId = fromStatusId,
                    ToStatusId = targetStatus.MemberStatusId,
                    EffectiveDate = today,
                    Reason = isRemoval
                        ? $"Unpaid annual subscription removed after 30 April {year}."
                        : $"Unpaid annual subscription posted after 28 February {year}.",
                    ReferenceType = "SUBSCRIPTION",
                    ReferenceId = sub.SubscriptionId,
                    ChangedByUserId = actorUserId,
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
                count++;
            }

            if (!await _db.Arrearses.AnyAsync(
                    a => a.SubscriptionId == sub.SubscriptionId && a.Status == "OPEN",
                    cancellationToken))
            {
                _db.Arrearses.Add(new Arrears
                {
                    AccountId = sub.AccountId,
                    SubscriptionId = sub.SubscriptionId,
                    OpenedDate = today,
                    Amount = sub.ArrearsAmount,
                    Status = "OPEN",
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
            }
        }

        if (unpaid.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);
        return count;
    }
}
