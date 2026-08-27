using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Settings;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.MembershipAccount;

public interface IMemberAccountProvisioner
{
    Task EnsureForMemberRoleAsync(long profileId, long? actorUserId, CancellationToken cancellationToken);
    Task EnsureAccountWithMembershipNoAsync(long profileId, string membershipNo, long? actorUserId, CancellationToken cancellationToken);
}

public class MemberAccountProvisioner : IMemberAccountProvisioner
{
    private readonly ApplicationModuleDbContext _db;

    public MemberAccountProvisioner(ApplicationModuleDbContext db) => _db = db;

    public async Task EnsureForMemberRoleAsync(long profileId, long? actorUserId, CancellationToken cancellationToken)
    {
        if (await _db.Accounts.AnyAsync(a => a.ProfileId == profileId && !a.IsDeleted, cancellationToken))
            return;

        var isMember = await _db.UserAccounts.AnyAsync(
            u => u.ProfileId == profileId && u.UserRoles.Any(r => r.Role.Code == "MEMBER"),
            cancellationToken);
        if (!isMember) return;

        var membershipNo = await NextMembershipNoAsync(cancellationToken);
        await CreateAccountAsync(profileId, membershipNo, actorUserId, "Portal Member role — membership record created", cancellationToken);
    }

    public async Task EnsureAccountWithMembershipNoAsync(
        long profileId,
        string membershipNo,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var no = membershipNo.Trim();
        if (string.IsNullOrWhiteSpace(no))
            throw new InvalidOperationException("Membership number is required for this role.");

        var existingByNo = await _db.Accounts
            .FirstOrDefaultAsync(a => a.MembershipNo == no && !a.IsDeleted, cancellationToken);
        if (existingByNo is not null && existingByNo.ProfileId != profileId)
            throw new InvalidOperationException($"Membership number {no} is already assigned to another member.");

        var existingForProfile = await _db.Accounts
            .FirstOrDefaultAsync(a => a.ProfileId == profileId && !a.IsDeleted, cancellationToken);
        if (existingForProfile is not null)
        {
            if (!string.Equals(existingForProfile.MembershipNo, no, StringComparison.OrdinalIgnoreCase))
            {
                var taken = await _db.Accounts.AnyAsync(
                    a => a.MembershipNo == no && a.AccountId != existingForProfile.AccountId && !a.IsDeleted,
                    cancellationToken);
                if (taken)
                    throw new InvalidOperationException($"Membership number {no} is already assigned to another member.");
                existingForProfile.MembershipNo = no;
                var profile = await _db.Profiles.FirstAsync(p => p.ProfileId == profileId, cancellationToken);
                profile.MembershipNo = no;
                profile.UpdatedByUserId = actorUserId;
                await _db.SaveChangesAsync(cancellationToken);
            }
            return;
        }

        if (existingByNo is not null)
            return;

        await CreateAccountAsync(profileId, no, actorUserId, "User management — membership linked on account create", cancellationToken);
    }

    private async Task CreateAccountAsync(
        long profileId,
        string membershipNo,
        long? actorUserId,
        string reason,
        CancellationToken cancellationToken)
    {
        var membershipType = await _db.MembershipTypes.AsNoTracking()
            .FirstOrDefaultAsync(t => t.IsActive && t.Code == "FULL", cancellationToken)
            ?? await _db.MembershipTypes.AsNoTracking().Where(t => t.IsActive).OrderBy(t => t.SortOrder).FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No membership type is configured.");
        var electionType = await _db.ElectionTypes.AsNoTracking()
            .FirstOrDefaultAsync(t => t.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("No election type is configured.");
        var activeStatus = await _db.MemberStatuses.FirstOrDefaultAsync(s => s.Code == "ACTIVE", cancellationToken)
            ?? throw new InvalidOperationException("Member status ACTIVE is missing. Restart the API so statuses can seed.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var now = DateTime.UtcNow;
        var account = new MAccount
        {
            ProfileId = profileId,
            MembershipTypeId = membershipType.MembershipTypeId,
            ElectionTypeId = electionType.ElectionTypeId,
            MembershipNo = membershipNo,
            CurrentMemberStatusId = activeStatus.MemberStatusId,
            JoinedDate = today,
            StartDate = today,
            IsActive = true,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.Accounts.Add(account);

        var profile = await _db.Profiles.FirstAsync(p => p.ProfileId == profileId, cancellationToken);
        profile.MembershipNo = membershipNo;
        profile.UpdatedByUserId = actorUserId;

        await _db.SaveChangesAsync(cancellationToken);

        _db.MemberStatusHistories.Add(new MemberStatusHistory
        {
            AccountId = account.AccountId,
            ToStatusId = activeStatus.MemberStatusId,
            EffectiveDate = today,
            Reason = reason,
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
            NewValues = membershipNo,
            ChangedByUserId = actorUserId,
            ChangedAt = now
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<string> NextMembershipNoAsync(CancellationToken cancellationToken)
    {
        var seq = await _db.Accounts.CountAsync(cancellationToken) + 1;
        var membershipNo = $"AC-{seq:D4}";
        while (await _db.Accounts.AnyAsync(a => a.MembershipNo == membershipNo, cancellationToken))
        {
            seq++;
            membershipNo = $"AC-{seq:D4}";
        }
        return membershipNo;
    }
}
