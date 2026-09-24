using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Settings;
using ClubManagement.Services.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.MembershipAccount;

public record TransitionHubDto(
    int TotalMembers,
    int FullMembers,
    int ActiveLifeMembers,
    int PendingNominations,
    IReadOnlyList<SeniorLifeCandidateDto> SeniorLifeCandidates,
    IReadOnlyList<LifeNominationDto> Nominations,
    IReadOnlyList<TransitionActivityDto> Recent);

public record SeniorLifeCandidateDto(
    long AccountId,
    string MembershipNo,
    string MemberName,
    string? JoinedDate,
    string CurrentClass,
    decimal YearsOfService);

public record LifeNominationDto(
    long MembershipTransitionId,
    long AccountId,
    string MembershipNo,
    string MemberName,
    string? JoinedDate,
    string CurrentClass,
    string NominatedAt,
    string? GmDate,
    string Status,
    string? Notes,
    bool HasLetter);

public record TransitionActivityDto(
    long MembershipTransitionId,
    string MemberName,
    string Kind,
    string Status,
    string At,
    bool HasLetter);

public record NominateLifeRequest(long AccountId, string? GmDate, string? Notes);
public record RecordLifeVoteRequest(bool Approved, string? Notes);
public record ConfirmSeniorLifeRequest(IReadOnlyList<long> AccountIds);
public record OwnLifeLetterDto(long MembershipTransitionId, string Kind, string At, bool Emailed, string Html);

public interface IMembershipTransitionService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<TransitionHubDto> GetHubAsync(CancellationToken cancellationToken);
    Task<int> ConfirmSeniorLifeAsync(IReadOnlyList<long> accountIds, long? actorUserId, CancellationToken cancellationToken);
    Task<int> ApplyDueSeniorLifeAsync(CancellationToken cancellationToken);
    Task<LifeNominationDto> NominateLifeAsync(NominateLifeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<LifeNominationDto> RecordVoteAsync(long transitionId, RecordLifeVoteRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<string?> GetLetterHtmlAsync(long transitionId, CancellationToken cancellationToken);
    Task<OwnLifeLetterDto?> GetOwnLetterAsync(long profileId, CancellationToken cancellationToken);
}

public class MembershipTransitionService : IMembershipTransitionService
{
    private static readonly string[] SeniorSourceCodes = ["FULL", "COUNTRY", "OVERSEAS", "SENIOR"];
    private static readonly string[] LifeSourceCodes = ["FULL", "COUNTRY", "OVERSEAS", "SENIOR", "ASSOCIATE"];

    private readonly ApplicationModuleDbContext _db;
    private readonly IEmailSender _email;

    public MembershipTransitionService(ApplicationModuleDbContext db, IEmailSender email)
    {
        _db = db;
        _email = email;
    }

    public Task EnsureSchemaAsync(CancellationToken cancellationToken) =>
        _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Membership_transition', N'U') IS NULL
CREATE TABLE dbo.Membership_transition (
    membership_transition_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Membership_transition PRIMARY KEY,
    account_id BIGINT NOT NULL,
    kind NVARCHAR(30) NOT NULL,
    status NVARCHAR(30) NOT NULL,
    nominated_at DATETIME2 NOT NULL,
    nominated_by_user_id BIGINT NULL,
    gm_date DATE NULL,
    notes NVARCHAR(1000) NULL,
    decided_at DATETIME2 NULL,
    decided_by_user_id BIGINT NULL,
    letter_html NVARCHAR(MAX) NULL,
    letter_sent_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL
);", cancellationToken);

    public async Task<TransitionHubDto> GetHubAsync(CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var accounts = await ActiveAccounts(cancellationToken);
        var total = accounts.Count;
        var full = accounts.Count(a => Code(a) == "FULL");
        var life = accounts.Count(a => Code(a) is "LIFE" or "SENIOR_LIFE");
        var pending = await _db.MembershipTransitions.CountAsync(t => t.Kind == "LIFE" && t.Status == "PENDING", cancellationToken);

        var senior = accounts
            .Where(a => IsSeniorLifeEligible(a, today))
            .Select(a => new SeniorLifeCandidateDto(
                a.AccountId,
                a.MembershipNo ?? "",
                Name(a),
                (a.JoinedDate ?? a.StartDate)?.ToString("yyyy-MM-dd"),
                a.MembershipType.Name,
                Years(a.JoinedDate ?? a.StartDate, today)))
            .OrderByDescending(a => a.YearsOfService)
            .ToList();

        var nominations = await _db.MembershipTransitions.AsNoTracking()
            .Include(t => t.Account).ThenInclude(a => a.Profile)
            .Include(t => t.Account).ThenInclude(a => a.MembershipType)
            .Where(t => t.Kind == "LIFE")
            .OrderByDescending(t => t.NominatedAt)
            .Take(80)
            .ToListAsync(cancellationToken);

        var recent = await _db.MembershipTransitions.AsNoTracking()
            .Include(t => t.Account).ThenInclude(a => a.Profile)
            .Where(t => t.Status == "CONVERTED")
            .OrderByDescending(t => t.DecidedAt ?? t.CreatedAt)
            .Take(12)
            .ToListAsync(cancellationToken);

        return new TransitionHubDto(
            total,
            full,
            life,
            pending,
            senior,
            nominations.Select(MapNomination).ToList(),
            recent.Select(t => new TransitionActivityDto(
                t.MembershipTransitionId,
                Name(t.Account),
                t.Kind == "SENIOR_LIFE" ? "Senior Life" : "Life",
                t.Status,
                (t.DecidedAt ?? t.CreatedAt).ToString("yyyy-MM-dd"),
                !string.IsNullOrWhiteSpace(t.LetterHtml))).ToList());
    }

    public async Task<int> ConfirmSeniorLifeAsync(IReadOnlyList<long> accountIds, long? actorUserId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var ids = (accountIds ?? []).Where(id => id > 0).Distinct().ToList();
        if (ids.Count == 0) throw new InvalidOperationException("Select at least one member to convert.");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var converted = 0;
        foreach (var id in ids)
        {
            var account = await LoadAccount(id, cancellationToken);
            if (account is null || !IsSeniorLifeEligible(account, today)) continue;
            await ConvertAsync(account, "LIFE", "50 years of continuous membership", null, actorUserId, cancellationToken);
            converted++;
        }
        if (converted == 0)
            throw new InvalidOperationException("None of the selected members are still eligible for Life membership.");
        return converted;
    }

    public async Task<int> ApplyDueSeniorLifeAsync(CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var accounts = await ActiveAccounts(cancellationToken);
        var converted = 0;
        foreach (var account in accounts.Where(a => IsSeniorLifeEligible(a, today)))
        {
            var loaded = await LoadAccount(account.AccountId, cancellationToken);
            if (loaded is null || !IsSeniorLifeEligible(loaded, today)) continue;
            await ConvertAsync(loaded, "LIFE", "50 years of continuous membership", null, null, cancellationToken);
            converted++;
        }
        return converted;
    }

    public async Task<LifeNominationDto> NominateLifeAsync(NominateLifeRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var account = await LoadAccount(request.AccountId, cancellationToken)
            ?? throw new InvalidOperationException("Member was not found.");
        var code = Code(account);
        if (!LifeSourceCodes.Contains(code))
            throw new InvalidOperationException("Only Full, Country, Overseas, Senior, or Associate members can be nominated for Life membership.");
        var pending = await _db.MembershipTransitions.AnyAsync(
            t => t.AccountId == account.AccountId && t.Kind == "LIFE" && t.Status == "PENDING",
            cancellationToken);
        if (pending)
            throw new InvalidOperationException("This member already has a Life nomination waiting for an AGM vote.");

        DateOnly? gmDate = null;
        if (!string.IsNullOrWhiteSpace(request.GmDate))
        {
            if (!DateOnly.TryParse(request.GmDate, out var parsed))
                throw new InvalidOperationException("Enter a valid general meeting date.");
            gmDate = parsed;
        }

        var row = new MembershipTransition
        {
            AccountId = account.AccountId,
            Kind = "LIFE",
            Status = "PENDING",
            NominatedAt = DateTime.UtcNow,
            NominatedByUserId = actorUserId,
            GmDate = gmDate,
            Notes = Clean(request.Notes),
            CreatedAt = DateTime.UtcNow
        };
        _db.MembershipTransitions.Add(row);
        _db.AuditLogs.Add(Audit(account.AccountId, "NOMINATE", code, "Life nomination pending AGM vote", actorUserId));
        await _db.SaveChangesAsync(cancellationToken);
        row.Account = account;
        return MapNomination(row);
    }

    public async Task<LifeNominationDto> RecordVoteAsync(long transitionId, RecordLifeVoteRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var row = await _db.MembershipTransitions
            .Include(t => t.Account).ThenInclude(a => a.Profile)
            .Include(t => t.Account).ThenInclude(a => a.MembershipType)
            .Include(t => t.Account).ThenInclude(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(t => t.MembershipTransitionId == transitionId, cancellationToken)
            ?? throw new InvalidOperationException("Nomination was not found.");
        if (row.Kind != "LIFE" || row.Status != "PENDING")
            throw new InvalidOperationException("Only a pending Life nomination can be voted.");

        row.DecidedAt = DateTime.UtcNow;
        row.DecidedByUserId = actorUserId;
        if (!string.IsNullOrWhiteSpace(request.Notes))
            row.Notes = Clean(request.Notes);

        if (!request.Approved)
        {
            row.Status = "DECLINED";
            _db.AuditLogs.Add(Audit(row.AccountId, "VOTE", "PENDING", "Life nomination declined", actorUserId));
            await _db.SaveChangesAsync(cancellationToken);
            return MapNomination(row);
        }

        await ConvertAsync(row.Account, "LIFE", "General meeting vote", row, actorUserId, cancellationToken);
        return MapNomination(row);
    }

    public async Task<string?> GetLetterHtmlAsync(long transitionId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        return await _db.MembershipTransitions.AsNoTracking()
            .Where(t => t.MembershipTransitionId == transitionId)
            .Select(t => t.LetterHtml)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<OwnLifeLetterDto?> GetOwnLetterAsync(long profileId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var row = await _db.MembershipTransitions.AsNoTracking()
            .Include(t => t.Account)
            .Where(t => t.Account.ProfileId == profileId
                && !t.Account.IsDeleted
                && t.Status == "CONVERTED"
                && t.LetterHtml != null
                && t.LetterHtml != "")
            .OrderByDescending(t => t.DecidedAt ?? t.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (row is null || string.IsNullOrWhiteSpace(row.LetterHtml)) return null;
        return new OwnLifeLetterDto(
            row.MembershipTransitionId,
            row.Kind == "SENIOR_LIFE" ? "Senior Life" : "Life",
            (row.DecidedAt ?? row.CreatedAt).ToString("yyyy-MM-dd"),
            row.LetterSentAt is not null,
            row.LetterHtml);
    }

    private async Task ConvertAsync(
        MAccount account,
        string targetCode,
        string reason,
        MembershipTransition? existing,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var target = await _db.MembershipTypes.FirstOrDefaultAsync(t => t.Code == targetCode, cancellationToken)
            ?? throw new InvalidOperationException($"Membership class {targetCode} is not configured.");
        var from = account.MembershipType.Name;
        var fromCode = Code(account);
        account.MembershipTypeId = target.MembershipTypeId;
        account.UpdatedByUserId = actorUserId;
        account.MembershipType = target;

        var year = DateTime.UtcNow.Year;
        var subs = await _db.Subscriptions
            .Where(s => s.AccountId == account.AccountId && s.SubscriptionYear >= year)
            .ToListAsync(cancellationToken);
        foreach (var sub in subs)
        {
            sub.WaivedFlag = true;
            sub.AmountDue = sub.AmountPaid;
            sub.ArrearsAmount = 0;
        }

        var kind = targetCode == "SENIOR_LIFE" ? "SENIOR_LIFE" : "LIFE";
        var title = targetCode == "SENIOR_LIFE" ? "Senior Life Member" : "Life Member";
        var letter = BuildLetter(account, title, reason);
        var sent = false;
        var email = account.Profile?.Email;
        if (!string.IsNullOrWhiteSpace(email))
        {
            try
            {
                sent = await _email.SendHtmlAsync(email.Trim(), $"Congratulations on your {title} membership", letter, cancellationToken);
            }
            catch
            {
                sent = false;
            }
        }

        if (existing is null)
        {
            existing = new MembershipTransition
            {
                AccountId = account.AccountId,
                Kind = kind,
                NominatedAt = DateTime.UtcNow,
                NominatedByUserId = actorUserId,
                CreatedAt = DateTime.UtcNow
            };
            _db.MembershipTransitions.Add(existing);
        }

        existing.Status = "CONVERTED";
        existing.DecidedAt = DateTime.UtcNow;
        existing.DecidedByUserId = actorUserId;
        existing.LetterHtml = letter;
        existing.LetterSentAt = sent ? DateTime.UtcNow : null;
        _db.AuditLogs.Add(Audit(
            account.AccountId,
            "CONVERT",
            from,
            $"{title}. Annual subscription set to 0. {reason}. From {fromCode}.",
            actorUserId));
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<List<MAccount>> ActiveAccounts(CancellationToken cancellationToken) =>
        await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .Where(a => !a.IsDeleted && a.IsActive && a.CurrentMemberStatus.IsActiveStatus && !a.CurrentMemberStatus.IsTerminal)
            .ToListAsync(cancellationToken);

    private Task<MAccount?> LoadAccount(long accountId, CancellationToken cancellationToken) =>
        _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);

    private static bool IsSeniorLifeEligible(MAccount account, DateOnly today)
    {
        if (!SeniorSourceCodes.Contains(Code(account))) return false;
        var joined = account.JoinedDate ?? account.StartDate;
        if (joined is null) return false;
        return Years(joined, today) >= 50m;
    }

    private static decimal Years(DateOnly? joined, DateOnly today)
    {
        if (joined is null) return 0;
        var days = today.DayNumber - joined.Value.DayNumber;
        return Math.Round(days / 365.25m, 1, MidpointRounding.AwayFromZero);
    }

    private static string Code(MAccount account) =>
        (account.MembershipType?.Code ?? "").Trim().ToUpperInvariant();

    private static string Name(MAccount account)
    {
        var name = $"{account.Profile?.FirstName} {account.Profile?.LastName}".Trim();
        return string.IsNullOrWhiteSpace(name) ? account.MembershipNo ?? "Member" : name;
    }

    private static string? Clean(string? value)
    {
        var text = (value ?? "").Trim();
        return text.Length == 0 ? null : text.Length <= 1000 ? text : text[..1000];
    }

    private static LifeNominationDto MapNomination(MembershipTransition t) => new(
        t.MembershipTransitionId,
        t.AccountId,
        t.Account.MembershipNo ?? "",
        Name(t.Account),
        (t.Account.JoinedDate ?? t.Account.StartDate)?.ToString("yyyy-MM-dd"),
        t.Account.MembershipType?.Name ?? "",
        t.NominatedAt.ToString("yyyy-MM-dd"),
        t.GmDate?.ToString("yyyy-MM-dd"),
        t.Status,
        t.Notes,
        !string.IsNullOrWhiteSpace(t.LetterHtml));

    private static AuditLog Audit(long accountId, string action, string? oldValues, string newValues, long? actorUserId) => new()
    {
        TableName = "MAccount",
        RecordId = accountId,
        Action = action,
        OldValues = oldValues,
        NewValues = newValues,
        ChangedByUserId = actorUserId,
        ChangedAt = DateTime.UtcNow
    };

    private static string BuildLetter(MAccount account, string title, string reason)
    {
        var name = Name(account);
        var no = account.MembershipNo ?? "—";
        var date = DateTime.UtcNow.ToString("dd MMMM yyyy");
        return $"""
<!DOCTYPE html>
<html>
<body style="font-family:Georgia,serif;color:#1f2937;max-width:680px;margin:24px auto;line-height:1.5">
  <p style="letter-spacing:.14em;font-size:12px;text-transform:uppercase">Aero Club of East Africa</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Congratulations</h1>
  <p>{date}</p>
  <p>Dear {System.Net.WebUtility.HtmlEncode(name)},</p>
  <p>The Club is pleased to confirm your promotion to <strong>{System.Net.WebUtility.HtmlEncode(title)}</strong>
  (membership {System.Net.WebUtility.HtmlEncode(no)}).</p>
  <p>This follows {System.Net.WebUtility.HtmlEncode(reason)}. Your annual subscription is now waived and recorded as Ksh 0.00.</p>
  <p>We are glad to have you among the Club's life members.</p>
  <p>Yours sincerely,<br/>The Aero Club of East Africa</p>
</body>
</html>
""";
    }
}
