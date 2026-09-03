using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Common;
using ClubManagement.DTOs.Identity;
using ClubManagement.Entities;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Subscriptions;
using ClubManagement.Services.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.MembershipAccount;

public record MemberListItemDto(
    long AccountId,
    long ProfileId,
    string MembershipNo,
    string FullName,
    long MembershipTypeId,
    string MembershipType,
    string Status,
    DateOnly? JoinedDate,
    bool CanVote,
    bool CanRunForOffice,
    bool ReciprocationAllowed,
    bool CanIntroduceGuests,
    bool IsPermanent,
    decimal OutstandingArrears);

public record RegisterExistingMemberRequest(
    string FirstName,
    string LastName,
    string? Title,
    string? Email,
    string? Mobile,
    string MembershipNo,
    long MembershipTypeId,
    long ElectionTypeId,
    DateOnly JoinedDate,
    long? GenderId,
    DateOnly? DateOfBirth);

public record RegisterExistingMemberResult(
    MemberListItemDto Member,
    string Username,
    string InviteUrl,
    bool EmailSent);

public record ChangeMemberStatusRequest(long ToStatusId, string? Reason);

public record ChangeMemberTypeRequest(long MembershipTypeId, string? Reason);

public interface IMemberLifecycleService
{
    Task<PagedResult<MemberListItemDto>> SearchAsync(string? search, string? statusCode, string? typeCode, PagedRequest paging, CancellationToken cancellationToken);
    Task<RegisterExistingMemberResult> RegisterExistingAsync(RegisterExistingMemberRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<RegisterExistingMemberResult?> IssuePortalInviteAsync(long accountId, long? actorUserId, CancellationToken cancellationToken);
    Task<MemberListItemDto?> ChangeStatusAsync(long accountId, ChangeMemberStatusRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<MemberListItemDto?> DeactivateAsync(long accountId, string? reason, long? actorUserId, CancellationToken cancellationToken);
    Task<bool> SoftDeleteAsync(long accountId, long? actorUserId, CancellationToken cancellationToken);
    Task<MemberListItemDto?> ChangeTypeAsync(long accountId, ChangeMemberTypeRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<MemberListItemDto?> ElectFromApplicationAsync(
        long applicationId,
        long? actorUserId,
        DateOnly dateElected,
        string membershipNumber,
        string electedMembershipType,
        CancellationToken cancellationToken);
}

public class MemberLifecycleService : IMemberLifecycleService
{
    private readonly ApplicationModuleDbContext _db;
    private readonly IClubPolicyService _policy;
    private readonly IUserManagementService _users;

    public MemberLifecycleService(ApplicationModuleDbContext db, IClubPolicyService policy, IUserManagementService users)
    {
        _db = db;
        _policy = policy;
        _users = users;
    }

    public async Task<PagedResult<MemberListItemDto>> SearchAsync(string? search, string? statusCode, string? typeCode, PagedRequest paging, CancellationToken cancellationToken)
    {
        var query = _db.Accounts.AsNoTracking()
            .Where(a => !a.IsDeleted)
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(statusCode))
            query = query.Where(a => a.CurrentMemberStatus.Code == statusCode);
        if (!string.IsNullOrWhiteSpace(typeCode))
            query = query.Where(a => a.MembershipType.Code == typeCode);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(a =>
                (a.MembershipNo != null && a.MembershipNo.Contains(term)) ||
                a.Profile.FirstName.Contains(term) ||
                a.Profile.LastName.Contains(term) ||
                (a.Profile.Email != null && a.Profile.Email.Contains(term)));
        }

        var ordered = query.OrderBy(a => a.MembershipNo);
        var total = await ordered.CountAsync(cancellationToken);
        var rows = await ordered.Skip(paging.Skip).Take(paging.PageSize).ToListAsync(cancellationToken);
        var accountIds = rows.Select(r => r.AccountId).ToList();
        var arrears = await _db.Arrearses.AsNoTracking()
            .Where(a => accountIds.Contains(a.AccountId) && a.Status == "OPEN")
            .GroupBy(a => a.AccountId)
            .Select(g => new { AccountId = g.Key, Total = g.Sum(x => x.Amount) })
            .ToDictionaryAsync(x => x.AccountId, x => x.Total, cancellationToken);

        return Paging.Create(rows.Select(a => Map(a, arrears.GetValueOrDefault(a.AccountId))), paging, total);
    }

    public async Task<RegisterExistingMemberResult> RegisterExistingAsync(RegisterExistingMemberRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var email = (request.Email ?? "").Trim();
        if (string.IsNullOrWhiteSpace(email))
            throw new InvalidOperationException("Email is required so the member can receive a portal invite.");
        if (await _db.Accounts.AnyAsync(a => a.MembershipNo == request.MembershipNo, cancellationToken))
            throw new InvalidOperationException("Membership number already exists.");
        if (await _db.Profiles.AnyAsync(p => p.Email == email && !p.IsDeleted, cancellationToken))
            throw new InvalidOperationException("That email is already in use.");

        var membershipNo = request.MembershipNo.Trim();
        var username = membershipNo;

        var votingCap = await _policy.GetIntAsync("MAX_VOTING_MEMBERS", 700, cancellationToken);
        var membershipType = await _db.MembershipTypes.FirstAsync(x => x.MembershipTypeId == request.MembershipTypeId, cancellationToken);
        if (membershipType.CanVote)
        {
            var votingCount = await _db.Accounts.CountAsync(a => a.IsActive && !a.IsDeleted && a.MembershipType.CanVote && a.CurrentMemberStatus.IsActiveStatus, cancellationToken);
            if (votingCount >= votingCap)
                throw new InvalidOperationException($"Voting membership is capped at {votingCap} members.");
        }

        var activeStatus = await RequireStatus("ACTIVE", cancellationToken);
        var now = DateTime.UtcNow;
        var profile = new MProfile
        {
            Title = request.Title,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Email = email,
            Mobile = request.Mobile,
            GenderId = request.GenderId,
            DateOfBirth = request.DateOfBirth,
            MembershipNo = membershipNo,
            IsActive = true,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.Profiles.Add(profile);
        await _db.SaveChangesAsync(cancellationToken);

        var account = new MAccount
        {
            ProfileId = profile.ProfileId,
            MembershipTypeId = request.MembershipTypeId,
            ElectionTypeId = request.ElectionTypeId,
            MembershipNo = membershipNo,
            CurrentMemberStatusId = activeStatus.MemberStatusId,
            JoinedDate = request.JoinedDate,
            StartDate = request.JoinedDate,
            IsActive = true,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.Accounts.Add(account);
        await _db.SaveChangesAsync(cancellationToken);

        _db.MemberStatusHistories.Add(new MemberStatusHistory
        {
            AccountId = account.AccountId,
            ToStatusId = activeStatus.MemberStatusId,
            EffectiveDate = request.JoinedDate,
            Reason = "Legacy / administrative registration",
            ReferenceType = "OTHER",
            ChangedByUserId = actorUserId,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        });
        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MAccount",
            RecordId = account.AccountId,
            Action = "INSERT",
            NewValues = account.MembershipNo,
            ChangedByUserId = actorUserId,
            ChangedAt = now
        });
        await _db.SaveChangesAsync(cancellationToken);

        var invite = await _users.CreateLoginForProfileAsync(
            profile.ProfileId, username, email, profile.FirstName, "MEMBER", actorUserId, cancellationToken);

        account.Profile = profile;
        account.MembershipType = membershipType;
        account.CurrentMemberStatus = activeStatus;
        return new RegisterExistingMemberResult(Map(account, 0), username, invite.InviteUrl, invite.EmailSent);
    }

    public async Task<RegisterExistingMemberResult?> IssuePortalInviteAsync(long accountId, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);
        if (account is null) return null;

        var email = (account.Profile.Email ?? "").Trim();
        if (string.IsNullOrWhiteSpace(email))
            throw new InvalidOperationException("Add an email on the member profile before sending a portal invite.");

        var existing = await _db.UserAccounts.FirstOrDefaultAsync(u => u.ProfileId == account.ProfileId, cancellationToken);
        InviteResult invite;
        string username;
        if (existing is not null)
        {
            username = existing.Username;
            invite = await _users.SendResetLinkAsync(existing.UserAccountId, actorUserId, cancellationToken)
                ?? throw new InvalidOperationException("Could not issue a password link for this member.");
        }
        else
        {
            username = string.IsNullOrWhiteSpace(account.MembershipNo)
                ? email
                : account.MembershipNo;
            invite = await _users.CreateLoginForProfileAsync(
                account.ProfileId, username, email, account.Profile.FirstName, "MEMBER", actorUserId, cancellationToken);
        }

        return new RegisterExistingMemberResult(Map(account, 0), username, invite.InviteUrl, invite.EmailSent);
    }

    public async Task<MemberListItemDto?> ChangeStatusAsync(long accountId, ChangeMemberStatusRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.AccountId == accountId, cancellationToken);
        if (account is null) return null;

        var from = account.CurrentMemberStatusId;
        account.CurrentMemberStatusId = request.ToStatusId;
        var toStatus = await _db.MemberStatuses.FirstAsync(s => s.MemberStatusId == request.ToStatusId, cancellationToken);
        account.IsActive = toStatus.IsActiveStatus && !toStatus.IsTerminal;
        account.UpdatedByUserId = actorUserId;

        _db.MemberStatusHistories.Add(new MemberStatusHistory
        {
            AccountId = account.AccountId,
            FromStatusId = from,
            ToStatusId = request.ToStatusId,
            EffectiveDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Reason = request.Reason,
            ReferenceType = "OTHER",
            ChangedByUserId = actorUserId,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);
        account.CurrentMemberStatus = toStatus;
        return Map(account, 0);
    }

    public async Task<MemberListItemDto?> DeactivateAsync(long accountId, string? reason, long? actorUserId, CancellationToken cancellationToken)
    {
        var inactive = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "INACTIVE", cancellationToken)
            ?? await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "POSTED", cancellationToken)
            ?? throw new InvalidOperationException("INACTIVE member status is not configured.");
        return await ChangeStatusAsync(accountId, new ChangeMemberStatusRequest(inactive.MemberStatusId, reason ?? "Deactivated by admin"), actorUserId, cancellationToken);
    }

    public async Task<bool> SoftDeleteAsync(long accountId, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);
        if (account is null) return false;
        account.IsDeleted = true;
        account.IsActive = false;
        account.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<MemberListItemDto?> ChangeTypeAsync(long accountId, ChangeMemberTypeRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.AccountId == accountId && !a.IsDeleted, cancellationToken);
        if (account is null) return null;

        var membershipType = await _db.MembershipTypes.FirstAsync(x => x.MembershipTypeId == request.MembershipTypeId, cancellationToken);
        if (membershipType.CanVote && !account.MembershipType.CanVote)
        {
            var votingCap = await _policy.GetIntAsync("MAX_VOTING_MEMBERS", 700, cancellationToken);
            var votingCount = await _db.Accounts.CountAsync(a => a.IsActive && !a.IsDeleted && a.MembershipType.CanVote && a.CurrentMemberStatus.IsActiveStatus, cancellationToken);
            if (votingCount >= votingCap)
                throw new InvalidOperationException($"Voting membership is capped at {votingCap} members.");
        }

        var fromType = account.MembershipType.Name;
        account.MembershipTypeId = request.MembershipTypeId;
        account.UpdatedByUserId = actorUserId;
        _db.AuditLogs.Add(new AuditLog
        {
            TableName = "MAccount",
            RecordId = account.AccountId,
            Action = "UPDATE",
            OldValues = fromType,
            NewValues = membershipType.Name,
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);
        account.MembershipType = membershipType;
        return Map(account, 0);
    }

    public async Task<MemberListItemDto?> ElectFromApplicationAsync(
        long applicationId,
        long? actorUserId,
        DateOnly dateElected,
        string membershipNumber,
        string electedMembershipType,
        CancellationToken cancellationToken)
    {
        var membershipNo = (membershipNumber ?? "").Trim();
        if (string.IsNullOrWhiteSpace(membershipNo))
            throw new InvalidOperationException("The Chairman must assign a membership number at election.");
        var typeCode = NormalizeElectedType(electedMembershipType);

        var application = await _db.Applications
            .Include(a => a.Applicant)
            .Include(a => a.ElectionType)
            .Include(a => a.ApplicationApprovals).ThenInclude(x => x.ApproverRole)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId, cancellationToken);
        if (application is null) return null;

        var minCommittee = await _policy.GetIntAsync("MIN_COMMITTEE_SIGNATURES", 4, cancellationToken);
        var approvals = application.ApplicationApprovals.Where(a => a.ApprovalDecision == "APPROVE").ToList();
        var committeeCount = approvals.Count(a => a.ApproverRole.Code is "COMMITTEE_MEMBER" or "CHAIRMAN" or "VICE_CHAIRMAN" or "TREASURER");
        var gmCount = approvals.Count(a => a.ApproverRole.Code is "GENERAL_MANAGER" or "MANAGER");
        if (committeeCount < minCommittee || gmCount < 1)
            throw new InvalidOperationException($"Election requires at least {minCommittee} Committee signatures plus the General Manager.");

        var taken = await _db.Accounts.AnyAsync(
            a => a.MembershipNo == membershipNo && !a.IsDeleted && a.ApplicationId != applicationId,
            cancellationToken);
        if (taken)
            throw new InvalidOperationException($"Membership number {membershipNo} is already assigned.");

        var membershipType = await _db.MembershipTypes.FirstOrDefaultAsync(x => x.Code == typeCode, cancellationToken)
            ?? throw new InvalidOperationException($"Membership type '{typeCode}' is missing.");
        var electionType = await _db.ElectionTypes.FirstOrDefaultAsync(x => x.Code == typeCode, cancellationToken)
            ?? application.ElectionType
            ?? await _db.ElectionTypes.FirstAsync(cancellationToken);
        var activeStatus = await RequireStatus("ACTIVE", cancellationToken);
        var approvedStatus = await _db.ApplicationStatuses.FirstOrDefaultAsync(x => x.Code == "Approved" || x.Code == "APPROVED", cancellationToken);
        var now = DateTime.UtcNow;

        var account = await _db.Accounts
            .Include(a => a.Profile)
            .Include(a => a.MembershipType)
            .Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.ApplicationId == applicationId && !a.IsDeleted, cancellationToken);

        if (account is null)
        {
            account = new MAccount
            {
                ProfileId = application.ApplicantProfileId,
                ApplicationId = application.ApplicationId,
                MembershipTypeId = membershipType.MembershipTypeId,
                ElectionTypeId = electionType.ElectionTypeId,
                MembershipNo = membershipNo,
                CurrentMemberStatusId = activeStatus.MemberStatusId,
                JoinedDate = dateElected,
                StartDate = dateElected,
                EndDate = null,
                EntranceFeeAmount = application.EntranceFeeAmount,
                IsActive = true,
                CreatedAt = now,
                CreatedByUserId = actorUserId
            };
            _db.Accounts.Add(account);
        }
        else
        {
            account.MembershipTypeId = membershipType.MembershipTypeId;
            account.ElectionTypeId = electionType.ElectionTypeId;
            account.MembershipNo = membershipNo;
            account.CurrentMemberStatusId = activeStatus.MemberStatusId;
            account.JoinedDate = dateElected;
            account.StartDate = dateElected;
            account.EndDate = null;
            account.IsActive = true;
            account.UpdatedByUserId = actorUserId;
        }

        application.Applicant.MembershipNo = membershipNo;
        if (approvedStatus is not null)
            application.ApplicationStatusId = approvedStatus.ApplicationStatusId;
        application.UpdatedAt = now;
        application.UpdatedByUserId = actorUserId;

        var memberRole = await _db.SystemRoles.FirstOrDefaultAsync(r => r.Code == "MEMBER", cancellationToken);
        var applicantRole = await _db.SystemRoles.FirstOrDefaultAsync(r => r.Code == "APPLICANT", cancellationToken);
        var users = await _db.UserAccounts.Include(u => u.UserRoles)
            .Where(u => u.ProfileId == application.ApplicantProfileId)
            .ToListAsync(cancellationToken);
        foreach (var user in users)
        {
            if (applicantRole is not null)
                _db.UserRoles.RemoveRange(user.UserRoles.Where(r => r.RoleId == applicantRole.SystemRoleId));
            if (memberRole is not null && user.UserRoles.All(r => r.RoleId != memberRole.SystemRoleId))
            {
                _db.UserRoles.Add(new UserRole
                {
                    UserAccountId = user.UserAccountId,
                    RoleId = memberRole.SystemRoleId,
                    AssignedDate = dateElected,
                    CreatedAt = now,
                    CreatedByUserId = actorUserId
                });
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        _db.MemberStatusHistories.Add(new MemberStatusHistory
        {
            AccountId = account.AccountId,
            ToStatusId = activeStatus.MemberStatusId,
            EffectiveDate = dateElected,
            Reason = $"Chairman election — {membershipType.Name} · {membershipNo}",
            ReferenceType = "ELECTION",
            ChangedByUserId = actorUserId,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);
        account.Profile = application.Applicant;
        account.MembershipType = membershipType;
        account.CurrentMemberStatus = activeStatus;
        return Map(account, 0);
    }

    public static string NormalizeElectedType(string? raw)
    {
        var value = (raw ?? "").Trim().ToUpperInvariant().Replace(" ", "_");
        return value switch
        {
            "FULL" or "ORDINARY" => "FULL",
            "COUNTRY" => "COUNTRY",
            "OVERSEAS" or "FOREIGN" => "OVERSEAS",
            _ => throw new InvalidOperationException("Elected membership type must be Full, Country or Overseas.")
        };
    }

    private async Task<MemberStatus> RequireStatus(string code, CancellationToken cancellationToken) =>
        await _db.MemberStatuses.FirstOrDefaultAsync(x => x.Code == code, cancellationToken)
        ?? throw new InvalidOperationException($"Member status '{code}' is missing. Run the seed script.");

    private static MemberListItemDto Map(MAccount a, decimal arrears)
    {
        var live = a.IsActive && (a.CurrentMemberStatus?.IsActiveStatus ?? false);
        var statusName = (a.CurrentMemberStatus?.Name ?? "").Trim();
        if (!live && (string.IsNullOrWhiteSpace(statusName)
                      || statusName.Equals("Active", StringComparison.OrdinalIgnoreCase)))
            statusName = "Inactive";
        else if (string.IsNullOrWhiteSpace(statusName))
            statusName = live ? "Active" : "Inactive";

        return new(
            a.AccountId,
            a.ProfileId,
            a.MembershipNo ?? "",
            string.Join(" ", new[] { a.Profile.Title, a.Profile.FirstName, a.Profile.MiddleName, a.Profile.LastName }.Where(v => !string.IsNullOrWhiteSpace(v))),
            a.MembershipTypeId,
            a.MembershipType.Name,
            statusName,
            a.JoinedDate ?? a.StartDate,
            a.MembershipType.CanVote,
            a.MembershipType.CanRunForOffice,
            a.MembershipType.ReciprocationAllowed,
            a.MembershipType.CanIntroduceGuests,
            a.MembershipType.IsPermanent,
            arrears);
    }
}
