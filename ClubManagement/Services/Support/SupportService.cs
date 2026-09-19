using ClubManagement.Auth;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Support;
using ClubManagement.Entities.Engagement;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Support;

public interface ISupportService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<SupportCategoryDto>> CategoriesAsync(CancellationToken cancellationToken);
    Task<SupportDashboardDto> DashboardAsync(long userAccountId, IReadOnlyList<string> roles, CancellationToken cancellationToken);
    Task<IReadOnlyList<SupportTicketListItemDto>> ListAsync(
        long userAccountId,
        IReadOnlyList<string> roles,
        string? scope,
        string? status,
        string? search,
        CancellationToken cancellationToken);
    Task<SupportTicketDetailDto?> GetAsync(long ticketId, long userAccountId, IReadOnlyList<string> roles, CancellationToken cancellationToken);
    Task<SupportTicketDetailDto> CreateAsync(CreateSupportTicketRequest request, long userAccountId, long profileId, IReadOnlyList<string> roles, CancellationToken cancellationToken);
    Task AttachAsync(long ticketId, long userAccountId, IReadOnlyList<string> roles, string fileName, string url, CancellationToken cancellationToken);
    Task<SupportTicketDetailDto> ReplyAsync(long ticketId, ReplySupportTicketRequest request, long userAccountId, IReadOnlyList<string> roles, CancellationToken cancellationToken);
    Task<SupportTicketDetailDto> ChangeStatusAsync(long ticketId, string status, long userAccountId, IReadOnlyList<string> roles, CancellationToken cancellationToken);
}

public class SupportService : ISupportService
{
    public static readonly string[] CategoryRoleCodes =
    [
        "CHAIRMAN",
        "GENERAL_MANAGER",
        "TREASURER",
        "COMMITTEE_MEMBER",
        "ADMIN",
        "RECEPTIONIST"
    ];

    private static readonly string[] Statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    private static readonly string[] Priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];

    private readonly ApplicationModuleDbContext _db;
    private readonly ITenantContext _tenant;

    public SupportService(ApplicationModuleDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Support_ticket', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Support_ticket (
        support_ticket_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        tenant_id BIGINT NOT NULL CONSTRAINT DF_support_ticket_tenant DEFAULT(0),
        ticket_no NVARCHAR(30) NOT NULL,
        subject NVARCHAR(200) NOT NULL,
        description NVARCHAR(MAX) NULL,
        category_role_code NVARCHAR(50) NOT NULL,
        category_email NVARCHAR(200) NULL,
        category_assignee_name NVARCHAR(200) NULL,
        priority NVARCHAR(20) NOT NULL CONSTRAINT DF_support_ticket_priority DEFAULT(N'NORMAL'),
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_support_ticket_status DEFAULT(N'OPEN'),
        created_by_user_id BIGINT NOT NULL,
        created_by_profile_id BIGINT NOT NULL,
        assigned_user_id BIGINT NULL,
        attachment_file_name NVARCHAR(260) NULL,
        attachment_url NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL,
        updated_at DATETIME2 NULL,
        updated_by_user_id BIGINT NULL
    );
    CREATE UNIQUE INDEX UX_Support_ticket_no ON dbo.Support_ticket(ticket_no);
    CREATE INDEX IX_Support_ticket_category ON dbo.Support_ticket(category_role_code, status);
END
", cancellationToken);

        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.Support_ticket_message', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Support_ticket_message (
        support_ticket_message_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        support_ticket_id BIGINT NOT NULL,
        author_user_id BIGINT NOT NULL,
        author_name NVARCHAR(200) NOT NULL,
        body NVARCHAR(MAX) NOT NULL,
        is_staff BIT NOT NULL CONSTRAINT DF_support_msg_staff DEFAULT(0),
        created_at DATETIME2 NOT NULL,
        CONSTRAINT FK_support_msg_ticket FOREIGN KEY (support_ticket_id)
            REFERENCES dbo.Support_ticket(support_ticket_id) ON DELETE CASCADE
    );
END
", cancellationToken);
    }

    public async Task<IReadOnlyList<SupportCategoryDto>> CategoriesAsync(CancellationToken cancellationToken)
    {
        var roles = await _db.SystemRoles.AsNoTracking()
            .Where(r => r.IsActive && CategoryRoleCodes.Contains(r.Code))
            .OrderBy(r => r.SortOrder)
            .ToListAsync(cancellationToken);

        var holders = await _db.UserAccounts.AsNoTracking().IgnoreQueryFilters()
            .Include(u => u.Profile)
            .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .Where(u => u.IsActive && u.AccountStatus == "ACTIVE")
            .ToListAsync(cancellationToken);

        var companies = await _db.Tenants.AsNoTracking().IgnoreQueryFilters()
            .ToDictionaryAsync(t => t.TenantId, t => t.Name, cancellationToken);

        var companyId = _tenant.IsResolved ? _tenant.TenantId : null;

        return roles.Select(role =>
        {
            var contacts = holders
                .Where(u => u.UserRoles.Any(r => r.Role.IsActive && string.Equals(r.Role.Code, role.Code, StringComparison.OrdinalIgnoreCase)))
                .Where(u => companyId is null or 0 || u.TenantId == 0 || u.TenantId == companyId)
                .Select(u => new SupportCategoryContactDto(
                    string.Join(" ", new[] { u.Profile.FirstName, u.Profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
                    u.Profile.Email ?? "",
                    u.TenantId > 0 && companies.TryGetValue(u.TenantId, out var name) ? name : null))
                .Where(c => !string.IsNullOrWhiteSpace(c.Email))
                .DistinctBy(c => c.Email, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return new SupportCategoryDto(role.Code, role.Name, contacts);
        }).ToList();
    }

    public async Task<SupportDashboardDto> DashboardAsync(long userAccountId, IReadOnlyList<string> roles, CancellationToken cancellationToken)
    {
        var inboxRoles = roles.Where(r => CategoryRoleCodes.Contains(r, StringComparer.OrdinalIgnoreCase)).ToList();
        var rows = inboxRoles.Count > 0
            ? await VisibleQuery(userAccountId, roles, inboxOnly: true).ToListAsync(cancellationToken)
            : await VisibleQuery(userAccountId, roles, inboxOnly: false)
                .Where(t => t.CreatedByUserId == userAccountId)
                .ToListAsync(cancellationToken);
        var today = DateTime.UtcNow.Date;
        return new SupportDashboardDto(
            rows.Count(t => t.Status == "OPEN"),
            rows.Count(t => t.Status == "IN_PROGRESS"),
            rows.Count(t => t.Status == "RESOLVED"),
            rows.Count(t => t.Status == "CLOSED"),
            rows.Count(t => t.CreatedAt.Date == today),
            rows.Count,
            rows.GroupBy(t => RoleName(t.CategoryRoleCode)).Select(g => new SupportNamedCountDto(g.Key, g.Count())).OrderByDescending(x => x.Count).ToList(),
            rows.GroupBy(t => PriorityName(t.Priority)).Select(g => new SupportNamedCountDto(g.Key, g.Count())).OrderByDescending(x => x.Count).ToList());
    }

    public async Task<IReadOnlyList<SupportTicketListItemDto>> ListAsync(
        long userAccountId,
        IReadOnlyList<string> roles,
        string? scope,
        string? status,
        string? search,
        CancellationToken cancellationToken)
    {
        var inboxOnly = string.Equals(scope, "inbox", StringComparison.OrdinalIgnoreCase);
        var mineOnly = string.Equals(scope, "mine", StringComparison.OrdinalIgnoreCase)
            || string.Equals(scope, "created", StringComparison.OrdinalIgnoreCase);
        var query = VisibleQuery(userAccountId, roles, inboxOnly);
        if (mineOnly)
            query = query.Where(t => t.CreatedByUserId == userAccountId);

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            var code = NormalizeStatus(status);
            query = query.Where(t => t.Status == code);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var needle = search.Trim();
            query = query.Where(t => t.Subject.Contains(needle) || t.TicketNo.Contains(needle));
        }

        var rows = await query.OrderByDescending(t => t.CreatedAt).Take(200).ToListAsync(cancellationToken);
        var names = await LoadCreatorNamesAsync(rows.Select(r => r.CreatedByUserId).Distinct().ToList(), cancellationToken);
        return rows.Select(t => MapList(t, names)).ToList();
    }

    public async Task<SupportTicketDetailDto?> GetAsync(long ticketId, long userAccountId, IReadOnlyList<string> roles, CancellationToken cancellationToken)
    {
        var ticket = await VisibleQuery(userAccountId, roles, inboxOnly: false)
            .Include(t => t.Messages)
            .FirstOrDefaultAsync(t => t.SupportTicketId == ticketId, cancellationToken);
        if (ticket is null) return null;
        var names = await LoadCreatorNamesAsync([ticket.CreatedByUserId], cancellationToken);
        return MapDetail(ticket, names);
    }

    public async Task<SupportTicketDetailDto> CreateAsync(
        CreateSupportTicketRequest request,
        long userAccountId,
        long profileId,
        IReadOnlyList<string> roles,
        CancellationToken cancellationToken)
    {
        var subject = (request.Subject ?? "").Trim();
        var category = (request.CategoryRoleCode ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(subject))
            throw new InvalidOperationException("Subject is required.");
        if (!CategoryRoleCodes.Contains(category, StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Select a category (Chairman, Treasurer, General Manager, Committee Member, Admin or Receptionist).");

        var categories = await CategoriesAsync(cancellationToken);
        var match = categories.First(c => string.Equals(c.RoleCode, category, StringComparison.OrdinalIgnoreCase));
        var contact = match.Contacts.FirstOrDefault();
        var priority = NormalizePriority(request.Priority);
        var now = DateTime.UtcNow;
        var companyId = _tenant.IsResolved ? _tenant.TenantId!.Value : 0;

        var ticket = new SupportTicket
        {
            TenantId = companyId > 0 ? companyId : CompanyMembership.ExplicitNoCompany,
            TicketNo = "PENDING",
            Subject = subject,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            CategoryRoleCode = category,
            CategoryEmail = contact?.Email,
            CategoryAssigneeName = contact?.Name,
            Priority = priority,
            Status = "OPEN",
            CreatedByUserId = userAccountId,
            CreatedByProfileId = profileId,
            CreatedAt = now
        };
        _db.SupportTickets.Add(ticket);
        await _db.SaveChangesAsync(cancellationToken);

        ticket.TicketNo = (3070000 + ticket.SupportTicketId).ToString();
        if (!string.IsNullOrWhiteSpace(ticket.Description))
        {
            var author = await AuthorNameAsync(userAccountId, cancellationToken);
            _db.SupportTicketMessages.Add(new SupportTicketMessage
            {
                SupportTicketId = ticket.SupportTicketId,
                AuthorUserId = userAccountId,
                AuthorName = author,
                Body = ticket.Description!,
                IsStaff = false,
                CreatedAt = now
            });
        }
        await _db.SaveChangesAsync(cancellationToken);
        return (await GetAsync(ticket.SupportTicketId, userAccountId, roles, cancellationToken))!;
    }

    public async Task AttachAsync(long ticketId, long userAccountId, IReadOnlyList<string> roles, string fileName, string url, CancellationToken cancellationToken)
    {
        var ticket = await VisibleQuery(userAccountId, roles, inboxOnly: false)
            .FirstOrDefaultAsync(t => t.SupportTicketId == ticketId, cancellationToken)
            ?? throw new InvalidOperationException("Ticket was not found.");
        if (ticket.CreatedByUserId != userAccountId)
            throw new InvalidOperationException("Only the ticket owner can add the opening attachment.");
        ticket.AttachmentFileName = fileName;
        ticket.AttachmentUrl = url;
        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.UpdatedByUserId = userAccountId;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<SupportTicketDetailDto> ReplyAsync(
        long ticketId,
        ReplySupportTicketRequest request,
        long userAccountId,
        IReadOnlyList<string> roles,
        CancellationToken cancellationToken)
    {
        var body = (request.Body ?? "").Trim();
        if (string.IsNullOrWhiteSpace(body))
            throw new InvalidOperationException("Type a reply first.");

        var ticket = await VisibleQuery(userAccountId, roles, inboxOnly: false)
            .FirstOrDefaultAsync(t => t.SupportTicketId == ticketId, cancellationToken)
            ?? throw new InvalidOperationException("Ticket was not found.");

        var isInboxStaff = IsInboxHolder(roles, ticket.CategoryRoleCode) && ticket.CreatedByUserId != userAccountId;
        var author = await AuthorNameAsync(userAccountId, cancellationToken);
        _db.SupportTicketMessages.Add(new SupportTicketMessage
        {
            SupportTicketId = ticket.SupportTicketId,
            AuthorUserId = userAccountId,
            AuthorName = author,
            Body = body,
            IsStaff = isInboxStaff,
            CreatedAt = DateTime.UtcNow
        });
        if (isInboxStaff && ticket.Status == "OPEN")
            ticket.Status = "IN_PROGRESS";
        else if (!isInboxStaff && ticket.Status == "RESOLVED")
            ticket.Status = "OPEN";
        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.UpdatedByUserId = userAccountId;
        await _db.SaveChangesAsync(cancellationToken);
        return (await GetAsync(ticketId, userAccountId, roles, cancellationToken))!;
    }

    public async Task<SupportTicketDetailDto> ChangeStatusAsync(
        long ticketId,
        string status,
        long userAccountId,
        IReadOnlyList<string> roles,
        CancellationToken cancellationToken)
    {
        var ticket = await VisibleQuery(userAccountId, roles, inboxOnly: false)
            .FirstOrDefaultAsync(t => t.SupportTicketId == ticketId, cancellationToken)
            ?? throw new InvalidOperationException("Ticket was not found.");
        if (!IsInboxHolder(roles, ticket.CategoryRoleCode) && !roles.Contains("ADMIN", StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only the assigned role can change ticket status.");
        ticket.Status = NormalizeStatus(status);
        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.UpdatedByUserId = userAccountId;
        await _db.SaveChangesAsync(cancellationToken);
        return (await GetAsync(ticketId, userAccountId, roles, cancellationToken))!;
    }

    private IQueryable<SupportTicket> VisibleQuery(long userAccountId, IReadOnlyList<string> roles, bool inboxOnly)
    {
        var query = _db.SupportTickets.AsQueryable();
        var inboxRoles = roles.Where(r => CategoryRoleCodes.Contains(r, StringComparer.OrdinalIgnoreCase)).ToList();
        var isAdmin = roles.Contains("ADMIN", StringComparer.OrdinalIgnoreCase);
        if (inboxOnly)
        {
            if (inboxRoles.Count == 0) return query.Where(_ => false);
            return query.Where(t => inboxRoles.Contains(t.CategoryRoleCode));
        }

        if (isAdmin) return query;
        return query.Where(t => t.CreatedByUserId == userAccountId || inboxRoles.Contains(t.CategoryRoleCode));
    }

    private static bool IsInboxHolder(IReadOnlyList<string> roles, string categoryRoleCode) =>
        roles.Any(r => string.Equals(r, categoryRoleCode, StringComparison.OrdinalIgnoreCase))
        || roles.Contains("ADMIN", StringComparer.OrdinalIgnoreCase);

    private async Task<Dictionary<long, string>> LoadCreatorNamesAsync(IReadOnlyList<long> userIds, CancellationToken cancellationToken)
    {
        if (userIds.Count == 0) return [];
        return await _db.UserAccounts.AsNoTracking().IgnoreQueryFilters()
            .Include(u => u.Profile)
            .Where(u => userIds.Contains(u.UserAccountId))
            .ToDictionaryAsync(
                u => u.UserAccountId,
                u => string.Join(" ", new[] { u.Profile.FirstName, u.Profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
                cancellationToken);
    }

    private async Task<string> AuthorNameAsync(long userAccountId, CancellationToken cancellationToken)
    {
        var names = await LoadCreatorNamesAsync([userAccountId], cancellationToken);
        return names.TryGetValue(userAccountId, out var name) && !string.IsNullOrWhiteSpace(name) ? name : "You";
    }

    private static SupportTicketListItemDto MapList(SupportTicket t, IReadOnlyDictionary<long, string> names) =>
        new(
            t.SupportTicketId,
            t.TicketNo,
            t.Subject,
            t.CategoryRoleCode,
            RoleName(t.CategoryRoleCode),
            t.CategoryEmail,
            t.CategoryAssigneeName,
            t.Priority,
            t.Status,
            names.GetValueOrDefault(t.CreatedByUserId, "Member"),
            t.CreatedAt,
            t.UpdatedAt);

    private static SupportTicketDetailDto MapDetail(SupportTicket t, IReadOnlyDictionary<long, string> names) =>
        new(
            t.SupportTicketId,
            t.TicketNo,
            t.Subject,
            t.Description,
            t.CategoryRoleCode,
            RoleName(t.CategoryRoleCode),
            t.CategoryEmail,
            t.CategoryAssigneeName,
            t.Priority,
            t.Status,
            names.GetValueOrDefault(t.CreatedByUserId, "Member"),
            t.CreatedByUserId,
            t.AttachmentFileName,
            t.AttachmentUrl,
            t.CreatedAt,
            t.UpdatedAt,
            t.Messages.OrderBy(m => m.CreatedAt).Select(m => new SupportTicketMessageDto(
                m.SupportTicketMessageId, m.AuthorName, m.IsStaff, m.Body, m.CreatedAt)).ToList());

    private static string RoleName(string code) => code.Replace("_", " ").ToLowerInvariant()
        .Split(' ', StringSplitOptions.RemoveEmptyEntries)
        .Select(w => char.ToUpperInvariant(w[0]) + w[1..])
        .Aggregate(string.Empty, (a, b) => string.IsNullOrEmpty(a) ? b : $"{a} {b}");

    private static string PriorityName(string code) => RoleName(code);

    private static string NormalizeStatus(string? raw)
    {
        var code = (raw ?? "").Trim().ToUpperInvariant().Replace(" ", "_");
        if (code is "INPROGRESS") code = "IN_PROGRESS";
        if (!Statuses.Contains(code))
            throw new InvalidOperationException("Status must be Open, In Progress, Resolved or Closed.");
        return code;
    }

    private static string NormalizePriority(string? raw)
    {
        var code = (raw ?? "NORMAL").Trim().ToUpperInvariant();
        return Priorities.Contains(code) ? code : "NORMAL";
    }
}
