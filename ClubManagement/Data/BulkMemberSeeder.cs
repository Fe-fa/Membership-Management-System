using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Subscriptions;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Data;

public static class BulkMemberSeeder
{
    public const int TargetCount = 700;
    public const string EmailPrefix = "seed700.";
    public const string SharedPassword = "AceaMember@2026";
    private const string Marker = "Bulk volume seed (700)";

    /// <summary>FULL 60%, COUNTRY 13%, OVERSEAS 10%, SENIOR 6%, LIFE 4%, HONORARY 3%, TEMPORARY 3%, SENIOR_LIFE 1%.</summary>
    private static readonly (string Code, int Count)[] TypeMix =
    [
        ("FULL", 420),
        ("COUNTRY", 90),
        ("OVERSEAS", 70),
        ("SENIOR", 40),
        ("LIFE", 25),
        ("HONORARY", 20),
        ("TEMPORARY", 20),
        ("SENIOR_LIFE", 15),
    ];

    private static readonly string[] MaleFirst =
    [
        "James", "Peter", "David", "John", "Samuel", "Daniel", "Michael", "Joseph", "Patrick", "Brian",
        "Kevin", "Eric", "George", "Francis", "Charles", "Anthony", "Stephen", "Paul", "Robert", "Simon",
        "Mwangi", "Otieno", "Kipchoge", "Kariuki", "Njoroge", "Omondi", "Mutua", "Kiprop", "Wekesa", "Barasa",
    ];

    private static readonly string[] FemaleFirst =
    [
        "Mary", "Jane", "Grace", "Faith", "Ann", "Lucy", "Susan", "Catherine", "Elizabeth", "Margaret",
        "Wanjiku", "Akinyi", "Chebet", "Njeri", "Achieng", "Wambui", "Atieno", "Chepkoech", "Nyambura", "Muthoni",
        "Irene", "Patricia", "Helen", "Rose", "Joyce", "Mercy", "Lydia", "Naomi", "Esther", "Caroline",
    ];

    private static readonly string[] LastNames =
    [
        "Kamau", "Ochieng", "Kipchoge", "Wanjiru", "Mutiso", "Odhiambo", "Kariuki", "Cheruiyot", "Njoroge", "Otieno",
        "Mwangi", "Wekesa", "Kiptoo", "Auma", "Kimani", "Omondi", "Chepkwony", "Maina", "Barasa", "Nyambura",
        "Koech", "Wafula", "Muthoni", "Kilonzo", "Owino", "Ruto", "Gichuru", "Langat", "Mburu", "Okello",
        "Irungu", "Ndegwa", "Korir", "Wambua", "Onyango", "Cherono", "Gitonga", "Makau", "Sifuna", "Too",
    ];

    private static readonly string[] Occupations =
    [
        "Airline captain", "First officer", "Aircraft engineer", "Aviation consultant", "Lawyer",
        "Surgeon", "Banker", "Civil engineer", "Agronomist", "IT director", "Chartered accountant",
        "University lecturer", "Diplomat", "Tour operator", "Architect", "Pharmacist",
    ];

    private static readonly string[] Companies =
    [
        "Kenya Airways", "Safaricom", "Equity Bank", "KCB Group", "Nation Media", "East African Breweries",
        "Bamburi Cement", "NCBA", "Britam", "Wilson Airport Operators", "Kenya Civil Aviation Authority",
        "PWC Kenya", "Deloitte East Africa", "Strathmore University", "Ministry of Transport",
    ];

    private static readonly string[] Cities =
        ["Nairobi", "Nakuru", "Mombasa", "Kisumu", "Eldoret", "Nyeri", "Kericho", "Machakos", "Thika", "Malindi"];

    public static async Task<BulkMemberSeedResult> SeedAsync(
        ApplicationModuleDbContext db,
        CancellationToken cancellationToken = default,
        bool allowTopUp = false)
    {
        var existing = await db.Profiles.IgnoreQueryFilters()
            .CountAsync(p => p.Email != null && p.Email.StartsWith(EmailPrefix), cancellationToken);
        if (existing >= TargetCount)
            return new BulkMemberSeedResult(0, existing, "Already at 700 seeded members — nothing inserted.");
        // Restarts must not keep inserting 1–N demo members (that inflates Finance “Members with revenue”).
        if (existing > 0 && !allowTopUp)
            return new BulkMemberSeedResult(
                0,
                existing,
                $"Demo seed already present ({existing} members). Startup will not add more. Set Seed:BulkMembers=true to fill to {TargetCount}.");

        var tenant = await db.Tenants.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Code == "ACEA", cancellationToken)
            ?? await db.Tenants.IgnoreQueryFilters().OrderBy(t => t.TenantId).FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No tenant row found. Start the API once so ACEA can seed.");
        var tenantId = tenant.TenantId;

        var types = await db.MembershipTypes.IgnoreQueryFilters()
            .Where(t => t.TenantId == tenantId && t.IsActive)
            .ToListAsync(cancellationToken);
        if (types.Count == 0)
            throw new InvalidOperationException("No membership types found for tenant ACEA.");

        var electionType = await db.ElectionTypes.AsNoTracking()
            .Where(t => t.IsActive)
            .OrderBy(t => t.SortOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No election type is configured.");

        var statuses = await db.MemberStatuses.ToListAsync(cancellationToken);
        var active = RequireStatus(statuses, "ACTIVE");
        var posted = statuses.FirstOrDefault(s => s.Code == "POSTED") ?? active;
        var unpaid = statuses.FirstOrDefault(s => s.Code == "UNPAID") ?? active;
        var inactive = statuses.FirstOrDefault(s => s.Code == "INACTIVE") ?? active;
        var paidSub = statuses.FirstOrDefault(s => s.Code == "PAID") ?? active;
        var dueSub = statuses.FirstOrDefault(s => s.Code == "DUE") ?? unpaid;

        var memberRole = await db.SystemRoles.FirstOrDefaultAsync(r => r.Code == "MEMBER", cancellationToken)
            ?? throw new InvalidOperationException("MEMBER role is missing.");

        var genders = await db.Genders.AsNoTracking().Where(g => g.IsActive).ToListAsync(cancellationToken);
        var maleGender = genders.FirstOrDefault(g => g.Code is "M" or "MALE") ?? genders.FirstOrDefault();
        var femaleGender = genders.FirstOrDefault(g => g.Code is "F" or "FEMALE") ?? maleGender;

        var marital = await db.MaritalStatuses.AsNoTracking().Where(m => m.IsActive).ToListAsync(cancellationToken);
        var kenya = await db.Countries.AsNoTracking()
            .FirstOrDefaultAsync(c => c.CountryCode == "KE" || c.CountryName == "Kenya", cancellationToken);

        var schedules = await db.MembershipFeeSchedules.AsNoTracking()
            .Where(s => s.IsActive)
            .ToListAsync(cancellationToken);

        var votingCapSetting = await db.ClubSettings.AsNoTracking()
            .Where(s => s.SettingKey == "MAX_VOTING_MEMBERS" && s.IsActive)
            .Select(s => s.SettingValue)
            .FirstOrDefaultAsync(cancellationToken);
        var votingCap = int.TryParse(votingCapSetting, out var cap) ? cap : 700;
        var votingNow = await db.Accounts.IgnoreQueryFilters()
            .CountAsync(a =>
                a.TenantId == tenantId
                && a.IsActive
                && !a.IsDeleted
                && a.MembershipType.CanVote
                && a.CurrentMemberStatus.IsActiveStatus,
                cancellationToken);

        var usedNos = (await db.Accounts.IgnoreQueryFilters()
                .Where(a => a.TenantId == tenantId && a.MembershipNo != null)
                .Select(a => a.MembershipNo!)
                .ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var usedEmails = (await db.Profiles.IgnoreQueryFilters()
                .Where(p => p.TenantId == tenantId && p.Email != null)
                .Select(p => p.Email!)
                .ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var seq = 1;
        while (usedNos.Contains($"AC-{seq:D4}")) seq++;

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(SharedPassword);
        var rng = new Random(7002026);
        var year = DateTime.UtcNow.Year;
        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);

        var plan = BuildPlan(types, TypeMix, TargetCount - existing, votingNow, votingCap);
        var created = 0;

        foreach (var chunk in plan.Chunk(50))
        {
            var batch = new List<(MProfile Profile, string TypeCode, DateOnly Joined, DateOnly Dob, bool Female, decimal? Entrance, bool Waive)>(chunk.Length);
            foreach (var type in chunk)
            {
                var female = rng.NextDouble() < 0.42;
                var first = Pick(rng, female ? FemaleFirst : MaleFirst);
                var last = Pick(rng, LastNames);
                var joined = RandomJoined(rng, type.Code, today);
                var dob = RandomDob(rng, type.Code, joined, today);
                var age = YearsBetween(dob, today);
                var schedule = schedules
                    .Where(s => s.MembershipTypeId == type.MembershipTypeId && s.EffectiveDate <= joined)
                    .OrderByDescending(s => s.EffectiveDate)
                    .FirstOrDefault();
                var waive = type.Code is "LIFE" or "HONORARY" or "SENIOR_LIFE";
                decimal? entrance = waive || schedule is null
                    ? (waive ? 0 : null)
                    : age < 30 ? schedule.JoiningFeeUnder30 : schedule.JoiningFee;

                string membershipNo;
                do
                {
                    membershipNo = $"AC-{seq:D4}";
                    seq++;
                } while (!usedNos.Add(membershipNo));

                var email = $"{EmailPrefix}{membershipNo.ToLowerInvariant().Replace("-", "")}@aeroclubea.test";
                while (!usedEmails.Add(email))
                    email = $"{EmailPrefix}{membershipNo.ToLowerInvariant()}.{rng.Next(100, 999)}@aeroclubea.test";

                var city = Pick(rng, Cities);
                var profile = new MProfile
                {
                    TenantId = tenantId,
                    MembershipNo = membershipNo,
                    Title = female ? (rng.NextDouble() < 0.15 ? "Dr" : rng.NextDouble() < 0.5 ? "Ms" : "Mrs") : (rng.NextDouble() < 0.08 ? "Capt" : rng.NextDouble() < 0.12 ? "Dr" : "Mr"),
                    FirstName = first,
                    MiddleName = rng.NextDouble() < 0.35 ? Pick(rng, female ? FemaleFirst : MaleFirst) : null,
                    LastName = last,
                    GenderId = (female ? femaleGender : maleGender)?.GenderId,
                    MaritalStatusId = marital.Count == 0 ? null : marital[rng.Next(marital.Count)].MaritalStatusId,
                    DateOfBirth = dob,
                    PlaceOfBirth = city,
                    NationalityId = kenya?.CountryId,
                    CountryOfResidenceId = kenya?.CountryId,
                    CountryId = kenya?.CountryId,
                    IdPassportNo = rng.Next(10_000_000, 39_999_999).ToString(),
                    Occupation = Pick(rng, Occupations),
                    Company = Pick(rng, Companies),
                    Role = rng.NextDouble() < 0.3 ? "Director" : "Member",
                    PostalAddress = $"P.O. Box {rng.Next(100, 99999)}",
                    City = city,
                    StateCountry = "Kenya",
                    PostalCode = rng.Next(100, 99999).ToString(),
                    Email = email,
                    TelIntlPrefix = "+254",
                    Mobile = $"7{rng.Next(10_000_000, 99_999_999)}",
                    DataConsentGiven = true,
                    PrivacyPolicyAcceptedAt = now.AddDays(-rng.Next(10, 800)),
                    IsActive = true,
                    CreatedAt = now,
                };
                db.Profiles.Add(profile);
                batch.Add((profile, type.Code, joined, dob, female, entrance, waive));
            }

            await db.SaveChangesAsync(cancellationToken);

            foreach (var row in batch)
            {
                var roll = rng.NextDouble();
                var status = roll < 0.88 ? active : roll < 0.94 ? unpaid : roll < 0.98 ? posted : inactive;
                var account = new MAccount
                {
                    TenantId = tenantId,
                    ProfileId = row.Profile.ProfileId,
                    MembershipTypeId = types.First(t => t.Code == row.TypeCode).MembershipTypeId,
                    ElectionTypeId = electionType.ElectionTypeId,
                    MembershipNo = row.Profile.MembershipNo,
                    CurrentMemberStatusId = status.MemberStatusId,
                    JoinedDate = row.Joined,
                    StartDate = row.Joined,
                    EntranceFeeAmount = row.Entrance,
                    EntranceFeeWaivedFlag = row.Waive,
                    IsActive = status.IsActiveStatus && !status.IsTerminal,
                    CreatedAt = now,
                };
                db.Accounts.Add(account);
            }

            await db.SaveChangesAsync(cancellationToken);

            var profileIds = batch.Select(b => b.Profile.ProfileId).ToList();
            var accountByProfile = await db.Accounts.IgnoreQueryFilters()
                .Where(a => a.TenantId == tenantId && profileIds.Contains(a.ProfileId))
                .ToDictionaryAsync(a => a.ProfileId, cancellationToken);

            foreach (var row in batch)
            {
                if (!accountByProfile.TryGetValue(row.Profile.ProfileId, out var account)) continue;

                db.MemberStatusHistories.Add(new MemberStatusHistory
                {
                    AccountId = account.AccountId,
                    ToStatusId = account.CurrentMemberStatusId,
                    EffectiveDate = row.Joined,
                    Reason = Marker,
                    ReferenceType = "OTHER",
                    CreatedAt = now,
                });

                var user = new UserAccount
                {
                    TenantId = tenantId,
                    ProfileId = row.Profile.ProfileId,
                    Username = account.MembershipNo!,
                    PasswordHash = passwordHash,
                    IsActive = account.IsActive,
                    AccountStatus = account.IsActive ? "ACTIVE" : "INACTIVE",
                    MustChangePassword = false,
                    EmailVerifiedAt = now,
                    CreatedAt = now,
                };
                db.UserAccounts.Add(user);
            }

            await db.SaveChangesAsync(cancellationToken);

            var users = await db.UserAccounts.IgnoreQueryFilters()
                .Where(u => u.TenantId == tenantId && profileIds.Contains(u.ProfileId))
                .ToListAsync(cancellationToken);
            foreach (var user in users)
            {
                db.UserRoles.Add(new UserRole
                {
                    UserAccountId = user.UserAccountId,
                    RoleId = memberRole.SystemRoleId,
                    AssignedDate = today,
                    CreatedAt = now,
                });
            }

            foreach (var row in batch)
            {
                if (!accountByProfile.TryGetValue(row.Profile.ProfileId, out var account)) continue;
                var type = types.First(t => t.Code == row.TypeCode);
                if (!type.CanAccessSubscriptions || row.TypeCode is "LIFE" or "HONORARY") continue;

                var schedule = schedules
                    .Where(s => s.MembershipTypeId == type.MembershipTypeId)
                    .OrderByDescending(s => s.EffectiveDate)
                    .FirstOrDefault();
                var due = schedule?.AnnualSubscription ?? 0m;
                if (row.TypeCode == "SENIOR") due = Math.Round(due * 0.5m, 2, MidpointRounding.AwayFromZero);
                if (due <= 0) continue;

                var roll = rng.NextDouble();
                decimal paid;
                long subStatusId;
                if (roll < 0.72)
                {
                    paid = due;
                    subStatusId = paidSub.MemberStatusId;
                }
                else if (roll < 0.85)
                {
                    paid = Math.Round(due * (decimal)(0.25 + rng.NextDouble() * 0.5), 2);
                    subStatusId = dueSub.MemberStatusId;
                }
                else
                {
                    paid = 0;
                    subStatusId = dueSub.MemberStatusId;
                }

                var sub = new Subscription
                {
                    AccountId = account.AccountId,
                    SubscriptionYear = year,
                    AmountDue = due,
                    AmountPaid = paid,
                    ArrearsAmount = Math.Max(0, due - paid),
                    DueDate = new DateOnly(year, 1, 1),
                    SubscriptionStatusId = subStatusId,
                    CreatedAt = now,
                };
                db.Subscriptions.Add(sub);
            }

            await db.SaveChangesAsync(cancellationToken);

            var batchAccountIds = accountByProfile.Values.Select(a => a.AccountId).ToList();
            var unpaidSubs = await db.Subscriptions
                .Where(s =>
                    batchAccountIds.Contains(s.AccountId)
                    && s.SubscriptionYear == year
                    && s.ArrearsAmount > 0)
                .ToListAsync(cancellationToken);
            foreach (var sub in unpaidSubs)
            {
                db.Arrearses.Add(new Arrears
                {
                    AccountId = sub.AccountId,
                    SubscriptionId = sub.SubscriptionId,
                    OpenedDate = new DateOnly(year, 1, 1),
                    Amount = sub.ArrearsAmount,
                    Status = "OPEN",
                    CreatedAt = now,
                });
            }

            await db.SaveChangesAsync(cancellationToken);
            created += batch.Count;
        }

        var total = existing + created;
        return new BulkMemberSeedResult(created, total, $"Inserted {created} members ({total} seeded of {TargetCount}).");
    }

    private static List<MembershipType> BuildPlan(
        List<MembershipType> types,
        (string Code, int Count)[] mix,
        int needed,
        int votingNow,
        int votingCap)
    {
        var byCode = types.ToDictionary(t => t.Code, StringComparer.OrdinalIgnoreCase);
        var fallback = types.FirstOrDefault(t => t.Code == "OVERSEAS")
            ?? types.FirstOrDefault(t => !t.CanVote)
            ?? types.First();
        var plan = new List<MembershipType>(needed);
        var votingBudget = Math.Max(0, votingCap - votingNow);

        foreach (var (code, count) in mix)
        {
            if (!byCode.TryGetValue(code, out var type)) continue;
            var take = Math.Min(count, needed - plan.Count);
            for (var i = 0; i < take; i++)
            {
                if (type.CanVote && votingBudget <= 0)
                    plan.Add(fallback);
                else
                {
                    plan.Add(type);
                    if (type.CanVote) votingBudget--;
                }
            }
            if (plan.Count >= needed) break;
        }

        while (plan.Count < needed)
            plan.Add(fallback);
        return plan;
    }

    private static MemberStatus RequireStatus(List<MemberStatus> statuses, string code) =>
        statuses.FirstOrDefault(s => s.Code == code)
        ?? throw new InvalidOperationException($"Member status {code} is missing. Start the API so DevelopmentSeeder can run.");

    private static DateOnly RandomJoined(Random rng, string typeCode, DateOnly today)
    {
        var minYears = typeCode is "SENIOR" or "SENIOR_LIFE" ? 25 : typeCode == "LIFE" ? 15 : 1;
        var maxYears = typeCode is "SENIOR" or "SENIOR_LIFE" ? 45 : 28;
        var years = rng.Next(minYears, maxYears + 1);
        var day = rng.Next(1, 28);
        var month = rng.Next(1, 13);
        var year = Math.Max(1975, today.Year - years);
        return new DateOnly(year, month, day);
    }

    private static DateOnly RandomDob(Random rng, string typeCode, DateOnly joined, DateOnly today)
    {
        if (typeCode is "SENIOR" or "SENIOR_LIFE")
        {
            var age = rng.Next(55, 78);
            return today.AddYears(-age).AddDays(-rng.Next(0, 300));
        }
        var joinAge = rng.Next(22, 48);
        return joined.AddYears(-joinAge).AddDays(-rng.Next(0, 300));
    }

    private static int YearsBetween(DateOnly from, DateOnly to)
    {
        var years = to.Year - from.Year;
        if (to < from.AddYears(years)) years--;
        return years;
    }

    private static string Pick(Random rng, string[] values) => values[rng.Next(values.Length)];
}

public readonly record struct BulkMemberSeedResult(int Inserted, int SeededTotal, string Message);
