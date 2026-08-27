using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Settings;
using ClubManagement.Entities.Subscriptions;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Data;

public static class DevelopmentSeeder
{
    public static async Task SeedAsync(ApplicationModuleDbContext db)
    {
        await EnsureRole(db, "ADMIN", "Admin", 5);
        await EnsureRole(db, "APPLICANT", "Applicant", 10);
        await EnsureRole(db, "MEMBER", "Member", 20);
        await EnsureRole(db, "GENERAL_MANAGER", "General Manager", 30);
        await EnsureRole(db, "TREASURER", "Treasurer", 40);
        await EnsureRole(db, "COMMITTEE_MEMBER", "Committee Member", 50);
        await EnsureRole(db, "CHAIRMAN", "Chairman", 60);
        await EnsureRole(db, "RECEPTIONIST", "Receptionist", 70);

        await EnsureSetting(db, "MAX_VOTING_MEMBERS", "700");
        await EnsureSetting(db, "MAX_ACTIVE_GUESTS", "6");
        await EnsureSetting(db, "MAX_GUEST_INTRODUCTIONS_PER_MONTH", "2");
        await EnsureSetting(db, "MAX_GUEST_INTRODUCTIONS_PER_YEAR", "12");
        await EnsureSetting(db, "MAX_RECIPROCAL_DAYS_PER_12MO", "30");
        await EnsureSetting(db, "PROPOSER_SECONDER_MIN_YEARS", "3");
        await EnsureSetting(db, "MIN_VISITS_BEFORE_APPLICATION", "3");
        await EnsureSetting(db, "MIN_COMMITTEE_SIGNATURES", "4");
        await EnsureSetting(db, "BALLOT_ADVERSE_VOTE_LIMIT", "2");
        await EnsureSetting(db, "GENERAL_MEETING_QUORUM", "20");

        await EnsureLookup(db.MemberStatuses, "ACTIVE", "Active", true, false);
        await EnsureLookup(db.MemberStatuses, "TEMPORARY", "Temporary", true, false);
        await EnsureLookup(db.MemberStatuses, "INACTIVE", "Inactive", false, false);
        await EnsureLookup(db.MemberStatuses, "POSTED", "Posted", false, false);
        await EnsureLookup(db.MemberStatuses, "REMOVED", "Removed", false, true);
        await EnsureLookup(db.MemberStatuses, "PAID", "Paid", true, false);
        await EnsureLookup(db.MemberStatuses, "DUE", "Due", true, false);

        await EnsurePayment(db, db.PaymentMethods, "CASH", "Cash");
        await EnsurePayment(db, db.PaymentMethods, "CHEQUE", "Cheque");
        await EnsurePayment(db, db.PaymentMethods, "MPESA", "M-Pesa");
        await EnsurePayment(db, db.PaymentMethods, "BANK_TRANSFER", "Bank transfer");
        await EnsurePayment(db, db.PaymentMethods, "CARD", "Card");

        await EnsurePayment(db, db.PaymentStatuses, "PENDING", "Pending");
        await EnsurePayment(db, db.PaymentStatuses, "PAID", "Paid");
        await EnsurePayment(db, db.PaymentStatuses, "PARTIALLY_PAID", "Partially paid");
        await EnsurePayment(db, db.PaymentStatuses, "OVERDUE", "Overdue");
        await EnsurePayment(db, db.PaymentStatuses, "WAIVED", "Waived");
        await EnsurePayment(db, db.PaymentStatuses, "REFUNDED", "Refunded");

        await EnsureFeeType(db, "JOINING", "Joining fee");
        await EnsureFeeType(db, "ANNUAL", "Annual subscription");

        await EnsureGuestStatus(db, "ACTIVE", "Active");
        await EnsureGuestStatus(db, "BARRED", "Barred");

        foreach (var (code, joining, under30, annual) in new (string, decimal, decimal, decimal)[]
        {
            ("FULL", 250000, 125000, 39500),
            ("COUNTRY", 250000, 125000, 31200),
            ("OVERSEAS", 250000, 125000, 20300),
        })
        {
            var type = await db.MembershipTypes.FirstOrDefaultAsync(x => x.Code == code);
            if (type is null) continue;
            if (!await db.MembershipFeeSchedules.AnyAsync(x => x.MembershipTypeId == type.MembershipTypeId))
            {
                db.MembershipFeeSchedules.Add(new MembershipFeeSchedule
                {
                    MembershipTypeId = type.MembershipTypeId,
                    JoiningFee = joining,
                    JoiningFeeUnder30 = under30,
                    AnnualSubscription = annual,
                    EffectiveDate = new DateOnly(2025, 1, 1),
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        if (!await db.UserAccounts.AnyAsync(x => x.Username == "gm"))
        {
            var profile = new MProfile
            {
                Title = "Mr",
                FirstName = "Peter",
                LastName = "Irungu",
                Email = "membershipdesk@aeroclubea.com",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            db.Profiles.Add(profile);
            await db.SaveChangesAsync();

            var user = new UserAccount
            {
                ProfileId = profile.ProfileId,
                Username = "gm",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Acea@2026"),
                IsActive = true,
                AccountStatus = "ACTIVE",
                MustChangePassword = false,
                EmailVerifiedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };
            db.UserAccounts.Add(user);
            await db.SaveChangesAsync();

            var gmRole = await db.SystemRoles.FirstAsync(x => x.Code == "GENERAL_MANAGER");
            db.UserRoles.Add(new UserRole
            {
                UserAccountId = user.UserAccountId,
                RoleId = gmRole.SystemRoleId,
                AssignedDate = DateOnly.FromDateTime(DateTime.UtcNow),
                CreatedAt = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync();
    }

    private static async Task EnsureRole(ApplicationModuleDbContext db, string code, string name, int sort)
    {
        if (await db.SystemRoles.AnyAsync(x => x.Code == code)) return;
        db.SystemRoles.Add(new SystemRole { Code = code, Name = name, SortOrder = sort, IsActive = true, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
    }

    private static async Task EnsureSetting(ApplicationModuleDbContext db, string key, string value)
    {
        if (await db.ClubSettings.AnyAsync(x => x.SettingKey == key)) return;
        db.ClubSettings.Add(new ClubSetting
        {
            SettingKey = key,
            SettingValue = value,
            EffectiveDate = new DateOnly(2023, 10, 8),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            Description = "Seeded from ACEA bye-laws / articles"
        });
    }

    private static async Task EnsureLookup(DbSet<MemberStatus> set, string code, string name, bool activeStatus, bool terminal)
    {
        if (await set.AnyAsync(x => x.Code == code)) return;
        set.Add(new MemberStatus
        {
            Code = code,
            Name = name,
            SortOrder = 10,
            IsActive = true,
            IsActiveStatus = activeStatus,
            IsTerminal = terminal,
            CreatedAt = DateTime.UtcNow
        });
    }

    private static async Task EnsurePayment(ApplicationModuleDbContext db, DbSet<PaymentMethod> set, string code, string name)
    {
        if (await set.AnyAsync(x => x.Code == code)) return;
        set.Add(new PaymentMethod { Code = code, Name = name, SortOrder = 10, IsActive = true, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
    }

    private static async Task EnsurePayment(ApplicationModuleDbContext db, DbSet<PaymentStatus> set, string code, string name)
    {
        if (await set.AnyAsync(x => x.Code == code)) return;
        set.Add(new PaymentStatus { Code = code, Name = name, SortOrder = 10, IsActive = true, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
    }

    private static async Task EnsureFeeType(ApplicationModuleDbContext db, string code, string name)
    {
        if (await db.FeeTypes.AnyAsync(x => x.Code == code)) return;
        db.FeeTypes.Add(new FeeType { Code = code, Name = name, SortOrder = 10, IsActive = true, CreatedAt = DateTime.UtcNow });
    }

    private static async Task EnsureGuestStatus(ApplicationModuleDbContext db, string code, string name)
    {
        if (await db.GuestStatuses.AnyAsync(x => x.Code == code)) return;
        db.GuestStatuses.Add(new GuestStatus { Code = code, Name = name, SortOrder = 10, IsActive = true, CreatedAt = DateTime.UtcNow });
    }
}
