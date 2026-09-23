using ClubManagement.DTOs.Common;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Finance;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Finance;

public partial class FinanceService
{
    private static readonly string[] ActiveBillingStatuses = ["PENDING_GM", "APPROVED", "PUBLISHED"];
    private static readonly string[] ClosedApplicationStatuses = ["REJECTED", "WITHDRAWN", "CANCELLED", "DRAFT", "ELECTED"];

    public async Task<PagedResult<BillingQueueRowDto>> ListJoiningDuesAsync(
        string? search,
        string? membershipType,
        PagedRequest paging,
        CancellationToken cancellationToken,
        string? audience = null)
    {
        var all = FilterQueue(await JoiningQueueAsync(DateTime.UtcNow.Year, cancellationToken), search, membershipType);
        var kind = (audience ?? "").Trim().ToUpperInvariant();
        if (kind is "MEMBER" or "APPLICANT")
            all = all.Where(r => string.Equals(r.Audience, kind, StringComparison.OrdinalIgnoreCase)).ToList();
        all = all
            .OrderByDescending(r => r.ArrearsAmount)
            .ThenBy(r => r.PartyName)
            .ToList();
        return Paging.FromList(all, paging);
    }

    internal async Task<int> CountJoiningOutstandingAsync(CancellationToken cancellationToken) =>
        (await JoiningQueueAsync(DateTime.UtcNow.Year, cancellationToken)).Count;

    public async Task<PagedResult<BillingQueueRowDto>> ListBillingQueueAsync(
        string feeType,
        int year,
        string? search,
        string? membershipType,
        PagedRequest paging,
        CancellationToken cancellationToken,
        string kind = "INVOICE")
    {
        var all = await BuildBillingQueueAsync(NormalizeFeeType(feeType), year, search, membershipType, waitingOnly: true, cancellationToken, NormalizeKind(kind));
        return Paging.FromList(all, paging);
    }

    public async Task<BillingQueueStatsDto> GetBillingQueueStatsAsync(
        string feeType,
        int year,
        string? membershipType,
        CancellationToken cancellationToken,
        string kind = "INVOICE")
    {
        var fee = NormalizeFeeType(feeType);
        var outstanding = await BuildBillingQueueAsync(fee, year, search: null, membershipType, waitingOnly: false, cancellationToken, NormalizeKind(kind));
        var waiting = outstanding.Where(r => string.IsNullOrWhiteSpace(r.InvoiceNo)).ToList();
        var prepared = outstanding.Count - waiting.Count;
        return new BillingQueueStatsDto(
            outstanding.Count,
            prepared,
            waiting.Count,
            outstanding.Sum(r => r.ArrearsAmount));
    }

    public async Task<BillingSubmitResultDto> SubmitBillingDocumentsAsync(
        BillingSubmitRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var kind = NormalizeKind(request.Kind);
        var fee = NormalizeFeeType(request.FeeType);
        var year = request.Year ?? DateTime.UtcNow.Year;
        var items = request.Items ?? [];
        if (items.Count == 0)
            throw new InvalidOperationException("Select at least one member or applicant.");

        var submitted = 0;
        var skipped = 0;
        foreach (var item in items)
        {
            var created = await TrySubmitOneAsync(
                kind,
                fee,
                year,
                request.EmailAfterApproval,
                request.PeriodFrom,
                request.PeriodTo,
                item,
                actorUserId,
                cancellationToken);
            if (created) submitted++;
            else skipped++;
        }

        var pending = await _db.BillingDocuments.AsNoTracking()
            .CountAsync(d => d.Status == "PENDING_GM", cancellationToken);
        return new BillingSubmitResultDto(submitted, skipped, pending);
    }

    public async Task<PagedResult<BillingApprovalRowDto>> ListBillingApprovalsAsync(
        string? kind,
        string? status,
        string? feeType,
        string? search,
        PagedRequest paging,
        CancellationToken cancellationToken)
    {
        var query = _db.BillingDocuments.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(kind))
            query = query.Where(d => d.Kind == NormalizeKind(kind));
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(d => d.Status == status.Trim().ToUpperInvariant());
        if (!string.IsNullOrWhiteSpace(feeType))
            query = query.Where(d => d.FeeType == NormalizeFeeType(feeType));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(d =>
                d.PartyName.ToLower().Contains(term)
                || (d.PartyNo != null && d.PartyNo.ToLower().Contains(term))
                || d.DocumentNo.ToLower().Contains(term)
                || (d.Email != null && d.Email.ToLower().Contains(term)));
        }

        var total = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderBy(d => d.SubmittedAt)
            .Skip(paging.Skip)
            .Take(paging.PageSize)
            .ToListAsync(cancellationToken);
        var names = await UserDisplayNamesAsync(rows.SelectMany(r => new[] { r.SubmittedByUserId, r.ReviewedByUserId }), cancellationToken);
        var items = rows.Select(d => MapApproval(d, names)).ToList();
        return Paging.Create(items, paging, total);
    }

    public async Task<BillingPendingCountsDto> GetBillingPendingCountsAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.BillingDocuments.AsNoTracking()
            .Where(d => d.Status == "PENDING_GM")
            .GroupBy(d => d.Kind)
            .Select(g => new { Kind = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        return new BillingPendingCountsDto(
            rows.FirstOrDefault(x => x.Kind == "INVOICE")?.Count ?? 0,
            rows.FirstOrDefault(x => x.Kind == "STATEMENT")?.Count ?? 0);
    }

    public async Task<BillingApprovalRowDto?> GetBillingDocumentAsync(long billingDocumentId, CancellationToken cancellationToken)
    {
        var doc = await _db.BillingDocuments.AsNoTracking()
            .FirstOrDefaultAsync(d => d.BillingDocumentId == billingDocumentId, cancellationToken);
        if (doc is null) return null;
        var names = await UserDisplayNamesAsync([doc.SubmittedByUserId, doc.ReviewedByUserId], cancellationToken);
        return MapApproval(doc, names);
    }

    public async Task<BillingApprovalRowDto> ApproveBillingDocumentAsync(
        long billingDocumentId,
        BillingDecisionRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var doc = await _db.BillingDocuments
            .FirstOrDefaultAsync(d => d.BillingDocumentId == billingDocumentId, cancellationToken)
            ?? throw new InvalidOperationException("Document was not found.");
        if (doc.Status is not "PENDING_GM")
            throw new InvalidOperationException("Only documents waiting for GM approval can be approved.");

        var sendEmail = request.SendEmail ?? doc.EmailAfterApproval;
        doc.Status = sendEmail ? "PUBLISHED" : "APPROVED";
        doc.ReviewedAt = DateTime.UtcNow;
        doc.ReviewedByUserId = actorUserId;
        doc.ReviewNotes = string.IsNullOrWhiteSpace(request.Notes) ? doc.ReviewNotes : request.Notes.Trim();
        doc.PublishedAt = DateTime.UtcNow;

        if (doc.MembershipInvoiceId is long invoiceId)
        {
            var invoice = await _db.MembershipInvoices.FirstOrDefaultAsync(i => i.InvoiceId == invoiceId, cancellationToken);
            if (invoice is not null)
                invoice.PublishedToMember = true;
        }
        else if (doc.Kind == "INVOICE" && doc.FeeType == "ANNUAL" && doc.AccountId is long accountId && doc.Year is int year)
        {
            var invoice = await _db.MembershipInvoices
                .FirstOrDefaultAsync(i => i.AccountId == accountId && i.Year == year, cancellationToken);
            if (invoice is not null)
            {
                invoice.PublishedToMember = true;
                doc.MembershipInvoiceId = invoice.InvoiceId;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);

        if (sendEmail && !string.IsNullOrWhiteSpace(doc.Email) && !string.IsNullOrWhiteSpace(doc.DocumentHtml))
        {
            try
            {
                var subject = doc.Kind == "STATEMENT"
                    ? $"Aero Club statement {doc.DocumentNo}"
                    : $"Aero Club invoice {doc.DocumentNo}";
                var html = doc.Kind == "INVOICE" ? WithEmailPayNow(doc.DocumentHtml) : doc.DocumentHtml;
                var sent = await _email.SendHtmlAsync(doc.Email.Trim(), subject, html, cancellationToken);
                if (sent)
                {
                    doc.SentAt = DateTime.UtcNow;
                    doc.SentToEmail = doc.Email.Trim();
                    doc.Status = "PUBLISHED";
                    if (doc.MembershipInvoiceId is long mid)
                    {
                        var invoice = await _db.MembershipInvoices.FirstOrDefaultAsync(i => i.InvoiceId == mid, cancellationToken);
                        if (invoice is not null)
                        {
                            invoice.SentAt = doc.SentAt;
                            invoice.SentToEmail = doc.SentToEmail;
                        }
                    }
                    await _db.SaveChangesAsync(cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not email billing document {DocumentNo}", doc.DocumentNo);
            }
        }

        return (await GetBillingDocumentAsync(billingDocumentId, cancellationToken))!;
    }

    public async Task<BillingApprovalRowDto> RejectBillingDocumentAsync(
        long billingDocumentId,
        BillingDecisionRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var doc = await _db.BillingDocuments
            .FirstOrDefaultAsync(d => d.BillingDocumentId == billingDocumentId, cancellationToken)
            ?? throw new InvalidOperationException("Document was not found.");
        if (doc.Status is not "PENDING_GM")
            throw new InvalidOperationException("Only documents waiting for GM approval can be returned.");
        if (string.IsNullOrWhiteSpace(request.Notes))
            throw new InvalidOperationException("Add a short note so Finance knows what to correct.");

        doc.Status = "REJECTED";
        doc.ReviewedAt = DateTime.UtcNow;
        doc.ReviewedByUserId = actorUserId;
        doc.ReviewNotes = request.Notes.Trim();
        await _db.SaveChangesAsync(cancellationToken);
        return (await GetBillingDocumentAsync(billingDocumentId, cancellationToken))!;
    }

    private async Task<List<BillingQueueRowDto>> BuildBillingQueueAsync(
        string feeType,
        int year,
        string? search,
        string? membershipType,
        bool waitingOnly,
        CancellationToken cancellationToken,
        string kind = "INVOICE")
    {
        var rows = feeType switch
        {
            "JOINING" => await JoiningQueueAsync(year, cancellationToken),
            "ACCOMMODATION" => await NmQueueAsync("ACCOMMODATION", year, cancellationToken),
            "CORKAGE" => await NmQueueAsync("CORKAGE", year, cancellationToken),
            "CUSTOM" => await NmQueueAsync("CUSTOM", year, cancellationToken),
            _ => await AnnualQueueAsync(year, membershipType, search, cancellationToken)
        };

        if (feeType != "ANNUAL")
            rows = FilterQueue(rows, search, membershipType);

        var active = await ActiveBillingKeysAsync(kind, feeType, year, cancellationToken);
        rows = rows.Select(row =>
            active.TryGetValue(PartyKey(row.AccountId, row.ApplicationId, row.ChargeId), out var docNo)
                ? row with { InvoiceNo = docNo }
                : row).ToList();

        if (waitingOnly)
        {
            var activityAccountIds = await AccountIdsWithFeeActivityAsync(feeType, cancellationToken);
            rows = rows.Where(r =>
                r.ArrearsAmount > 0.01m
                && (string.IsNullOrWhiteSpace(r.InvoiceNo)
                    || (r.AccountId is long accountId && activityAccountIds.Contains(accountId)))).ToList();
        }
        return rows
            .OrderByDescending(r => r.ArrearsAmount)
            .ThenBy(r => r.PartyName)
            .ToList();
    }

    private async Task<HashSet<long>> AccountIdsWithFeeActivityAsync(
        string feeType,
        CancellationToken cancellationToken)
    {
        var codes = feeType switch
        {
            "JOINING" => new[] { "JOINING", "ENTRANCE" },
            "ACCOMMODATION" => new[] { "ACCOMMODATION" },
            "CORKAGE" => new[] { "CORKAGE" },
            "CUSTOM" => new[] { "CUSTOM", "OTHER" },
            _ => new[] { "ANNUAL", "SUBSCRIPTION", "ANNUAL_SUBSCRIPTION" },
        };
        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Include(t => t.FeeType)
            .Where(t => t.AccountId != null && t.FeeType != null && codes.Contains(t.FeeType.Code))
            .ToListAsync(cancellationToken);
        return txs
            .Where(t => IsSettledOrReturned(t.PaymentStatus?.Code))
            .Select(t => t.AccountId!.Value)
            .ToHashSet();
    }

    private async Task<List<BillingQueueRowDto>> AnnualQueueAsync(
        int year,
        string? membershipType,
        string? search,
        CancellationToken cancellationToken)
    {
        var query = InvoiceArrearsQuery(year, membershipType, search)
            .Include(s => s.Account).ThenInclude(a => a.Profile)
            .Include(s => s.Account).ThenInclude(a => a.MembershipType);
        var rows = await query
            .OrderByDescending(s => s.ArrearsAmount)
            .ToListAsync(cancellationToken);
        return rows.Select(s =>
        {
            var name = $"{s.Account.Profile?.FirstName} {s.Account.Profile?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name))
                name = s.Account.MembershipNo ?? "Member";
            return MakeQueueRow(
                "ANNUAL",
                "MEMBER",
                s.AccountId,
                applicationId: s.Account.ApplicationId,
                chargeId: null,
                s.SubscriptionId,
                s.Account.MembershipNo ?? "",
                name,
                s.Account.MembershipType?.Name,
                s.Account.MembershipType?.Code,
                s.AmountDue,
                s.AmountPaid,
                s.ArrearsAmount,
                s.Account.Profile?.Email);
        }).Concat(await ApplicantAnnualQueueRowsAsync(year, membershipType, search, cancellationToken)).ToList();
    }

    private async Task<List<BillingQueueRowDto>> JoiningQueueAsync(int _year, CancellationToken cancellationToken)
    {
        var feeIds = await JoiningFeeTypeIdsAsync(cancellationToken);
        var rows = new List<BillingQueueRowDto>();

        var members = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Where(a => !a.IsDeleted && !a.EntranceFeeWaivedFlag && (a.EntranceFeeAmount ?? 0) > 0)
            .ToListAsync(cancellationToken);
        var memberIds = members.Select(a => a.AccountId).ToList();
        var paidByAccount = memberIds.Count == 0 || feeIds.Count == 0
            ? new Dictionary<long, decimal>()
            : (await _db.Transactions.AsNoTracking()
                .Include(t => t.PaymentStatus)
                .Where(t => t.AccountId != null && memberIds.Contains(t.AccountId.Value) && feeIds.Contains(t.FeeTypeId) && t.Amount > 0)
                .ToListAsync(cancellationToken))
                .Where(t => CountsTowardDues(t.PaymentStatus?.Code))
                .GroupBy(t => t.AccountId!.Value)
                .ToDictionary(g => g.Key, g => g.Sum(t => t.Amount));

        foreach (var account in members)
        {
            var due = account.EntranceFeeAmount ?? 0;
            paidByAccount.TryGetValue(account.AccountId, out var paid);
            var outstanding = Math.Max(0, due - paid);
            if (outstanding <= 0) continue;
            var name = $"{account.Profile?.FirstName} {account.Profile?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name))
                name = account.MembershipNo ?? "Member";
            rows.Add(MakeQueueRow(
                "JOINING",
                "MEMBER",
                account.AccountId,
                account.ApplicationId,
                null,
                0,
                account.MembershipNo ?? "",
                name,
                account.MembershipType?.Name,
                account.MembershipType?.Code,
                due,
                paid,
                outstanding,
                account.Profile?.Email));
        }

        var memberProfileIds = members.Select(a => a.ProfileId).ToHashSet();
        var apps = (await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .Include(a => a.ElectionType)
            .ToListAsync(cancellationToken))
            .Where(a => a.Status is null
                || !ClosedApplicationStatuses.Contains((a.Status.Code ?? "").Trim().ToUpperInvariant()))
            .ToList();

        foreach (var app in apps)
        {
            if (memberProfileIds.Contains(app.ApplicantProfileId)) continue;
            ApplicationDuesDto dues;
            try
            {
                dues = await GetApplicationDuesAsync(app.ApplicationId, cancellationToken);
            }
            catch (InvalidOperationException)
            {
                continue;
            }
            if (dues.JoiningBalance <= 0.01m) continue;
            var name = $"{app.Applicant?.FirstName} {app.Applicant?.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(name))
                name = app.ApplicationNo;
            rows.Add(MakeQueueRow(
                "JOINING",
                "APPLICANT",
                null,
                app.ApplicationId,
                null,
                0,
                app.ApplicationNo,
                name,
                dues.MembershipTypeName ?? app.ElectionType?.Name,
                app.ElectionType?.Code,
                dues.JoiningFee,
                dues.JoiningPaid,
                dues.JoiningBalance,
                app.Applicant?.Email));
        }

        return rows;
    }

    private async Task<List<BillingQueueRowDto>> NmQueueAsync(string feeType, int year, CancellationToken cancellationToken)
    {
        var rows = new List<BillingQueueRowDto>();
        if (feeType == "ACCOMMODATION")
        {
            var bookings = await _db.NmAccommodationBookings.AsNoTracking()
                .Include(x => x.Account).ThenInclude(a => a!.Profile)
                .Include(x => x.Account).ThenInclude(a => a!.MembershipType)
                .Where(x => x.Status == "PENDING_ADVANCE_PAYMENT" && x.TotalAmount > 0)
                .ToListAsync(cancellationToken);
            foreach (var x in bookings)
                rows.Add(NmRow(feeType, x.AccountId, x.NmAccommodationBookingId, x.Account, x.GuestName, x.Email, x.TotalAmount));
        }
        else if (feeType == "CORKAGE")
        {
            var charges = await _db.NmCorkageCharges.AsNoTracking()
                .Include(x => x.Account).ThenInclude(a => a!.Profile)
                .Include(x => x.Account).ThenInclude(a => a!.MembershipType)
                .Where(x => x.Status == "PENDING" && x.FeeAmount > 0)
                .ToListAsync(cancellationToken);
            foreach (var x in charges)
                rows.Add(NmRow(feeType, x.AccountId, x.NmCorkageChargeId, x.Account, x.PayerName, x.Account?.Profile?.Email, x.FeeAmount));
        }
        else
        {
            var charges = await _db.NmCustomCharges.AsNoTracking()
                .Include(x => x.Account).ThenInclude(a => a!.Profile)
                .Include(x => x.Account).ThenInclude(a => a!.MembershipType)
                .Where(x => x.Status == "PENDING" && x.TotalAmount > 0)
                .ToListAsync(cancellationToken);
            foreach (var x in charges)
                rows.Add(NmRow(feeType, x.AccountId, x.NmCustomChargeId, x.Account, x.PayerName, x.Account?.Profile?.Email, x.TotalAmount));
        }

        return rows.Where(r => r.ArrearsAmount > 0).ToList();
    }

    private BillingQueueRowDto NmRow(
        string feeType,
        long? accountId,
        long chargeId,
        ClubManagement.Entities.MembershipAccount.MAccount? account,
        string payerName,
        string? email,
        decimal amount)
    {
        var name = account?.Profile is { } p
            ? $"{p.FirstName} {p.LastName}".Trim()
            : payerName;
        if (string.IsNullOrWhiteSpace(name)) name = payerName;
        var audience = accountId is > 0 ? "MEMBER" : "GUEST";
        return MakeQueueRow(
            feeType,
            audience,
            accountId,
            account?.ApplicationId,
            chargeId,
            0,
            account?.MembershipNo ?? payerName,
            name,
            account?.MembershipType?.Name,
            account?.MembershipType?.Code,
            amount,
            0,
            amount,
            email ?? account?.Profile?.Email);
    }

    private async Task<bool> TrySubmitOneAsync(
        string kind,
        string feeType,
        int year,
        bool emailAfterApproval,
        DateOnly? periodFrom,
        DateOnly? periodTo,
        BillingSubmitItemDto item,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var accountId = item.AccountId;
        var applicationId = item.ApplicationId;
        var chargeId = item.ChargeId;
        if (accountId is null && applicationId is null && chargeId is null)
            return false;

        var existing = await _db.BillingDocuments.AsNoTracking()
            .AnyAsync(d =>
                d.Kind == kind
                && d.FeeType == feeType
                && ActiveBillingStatuses.Contains(d.Status)
                && d.AccountId == accountId
                && d.ApplicationId == applicationId
                && d.ChargeId == chargeId
                && (feeType != "ANNUAL" || d.Year == year),
                cancellationToken);
        if (existing) return false;

        var snapshot = await ResolvePartySnapshotAsync(feeType, year, accountId, applicationId, chargeId, cancellationToken);
        if (snapshot is null || snapshot.Balance <= 0.009m) return false;

        long? membershipInvoiceId = null;
        if (kind == "INVOICE" && feeType == "ANNUAL" && accountId is long aid)
        {
            try
            {
                var issued = await IssueSubscriptionInvoiceAsync(
                    aid, year, sendEmail: false, actorUserId, cancellationToken, publishToMember: false);
                membershipInvoiceId = issued.InvoiceId;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not prepare annual invoice for account {AccountId}", aid);
            }
        }

        var prefix = kind == "STATEMENT" ? "STM" : "INV";
        var feeCode = feeType switch
        {
            "JOINING" => "J",
            "ACCOMMODATION" => "H",
            "CORKAGE" => "C",
            "CUSTOM" => "X",
            _ => "A"
        };
        var tempNo = $"{prefix}-{feeCode}-{year}-{Guid.NewGuid():N}"[..36];
        var from = periodFrom ?? new DateOnly(year, 1, 1);
        var to = periodTo ?? new DateOnly(year, 12, 31);
        var doc = new BillingDocument
        {
            DocumentNo = tempNo,
            Kind = kind,
            FeeType = feeType,
            Audience = snapshot.Audience,
            AccountId = accountId,
            ApplicationId = applicationId,
            ChargeId = chargeId,
            MembershipInvoiceId = membershipInvoiceId,
            Year = year,
            PeriodFrom = kind == "STATEMENT" ? from : null,
            PeriodTo = kind == "STATEMENT" ? to : null,
            PartyName = snapshot.PartyName,
            PartyNo = snapshot.PartyNo,
            Email = snapshot.Email,
            Amount = snapshot.AmountDue,
            AmountPaid = snapshot.AmountPaid,
            Balance = snapshot.Balance,
            DocumentHtml = string.IsNullOrWhiteSpace(item.DocumentHtml) ? null : item.DocumentHtml,
            Status = "PENDING_GM",
            EmailAfterApproval = emailAfterApproval,
            SubmittedAt = DateTime.UtcNow,
            SubmittedByUserId = actorUserId,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.BillingDocuments.Add(doc);
        await _db.SaveChangesAsync(cancellationToken);
        doc.DocumentNo = $"{prefix}-{feeCode}-{year}-{doc.BillingDocumentId:D6}";
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<PartySnapshot?> ResolvePartySnapshotAsync(
        string feeType,
        int year,
        long? accountId,
        long? applicationId,
        long? chargeId,
        CancellationToken cancellationToken)
    {
        if (feeType == "ANNUAL" && accountId is long annualId)
        {
            var sub = await _db.Subscriptions.AsNoTracking()
                .Include(s => s.Account).ThenInclude(a => a.Profile)
                .FirstOrDefaultAsync(s => s.AccountId == annualId && s.SubscriptionYear == year, cancellationToken);
            if (sub is null) return null;
            var name = DisplayName(sub.Account.Profile?.FirstName, sub.Account.Profile?.LastName, sub.Account.MembershipNo);
            var brought = PriorYearUnpaid(
                await _db.Subscriptions.AsNoTracking()
                    .Where(s => s.AccountId == annualId && s.SubscriptionYear < year)
                    .ToListAsync(cancellationToken),
                year);
            return new PartySnapshot(
                "MEMBER",
                name,
                sub.Account.MembershipNo ?? "",
                sub.Account.Profile?.Email,
                sub.AmountDue + brought,
                sub.AmountPaid,
                Math.Max(0, sub.AmountDue - sub.AmountPaid) + brought);
        }

        if (feeType == "ANNUAL" && applicationId is long annualAppId && accountId is null)
        {
            var app = await _db.Applications.AsNoTracking()
                .Include(a => a.Applicant)
                .FirstOrDefaultAsync(a => a.ApplicationId == annualAppId, cancellationToken);
            if (app is null) return null;
            var dues = await GetApplicationDuesAsync(annualAppId, cancellationToken);
            if (dues.AnnualBalance <= 0.009m) return null;
            var name = DisplayName(app.Applicant?.FirstName, app.Applicant?.LastName, app.ApplicationNo);
            return new PartySnapshot(
                "APPLICANT",
                name,
                app.ApplicationNo,
                app.Applicant?.Email,
                dues.AnnualSubscription,
                dues.AnnualPaid,
                dues.AnnualBalance);
        }

        if (feeType == "JOINING" && accountId is long memberId)
        {
            var account = await _db.Accounts.AsNoTracking()
                .Include(a => a.Profile)
                .FirstOrDefaultAsync(a => a.AccountId == memberId && !a.IsDeleted, cancellationToken);
            if (account is null) return null;
            var due = account.EntranceFeeWaivedFlag ? 0 : (account.EntranceFeeAmount ?? 0);
            var paid = await JoiningPaidForAccountAsync(memberId, cancellationToken);
            var name = DisplayName(account.Profile?.FirstName, account.Profile?.LastName, account.MembershipNo);
            return new PartySnapshot("MEMBER", name, account.MembershipNo ?? "", account.Profile?.Email, due, paid, Math.Max(0, due - paid));
        }

        if (feeType == "JOINING" && applicationId is long appId)
        {
            var app = await _db.Applications.AsNoTracking()
                .Include(a => a.Applicant)
                .FirstOrDefaultAsync(a => a.ApplicationId == appId, cancellationToken);
            if (app is null) return null;
            var dues = await GetApplicationDuesAsync(appId, cancellationToken);
            var name = DisplayName(app.Applicant?.FirstName, app.Applicant?.LastName, app.ApplicationNo);
            return new PartySnapshot(
                "APPLICANT",
                name,
                app.ApplicationNo,
                app.Applicant?.Email,
                dues.JoiningFee,
                dues.JoiningPaid,
                dues.JoiningBalance);
        }

        if (chargeId is long cid)
            return await ResolveNmSnapshotAsync(feeType, cid, cancellationToken);

        return null;
    }

    private async Task<PartySnapshot?> ResolveNmSnapshotAsync(string feeType, long chargeId, CancellationToken cancellationToken)
    {
        if (feeType == "ACCOMMODATION")
        {
            var row = await _db.NmAccommodationBookings.AsNoTracking()
                .Include(x => x.Account).ThenInclude(a => a!.Profile)
                .FirstOrDefaultAsync(x => x.NmAccommodationBookingId == chargeId, cancellationToken);
            if (row is null) return null;
            var name = row.Account?.Profile is { } p
                ? DisplayName(p.FirstName, p.LastName, row.GuestName)
                : row.GuestName;
            return new PartySnapshot(row.AccountId is > 0 ? "MEMBER" : "GUEST", name, row.Account?.MembershipNo ?? row.GuestName, row.Email ?? row.Account?.Profile?.Email, row.TotalAmount, 0, row.TotalAmount);
        }
        if (feeType == "CORKAGE")
        {
            var row = await _db.NmCorkageCharges.AsNoTracking()
                .Include(x => x.Account).ThenInclude(a => a!.Profile)
                .FirstOrDefaultAsync(x => x.NmCorkageChargeId == chargeId, cancellationToken);
            if (row is null) return null;
            var name = row.Account?.Profile is { } p
                ? DisplayName(p.FirstName, p.LastName, row.PayerName)
                : row.PayerName;
            return new PartySnapshot(row.AccountId is > 0 ? "MEMBER" : "GUEST", name, row.Account?.MembershipNo ?? row.PayerName, row.Account?.Profile?.Email, row.FeeAmount, 0, row.FeeAmount);
        }
        if (feeType == "CUSTOM")
        {
            var row = await _db.NmCustomCharges.AsNoTracking()
                .Include(x => x.Account).ThenInclude(a => a!.Profile)
                .FirstOrDefaultAsync(x => x.NmCustomChargeId == chargeId, cancellationToken);
            if (row is null) return null;
            var name = row.Account?.Profile is { } p
                ? DisplayName(p.FirstName, p.LastName, row.PayerName)
                : row.PayerName;
            return new PartySnapshot(row.AccountId is > 0 ? "MEMBER" : "GUEST", name, row.Account?.MembershipNo ?? row.PayerName, row.Account?.Profile?.Email, row.TotalAmount, 0, row.TotalAmount);
        }
        return null;
    }

    private async Task<decimal> JoiningPaidForAccountAsync(long accountId, CancellationToken cancellationToken)
    {
        var feeIds = await JoiningFeeTypeIdsAsync(cancellationToken);
        if (feeIds.Count == 0) return 0;
        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Where(t => t.AccountId == accountId && feeIds.Contains(t.FeeTypeId) && t.Amount > 0)
            .ToListAsync(cancellationToken);
        return txs.Where(t => CountsTowardDues(t.PaymentStatus?.Code)).Sum(t => t.Amount);
    }

    private async Task<decimal> JoiningPaidForProfileAsync(long profileId, CancellationToken cancellationToken)
    {
        var feeIds = await JoiningFeeTypeIdsAsync(cancellationToken);
        if (feeIds.Count == 0) return 0;
        var txs = await _db.Transactions.AsNoTracking()
            .Include(t => t.PaymentStatus)
            .Where(t => t.ProfileId == profileId && feeIds.Contains(t.FeeTypeId) && t.Amount > 0)
            .ToListAsync(cancellationToken);
        return txs.Where(t => CountsTowardDues(t.PaymentStatus?.Code)).Sum(t => t.Amount);
    }

    private static string DisplayName(string? first, string? last, string? fallback)
    {
        var name = $"{first} {last}".Trim();
        return string.IsNullOrWhiteSpace(name) ? (fallback ?? "Party") : name;
    }

    private async Task<Dictionary<string, string>> ActiveBillingKeysAsync(
        string kind,
        string feeType,
        int year,
        CancellationToken cancellationToken)
    {
        var rows = await _db.BillingDocuments.AsNoTracking()
            .Where(d =>
                d.Kind == kind
                && d.FeeType == feeType
                && ActiveBillingStatuses.Contains(d.Status)
                && (feeType != "ANNUAL" || d.Year == year))
            .Select(d => new { d.AccountId, d.ApplicationId, d.ChargeId, d.DocumentNo })
            .ToListAsync(cancellationToken);
        return rows
            .GroupBy(d => PartyKey(d.AccountId, d.ApplicationId, d.ChargeId))
            .ToDictionary(g => g.Key, g => g.First().DocumentNo);
    }

    private async Task<List<long>> JoiningFeeTypeIdsAsync(CancellationToken cancellationToken) =>
        await _db.FeeTypes.AsNoTracking()
            .Where(f => f.Code == "JOINING" || f.Code == "ENTRANCE")
            .Select(f => f.FeeTypeId)
            .ToListAsync(cancellationToken);

    private async Task<Dictionary<long, string>> UserDisplayNamesAsync(
        IEnumerable<long?> ids,
        CancellationToken cancellationToken)
    {
        var wanted = ids.Where(id => id is > 0).Select(id => id!.Value).Distinct().ToList();
        if (wanted.Count == 0) return [];
        return await _db.UserAccounts.AsNoTracking()
            .Where(u => wanted.Contains(u.UserAccountId))
            .ToDictionaryAsync(u => u.UserAccountId, u => u.Username, cancellationToken);
    }

    private static List<BillingQueueRowDto> FilterQueue(
        List<BillingQueueRowDto> rows,
        string? search,
        string? membershipType)
    {
        IEnumerable<BillingQueueRowDto> query = rows;
        if (!string.IsNullOrWhiteSpace(membershipType))
        {
            var mt = membershipType.Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
            query = query.Where(r =>
                (r.MembershipTypeCode ?? "").ToUpperInvariant().Replace("-", "_").Replace(" ", "_") == mt
                || (r.MembershipType ?? "").ToUpperInvariant().Contains(membershipType.Trim().ToUpperInvariant()));
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(r =>
                r.PartyName.Contains(term, StringComparison.OrdinalIgnoreCase)
                || r.DisplayNo.Contains(term, StringComparison.OrdinalIgnoreCase)
                || (r.Email ?? "").Contains(term, StringComparison.OrdinalIgnoreCase));
        }
        return query.ToList();
    }

    private static BillingQueueRowDto MakeQueueRow(
        string feeType,
        string audience,
        long? accountId,
        long? applicationId,
        long? chargeId,
        long subscriptionId,
        string displayNo,
        string partyName,
        string? membershipType,
        string? membershipTypeCode,
        decimal amountDue,
        decimal amountPaid,
        decimal arrears,
        string? email) =>
        new(
            $"{audience}:{accountId ?? 0}:{applicationId ?? 0}:{chargeId ?? 0}",
            feeType,
            audience,
            accountId,
            applicationId,
            chargeId,
            subscriptionId,
            displayNo,
            partyName,
            membershipType,
            membershipTypeCode,
            amountDue,
            amountPaid,
            arrears,
            email,
            null);

    private static BillingApprovalRowDto MapApproval(BillingDocument d, IReadOnlyDictionary<long, string> names) =>
        new(
            d.BillingDocumentId,
            d.DocumentNo,
            d.Kind,
            d.FeeType,
            d.Audience,
            d.PartyName,
            d.PartyNo,
            d.Email,
            d.Amount,
            d.AmountPaid,
            d.Balance,
            d.Status,
            d.EmailAfterApproval,
            d.SubmittedAt,
            d.SubmittedByUserId is long sid && names.TryGetValue(sid, out var sname) ? sname : null,
            d.ReviewedAt,
            d.ReviewedByUserId is long rid && names.TryGetValue(rid, out var rname) ? rname : null,
            d.ReviewNotes,
            d.PublishedAt,
            d.SentAt,
            d.Year,
            d.DocumentHtml);

    private static string PartyKey(long? accountId, long? applicationId, long? chargeId) =>
        $"{accountId ?? 0}:{applicationId ?? 0}:{chargeId ?? 0}";

    public async Task PublishApplicantFeeInvoiceAsync(
        long applicationId,
        string feeCode,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var fee = NormalizeFeeType(feeCode);
        if (fee is not ("JOINING" or "ANNUAL"))
            throw new InvalidOperationException("Deposit can invoice the entrance fee or the annual subscription.");

        var dues = await GetApplicationDuesAsync(applicationId, cancellationToken);
        var due = fee == "JOINING" ? dues.JoiningFee : dues.AnnualSubscription;
        var paid = fee == "JOINING" ? dues.JoiningPaid : dues.AnnualPaid;
        var balance = fee == "JOINING" ? dues.JoiningBalance : dues.AnnualBalance;
        if (balance <= 0.009m)
            throw new InvalidOperationException("This fee has no balance left to invoice.");

        var app = await _db.Applications
            .Include(a => a.Applicant)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");

        var year = DateTime.UtcNow.Year;
        var existing = await _db.BillingDocuments
            .Where(d =>
                d.Kind == "INVOICE"
                && d.FeeType == fee
                && d.ApplicationId == applicationId
                && (fee != "ANNUAL" || d.Year == year)
                && (d.Status == "PENDING_GM" || d.Status == "APPROVED" || d.Status == "PUBLISHED"))
            .OrderByDescending(d => d.BillingDocumentId)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing is null)
        {
            var name = DisplayName(app.Applicant?.FirstName, app.Applicant?.LastName, app.ApplicationNo);
            var doc = new BillingDocument
            {
                DocumentNo = $"INV-TMP-{Guid.NewGuid():N}"[..36],
                Kind = "INVOICE",
                FeeType = fee,
                Audience = "APPLICANT",
                ApplicationId = applicationId,
                Year = year,
                PartyName = name,
                PartyNo = app.ApplicationNo,
                Email = app.Applicant?.Email,
                Amount = due,
                AmountPaid = paid,
                Balance = balance,
                Status = "PUBLISHED",
                SubmittedAt = DateTime.UtcNow,
                SubmittedByUserId = actorUserId,
                ReviewedAt = DateTime.UtcNow,
                ReviewedByUserId = actorUserId,
                PublishedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.BillingDocuments.Add(doc);
            await _db.SaveChangesAsync(cancellationToken);
            var feeLetter = fee == "JOINING" ? "J" : "A";
            doc.DocumentNo = $"INV-{feeLetter}-{year}-{doc.BillingDocumentId:D6}";
            await _db.SaveChangesAsync(cancellationToken);
            existing = doc;
        }
        else if (existing.Status == "PENDING_GM")
        {
            existing.Status = "PUBLISHED";
            existing.ReviewedAt = DateTime.UtcNow;
            existing.ReviewedByUserId = actorUserId;
            existing.PublishedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

        if (app.Applicant is not null)
        {
            var label = fee == "JOINING" ? "entrance fee" : "annual subscription";
            var portal = (_app.PublicBaseUrl ?? "http://localhost:8080").TrimEnd('/');
            await PushStaffNotificationAsync(
                "APPLICANT_FEE_INVOICE",
                "Fee invoice",
                app.Applicant.ProfileId,
                app.Applicant.Email,
                $"Invoice for your {label}",
                $"An invoice ({existing.DocumentNo}) is ready for your {label} on application {app.ApplicationNo}. Pay here: {portal}/payment",
                applicationId,
                cancellationToken);
        }
    }

    public async Task NotifyFinanceChequeDepositAsync(long applicationId, CancellationToken cancellationToken)
    {
        var app = await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken)
            ?? throw new InvalidOperationException("Application was not found.");
        var name = DisplayName(app.Applicant?.FirstName, app.Applicant?.LastName, app.ApplicationNo);
        var staff = await _db.UserAccounts.AsNoTracking()
            .Include(u => u.Profile)
            .Include(u => u.UserRoles).ThenInclude(r => r.Role)
            .Where(u => u.IsActive && u.UserRoles.Any(r =>
                r.Role.Code == "TREASURER" || r.Role.Code == "ADMIN" || r.Role.Code == "FINANCE"))
            .ToListAsync(cancellationToken);

        var subject = $"Deposit cheque for {name}";
        var body =
            $"Please deposit the fee cheque for applicant {name} ({app.ApplicationNo}). " +
            "The cheque copy is on the application even if it was uploaded earlier. Open Finance desk to record the deposit.";
        if (staff.Count == 0)
        {
            _logger.LogWarning("No treasurer or finance user to notify for cheque deposit on application {ApplicationId}", applicationId);
            return;
        }

        foreach (var user in staff)
        {
            await PushStaffNotificationAsync(
                "CHEQUE_DEPOSIT_REQUEST",
                "Cheque deposit",
                user.ProfileId,
                user.Profile?.Email,
                subject,
                body,
                applicationId,
                cancellationToken);
        }
    }

    private async Task<List<BillingQueueRowDto>> ApplicantAnnualQueueRowsAsync(
        int year,
        string? membershipType,
        string? search,
        CancellationToken cancellationToken)
    {
        var linked = await _db.Accounts.AsNoTracking()
            .Where(a => !a.IsDeleted && a.ApplicationId != null)
            .Select(a => a.ApplicationId!.Value)
            .ToListAsync(cancellationToken);
        var linkedSet = linked.ToHashSet();
        var apps = (await _db.Applications.AsNoTracking()
            .Include(a => a.Applicant)
            .Include(a => a.Status)
            .ToListAsync(cancellationToken))
            .Where(a => !linkedSet.Contains(a.ApplicationId))
            .Where(a => a.Status is null
                || !ClosedApplicationStatuses.Contains((a.Status.Code ?? "").Trim().ToUpperInvariant()))
            .ToList();

        var rows = new List<BillingQueueRowDto>();
        foreach (var app in apps)
        {
            ApplicationDuesDto dues;
            try
            {
                dues = await GetApplicationDuesAsync(app.ApplicationId, cancellationToken);
            }
            catch (InvalidOperationException)
            {
                continue;
            }
            if (dues.AnnualBalance <= 0.01m) continue;
            if (!string.IsNullOrWhiteSpace(membershipType))
            {
                var wanted = membershipType.Trim();
                var name = dues.MembershipTypeName ?? "";
                if (name.IndexOf(wanted, StringComparison.OrdinalIgnoreCase) < 0
                    && !string.Equals(name, wanted, StringComparison.OrdinalIgnoreCase))
                    continue;
            }
            var party = DisplayName(app.Applicant?.FirstName, app.Applicant?.LastName, app.ApplicationNo);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var hay = $"{party} {app.ApplicationNo} {app.Applicant?.Email}";
                if (hay.IndexOf(search.Trim(), StringComparison.OrdinalIgnoreCase) < 0)
                    continue;
            }
            rows.Add(MakeQueueRow(
                "ANNUAL",
                "APPLICANT",
                null,
                app.ApplicationId,
                null,
                0,
                app.ApplicationNo,
                party,
                dues.MembershipTypeName,
                null,
                dues.AnnualSubscription,
                dues.AnnualPaid,
                dues.AnnualBalance,
                app.Applicant?.Email));
        }
        return rows;
    }

    private async Task<List<SubscriptionRowDto>> ApplicantAnnualSubscriptionRowsAsync(
        SubscriptionListFilter filter,
        CancellationToken cancellationToken)
    {
        var year = filter.Year ?? DateTime.UtcNow.Year;
        var queue = await ApplicantAnnualQueueRowsAsync(year, filter.MembershipType, filter.Search, cancellationToken);
        if (filter.ArrearsOnly)
            queue = queue.Where(r => r.ArrearsAmount > 0.01m).ToList();
        return queue.Select(r => new SubscriptionRowDto(
            -(r.ApplicationId ?? 0),
            0,
            r.DisplayNo,
            r.PartyName,
            year,
            r.AmountDue,
            r.AmountPaid,
            r.ArrearsAmount,
            "Applicant",
            null,
            null,
            null,
            r.MembershipType,
            r.MembershipTypeCode,
            "Applicant",
            "APPLICANT")).ToList();
    }

    private async Task PushStaffNotificationAsync(
        string typeCode,
        string typeName,
        long profileId,
        string? email,
        string subject,
        string body,
        long applicationId,
        CancellationToken cancellationToken)
    {
        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == typeCode, cancellationToken);
        if (type is null)
        {
            type = new NotificationType
            {
                Code = typeCode,
                Name = typeName,
                SortOrder = 40,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.NotificationTypes.Add(type);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var recipient = !string.IsNullOrWhiteSpace(email) ? email! : profileId.ToString();
        var since = DateTime.UtcNow.AddMinutes(-2);
        var already = await _db.Notifications.AnyAsync(n =>
            n.RelatedEntityType == "APPLICATION"
            && n.RelatedEntityId == applicationId
            && n.NotificationTypeId == type.NotificationTypeId
            && n.Recipient == recipient
            && n.CreatedAt >= since, cancellationToken);
        if (already) return;

        var accountId = await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);

        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = recipient,
            Channel = "IN_APP",
            SentDate = DateTime.UtcNow,
            Content = $"{subject}\n\n{body}",
            RelatedEntityType = "APPLICATION",
            RelatedEntityId = applicationId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(email))
        {
            try { await _email.SendAsync(email, subject, body, cancellationToken); }
            catch { /* in-app notice still stands */ }
        }
    }

    private static string NormalizeFeeType(string? value)
    {
        var v = (value ?? "ANNUAL").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        return v switch
        {
            "ENTRANCE" or "JOINING_FEE" => "JOINING",
            "SUBSCRIPTION" or "ANNUAL_SUBSCRIPTION" => "ANNUAL",
            "ACCOM" or "ROOM" => "ACCOMMODATION",
            "OTHER" or "CUSTOM_CHARGES" => "CUSTOM",
            "JOINING" or "ANNUAL" or "ACCOMMODATION" or "CORKAGE" or "CUSTOM" => v,
            _ => "ANNUAL"
        };
    }

    private static string NormalizeKind(string? value)
    {
        var v = (value ?? "INVOICE").Trim().ToUpperInvariant();
        return v == "STATEMENT" ? "STATEMENT" : "INVOICE";
    }

    private sealed record PartySnapshot(
        string Audience,
        string PartyName,
        string PartyNo,
        string? Email,
        decimal AmountDue,
        decimal AmountPaid,
        decimal Balance);
}
