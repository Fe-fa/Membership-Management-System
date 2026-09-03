using System.Security.Cryptography;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Common;
using ClubManagement.Entities;
using ClubManagement.Entities.Guests;
using Microsoft.EntityFrameworkCore;
using ClubManagement.Services;

namespace ClubManagement.Services.Guests;

public record GuestVisitRequest(string GuestName, DateOnly VisitDate, TimeOnly? TimeIn, string? GuestBookEntryNo);
public record ReciprocalVisitRequest(long HomeClubId, DateOnly VisitDate, int DaysUsed, string? Notes);
public record VisitRowDto(long VisitId, string GuestName, DateOnly VisitDate, TimeOnly? TimeIn, TimeOnly? TimeOut, bool IsCurrent, string? EntryNo);

public record ReceptionMemberDto(long ProfileId, string MembershipNo, string FullName);
public record GuestLookupDto(
    long GuestId,
    string GuestName,
    string? Phone,
    string? VisitSlipCode,
    long? IntroducedByProfileId,
    string? IntroducedByName,
    int VisitCount,
    int VisitsThisMonth,
    int VisitsThisYear,
    bool IsBarred,
    string? BarredReason,
    bool HasApplicantProfile);
public record UpsertGuestRequest(string GuestName, long IntroducedByProfileId, string? Phone);
public record ReceptionVisitRequest(long GuestId, long AccompanyingProfileId, string GuestBookEntryNo, string? Notes);
public record ReceptionVisitDto(
    long VisitId,
    long GuestId,
    string GuestName,
    string? Phone,
    string? VisitSlipCode,
    int VisitCount,
    DateOnly VisitDate,
    TimeOnly? TimeIn,
    TimeOnly? TimeOut,
    bool IsCurrent,
    string? GuestBookEntryNo,
    long AccompanyingProfileId,
    string AccompanyingMemberName,
    string? IntroducedByName,
    string? StaffName,
    string? Notes);
public record GuestEligibilityRequest(string? GuestName, string? Phone, string? VisitSlipCode);
public record GuestEligibilityDto(
    bool Found,
    bool Ambiguous,
    bool CanRegister,
    int VisitCount,
    int RequiredVisits,
    long? GuestId,
    string? VisitSlipCode,
    string Message,
    IReadOnlyList<GuestLookupDto>? Matches);

public interface IGuestService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<VisitRowDto> SignInGuestAsync(long visitingProfileId, GuestVisitRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task SignOutAsync(long visitId, TimeOnly timeOut, CancellationToken cancellationToken);
    Task<IReadOnlyList<VisitRowDto>> ListCurrentAsync(long visitingProfileId, CancellationToken cancellationToken);
    Task RecordReciprocalAsync(long profileId, ReciprocalVisitRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ReceptionMemberDto>> ListActiveHostsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<GuestLookupDto>> SearchGuestsAsync(string? name, string? phone, string? visitSlipCode, CancellationToken cancellationToken);
    Task<GuestLookupDto> UpsertGuestAsync(UpsertGuestRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ReceptionVisitDto> ReceptionSignInAsync(ReceptionVisitRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ReceptionVisitDto> ReceptionSignOutAsync(long visitId, CancellationToken cancellationToken);
    Task<PagedResult<ReceptionVisitDto>> ListReceptionVisitsAsync(PagedRequest paging, CancellationToken cancellationToken);
    Task<GuestEligibilityDto> CheckRegistrationEligibilityAsync(GuestEligibilityRequest request, CancellationToken cancellationToken);
}

public class GuestService : IGuestService
{
    public const int RequiredVisitsForRegistration = 3;

    private readonly ApplicationModuleDbContext _db;
    private readonly IClubPolicyService _policy;

    public GuestService(ApplicationModuleDbContext db, IClubPolicyService policy)
    {
        _db = db;
        _policy = policy;
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        // Separate batches: SQL Server compiles the whole batch, so CREATE INDEX on a
        // column added in the same batch fails with "Invalid column name" and rolls back the ALTERs.
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.MGuest', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.MGuest', N'phone') IS NULL
    ALTER TABLE dbo.MGuest ADD phone NVARCHAR(40) NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.MGuest', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.MGuest', N'visit_slip_code') IS NULL
    ALTER TABLE dbo.MGuest ADD visit_slip_code NVARCHAR(20) NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.MVisit', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.MVisit', N'notes') IS NULL
    ALTER TABLE dbo.MVisit ADD notes NVARCHAR(500) NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH(N'dbo.MGuest', N'visit_slip_code') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MGuest_visit_slip_code' AND object_id = OBJECT_ID(N'dbo.MGuest'))
    EXEC(N'CREATE UNIQUE INDEX UX_MGuest_visit_slip_code ON dbo.MGuest(visit_slip_code) WHERE visit_slip_code IS NOT NULL');
", cancellationToken);

        if (!await _db.GuestStatuses.AnyAsync(x => x.Code == "BARRED", cancellationToken))
        {
            _db.GuestStatuses.Add(new ClubManagement.Entities.Lookups.GuestStatus
            {
                Code = "BARRED",
                Name = "Barred",
                SortOrder = 20,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<VisitRowDto> SignInGuestAsync(long visitingProfileId, GuestVisitRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        await RequireHostAsync(visitingProfileId, cancellationToken);
        await EnsureActiveGuestCapacityAsync(visitingProfileId, cancellationToken);

        var guest = await _db.Guests.Include(g => g.GuestStatus)
            .FirstOrDefaultAsync(g =>
                g.IntroducedByProfileId == visitingProfileId && g.GuestName == request.GuestName && g.IsActive, cancellationToken);
        if (guest is null)
        {
            guest = await CreateGuestCoreAsync(request.GuestName.Trim(), visitingProfileId, null, actorUserId, cancellationToken);
        }
        else
        {
            RejectIfBarred(guest);
            if (string.IsNullOrWhiteSpace(guest.VisitSlipCode))
            {
                guest.VisitSlipCode = await NextSlipCodeAsync(cancellationToken);
                await _db.SaveChangesAsync(cancellationToken);
            }
        }

        await RejectIfFrequencyExceededAsync(guest.GuestId, request.VisitDate, cancellationToken);

        var visit = new MVisit
        {
            GuestId = guest.GuestId,
            VisitingProfileId = visitingProfileId,
            VisitDate = request.VisitDate,
            TimeIn = request.TimeIn,
            GuestBookEntryNo = request.GuestBookEntryNo,
            IsCurrentFlag = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.Visits.Add(visit);
        await _db.SaveChangesAsync(cancellationToken);
        return new VisitRowDto(visit.VisitId, guest.GuestName, visit.VisitDate, visit.TimeIn, visit.TimeOut, visit.IsCurrentFlag, visit.GuestBookEntryNo);
    }

    public async Task SignOutAsync(long visitId, TimeOnly timeOut, CancellationToken cancellationToken)
    {
        var visit = await _db.Visits.FirstOrDefaultAsync(v => v.VisitId == visitId, cancellationToken)
            ?? throw new InvalidOperationException("Visit not found.");
        visit.TimeOut = timeOut;
        visit.IsCurrentFlag = false;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<VisitRowDto>> ListCurrentAsync(long visitingProfileId, CancellationToken cancellationToken)
    {
        return await _db.Visits.AsNoTracking()
            .Where(v => v.VisitingProfileId == visitingProfileId)
            .Include(v => v.Guest)
            .OrderByDescending(v => v.VisitDate)
            .Take(50)
            .Select(v => new VisitRowDto(v.VisitId, v.Guest.GuestName, v.VisitDate, v.TimeIn, v.TimeOut, v.IsCurrentFlag, v.GuestBookEntryNo))
            .ToListAsync(cancellationToken);
    }

    public async Task RecordReciprocalAsync(long profileId, ReciprocalVisitRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var maxDays = await _policy.GetIntAsync("MAX_RECIPROCAL_DAYS_PER_12MO", 30, cancellationToken);
        var windowStart = request.VisitDate.AddMonths(-12);
        var used = await _db.ReciprocalUsages.Where(x => x.ProfileId == profileId && x.VisitDate >= windowStart)
            .SumAsync(x => (int?)x.DaysUsed, cancellationToken) ?? 0;
        if (used + request.DaysUsed > maxDays)
            throw new InvalidOperationException($"Reciprocal use is limited to {maxDays} days in any 12-month period.");

        _db.ReciprocalUsages.Add(new ReciprocalUsage
        {
            ProfileId = profileId,
            HomeClubId = request.HomeClubId,
            VisitDate = request.VisitDate,
            DaysUsed = request.DaysUsed,
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ReceptionMemberDto>> ListActiveHostsAsync(CancellationToken cancellationToken)
    {
        return await _db.Accounts.AsNoTracking()
            .Where(a => a.IsActive && !a.IsDeleted && a.MembershipType.CanIntroduceGuests && a.CurrentMemberStatus.IsActiveStatus)
            .OrderBy(a => a.Profile.LastName).ThenBy(a => a.Profile.FirstName)
            .Select(a => new ReceptionMemberDto(
                a.ProfileId,
                a.MembershipNo ?? "",
                ((a.Profile.Title ?? "") + " " + a.Profile.FirstName + " " + a.Profile.LastName).Trim()))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<GuestLookupDto>> SearchGuestsAsync(string? name, string? phone, string? visitSlipCode, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var matches = await FindGuestsAsync(name, phone, visitSlipCode, cancellationToken);
        return matches.Select(MapLookup).ToList();
    }

    public async Task<GuestLookupDto> UpsertGuestAsync(UpsertGuestRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var guestName = (request.GuestName ?? "").Trim();
        if (string.IsNullOrWhiteSpace(guestName))
            throw new InvalidOperationException("Guest name is required.");
        if (request.IntroducedByProfileId <= 0)
            throw new InvalidOperationException("Introducing member is required and must be selected from the active member list.");

        await RequireHostAsync(request.IntroducedByProfileId, cancellationToken);

        var existing = await FindGuestsAsync(guestName, request.Phone, null, cancellationToken);
        var exact = existing.FirstOrDefault(g =>
            NamesMatch(g.GuestName, guestName) &&
            (string.IsNullOrWhiteSpace(request.Phone) || PhonesMatch(g.Phone, request.Phone)));
        if (exact is not null)
        {
            RejectIfBarred(exact);
            if (string.IsNullOrWhiteSpace(exact.Phone) && !string.IsNullOrWhiteSpace(request.Phone))
                exact.Phone = request.Phone.Trim();
            if (string.IsNullOrWhiteSpace(exact.VisitSlipCode))
                exact.VisitSlipCode = await NextSlipCodeAsync(cancellationToken);
            exact.UpdatedByUserId = actorUserId;
            await _db.SaveChangesAsync(cancellationToken);
            return MapLookup(await ReloadGuestAsync(exact.GuestId, cancellationToken));
        }

        var created = await CreateGuestCoreAsync(guestName, request.IntroducedByProfileId, request.Phone, actorUserId, cancellationToken);
        return MapLookup(await ReloadGuestAsync(created.GuestId, cancellationToken));
    }

    public async Task<ReceptionVisitDto> ReceptionSignInAsync(ReceptionVisitRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(request.GuestBookEntryNo))
            throw new InvalidOperationException("Guest Book entry number is required.");
        if (request.AccompanyingProfileId <= 0)
            throw new InvalidOperationException("Accompanying member is required. A guest must be accompanied by a member at all times.");

        var guest = await ReloadGuestAsync(request.GuestId, cancellationToken);
        RejectIfBarred(guest);
        if (guest.IntroducedByProfileId is null)
            throw new InvalidOperationException("This guest has no introducing member on record.");

        await RequireHostAsync(request.AccompanyingProfileId, cancellationToken);
        await EnsureActiveGuestCapacityAsync(request.AccompanyingProfileId, cancellationToken);
        if (guest.IntroducedByProfileId != request.AccompanyingProfileId)
            await EnsureActiveGuestCapacityAsync(guest.IntroducedByProfileId.Value, cancellationToken);

        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);
        await RejectIfFrequencyExceededAsync(guest.GuestId, today, cancellationToken);

        var visit = new MVisit
        {
            GuestId = guest.GuestId,
            VisitingProfileId = request.AccompanyingProfileId,
            VisitDate = today,
            TimeIn = TimeOnly.FromDateTime(now),
            GuestBookEntryNo = request.GuestBookEntryNo.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            IsCurrentFlag = true,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.Visits.Add(visit);
        await _db.SaveChangesAsync(cancellationToken);
        return (await MapReceptionVisitAsync(visit.VisitId, cancellationToken))!;
    }

    public async Task<ReceptionVisitDto> ReceptionSignOutAsync(long visitId, CancellationToken cancellationToken)
    {
        var visit = await _db.Visits.FirstOrDefaultAsync(v => v.VisitId == visitId, cancellationToken)
            ?? throw new InvalidOperationException("Visit not found.");
        visit.TimeOut = TimeOnly.FromDateTime(DateTime.UtcNow);
        visit.IsCurrentFlag = false;
        await _db.SaveChangesAsync(cancellationToken);
        return (await MapReceptionVisitAsync(visitId, cancellationToken))!;
    }

    public async Task<PagedResult<ReceptionVisitDto>> ListReceptionVisitsAsync(PagedRequest paging, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        return await _db.Visits.AsNoTracking()
            .OrderByDescending(v => v.IsCurrentFlag)
            .ThenByDescending(v => v.CreatedAt)
            .Select(v => new ReceptionVisitDto(
                v.VisitId,
                v.GuestId,
                v.Guest.GuestName,
                v.Guest.Phone,
                v.Guest.VisitSlipCode,
                _db.Visits.Count(vv => vv.GuestId == v.GuestId),
                v.VisitDate,
                v.TimeIn,
                v.TimeOut,
                v.IsCurrentFlag,
                v.GuestBookEntryNo,
                v.VisitingProfileId,
                v.Visitor.FirstName + " " + v.Visitor.LastName,
                v.Guest.IntroducedBy == null ? null : v.Guest.IntroducedBy.FirstName + " " + v.Guest.IntroducedBy.LastName,
                _db.UserAccounts.Where(u => u.UserAccountId == v.CreatedByUserId)
                    .Select(u => u.Profile.FirstName + " " + u.Profile.LastName)
                    .FirstOrDefault(),
                v.Notes))
            .ToPagedResultAsync(paging, cancellationToken);
    }

    public async Task<GuestEligibilityDto> CheckRegistrationEligibilityAsync(GuestEligibilityRequest request, CancellationToken cancellationToken)
    {
        const string none =
            "We have no record of your visits. Please visit the Aero Club of East Africa and ask reception to introduce and log you as a guest of an existing member before registering an account.";
        var matches = await FindGuestsAsync(request.GuestName, request.Phone, request.VisitSlipCode, cancellationToken);
        if (matches.Count == 0)
            return new GuestEligibilityDto(false, false, false, 0, RequiredVisitsForRegistration, null, null, none, null);
        if (matches.Count > 1 && string.IsNullOrWhiteSpace(request.VisitSlipCode))
        {
            return new GuestEligibilityDto(
                true,
                true,
                false,
                0,
                RequiredVisitsForRegistration,
                null,
                null,
                "More than one guest matches that name or phone. Enter the visit slip code from reception to continue.",
                matches.Select(MapLookup).ToList());
        }

        var guest = matches[0];
        if (IsBarred(guest))
        {
            return new GuestEligibilityDto(
                true,
                false,
                false,
                guest.MVisits.Count,
                RequiredVisitsForRegistration,
                guest.GuestId,
                guest.VisitSlipCode,
                "This guest is barred and may not register or be re-introduced.",
                null);
        }
        var count = guest.MVisits.Count;
        if (count < RequiredVisitsForRegistration)
        {
            return new GuestEligibilityDto(
                true,
                false,
                false,
                count,
                RequiredVisitsForRegistration,
                guest.GuestId,
                guest.VisitSlipCode,
                $"You need to visit the Club at least {RequiredVisitsForRegistration} times before registering. Visits recorded so far: {count}/{RequiredVisitsForRegistration}. Please visit the Club again.",
                null);
        }

        return new GuestEligibilityDto(
            true,
            false,
            true,
            count,
            RequiredVisitsForRegistration,
            guest.GuestId,
            guest.VisitSlipCode,
            "Visit requirement met. Enter your ID / Passport number to create your applicant profile.",
            null);
    }

    private async Task<MGuest> CreateGuestCoreAsync(string guestName, long introducedByProfileId, string? phone, long? actorUserId, CancellationToken cancellationToken)
    {
        var status = await _db.GuestStatuses.FirstOrDefaultAsync(x => x.Code == "ACTIVE", cancellationToken)
            ?? await _db.GuestStatuses.FirstAsync(cancellationToken);
        var guest = new MGuest
        {
            GuestName = guestName,
            Phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim(),
            VisitSlipCode = await NextSlipCodeAsync(cancellationToken),
            IntroducedByProfileId = introducedByProfileId,
            GuestStatusId = status.GuestStatusId,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.Guests.Add(guest);
        await _db.SaveChangesAsync(cancellationToken);
        return guest;
    }

    private async Task<List<MGuest>> FindGuestsAsync(string? name, string? phone, string? visitSlipCode, CancellationToken cancellationToken)
    {
        var query = _db.Guests.AsQueryable()
            .Include(g => g.GuestStatus)
            .Include(g => g.IntroducedBy)
            .Include(g => g.MVisits)
            .Where(g => g.IsActive);

        if (!string.IsNullOrWhiteSpace(visitSlipCode))
        {
            var slip = visitSlipCode.Trim();
            return await query.Where(g => g.VisitSlipCode == slip).ToListAsync(cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(phone))
            return [];

        if (!string.IsNullOrWhiteSpace(name))
        {
            var n = name.Trim();
            query = query.Where(g => g.GuestName.Contains(n));
        }

        var rows = await query.ToListAsync(cancellationToken);
        IEnumerable<MGuest> filtered = rows;
        if (!string.IsNullOrWhiteSpace(name))
            filtered = filtered.Where(g => NamesMatch(g.GuestName, name));
        if (!string.IsNullOrWhiteSpace(phone))
        {
            var withPhone = filtered.Where(g => PhonesMatch(g.Phone, phone)).ToList();
            if (withPhone.Count > 0) return withPhone;
            if (!string.IsNullOrWhiteSpace(name))
                return filtered.ToList();
            return [];
        }
        return filtered.ToList();
    }

    private async Task<MGuest> ReloadGuestAsync(long guestId, CancellationToken cancellationToken) =>
        await _db.Guests
            .Include(g => g.GuestStatus)
            .Include(g => g.IntroducedBy)
            .Include(g => g.MVisits)
            .FirstOrDefaultAsync(g => g.GuestId == guestId, cancellationToken)
        ?? throw new InvalidOperationException("Guest record was not found.");

    private GuestLookupDto MapLookup(MGuest guest)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var yearStart = new DateOnly(today.Year, 1, 1);
        return new(
            guest.GuestId,
            guest.GuestName,
            guest.Phone,
            guest.VisitSlipCode,
            guest.IntroducedByProfileId,
            guest.IntroducedBy is null ? null : $"{guest.IntroducedBy.FirstName} {guest.IntroducedBy.LastName}".Trim(),
            guest.MVisits.Count,
            guest.MVisits.Count(v => v.VisitDate >= monthStart && v.VisitDate < monthStart.AddMonths(1)),
            guest.MVisits.Count(v => v.VisitDate >= yearStart && v.VisitDate < yearStart.AddYears(1)),
            IsBarred(guest),
            guest.BarredReason,
            guest.GuestProfileId is not null);
    }

    private async Task<ReceptionVisitDto?> MapReceptionVisitAsync(long visitId, CancellationToken cancellationToken)
    {
        var result = await _db.Visits.AsNoTracking()
            .Where(v => v.VisitId == visitId)
            .Select(v => new
            {
                v.VisitId,
                v.GuestId,
                v.Guest.GuestName,
                v.Guest.Phone,
                v.Guest.VisitSlipCode,
                v.VisitDate,
                v.TimeIn,
                v.TimeOut,
                v.IsCurrentFlag,
                v.GuestBookEntryNo,
                v.VisitingProfileId,
                VisitorName = v.Visitor.FirstName + " " + v.Visitor.LastName,
                IntroducedByName = v.Guest.IntroducedBy == null
                    ? null
                    : v.Guest.IntroducedBy.FirstName + " " + v.Guest.IntroducedBy.LastName,
                v.CreatedByUserId,
                v.Notes
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (result is null) return null;

        var visitCount = await _db.Visits.AsNoTracking()
            .CountAsync(v => v.GuestId == result.GuestId, cancellationToken);

        string? staffName = null;
        if (result.CreatedByUserId is long staffId)
        {
            staffName = await _db.UserAccounts.AsNoTracking()
                .Where(u => u.UserAccountId == staffId)
                .Select(u => u.Profile.FirstName + " " + u.Profile.LastName)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return new ReceptionVisitDto(
            result.VisitId,
            result.GuestId,
            result.GuestName,
            result.Phone,
            result.VisitSlipCode,
            visitCount,
            result.VisitDate,
            result.TimeIn,
            result.TimeOut,
            result.IsCurrentFlag,
            result.GuestBookEntryNo,
            result.VisitingProfileId,
            result.VisitorName,
            result.IntroducedByName,
            staffName,
            result.Notes);
    }

    private async Task RequireHostAsync(long profileId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.Include(a => a.MembershipType).Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.ProfileId == profileId && a.IsActive && !a.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Active membership was not found for this member.");
        if (!account.MembershipType.CanIntroduceGuests)
            throw new InvalidOperationException("This membership class cannot introduce or accompany guests.");
        if (!account.CurrentMemberStatus.IsActiveStatus)
            throw new InvalidOperationException("Members who are posted or removed cannot introduce or accompany guests.");
    }

    private async Task EnsureActiveGuestCapacityAsync(long profileId, CancellationToken cancellationToken)
    {
        var maxActive = await _policy.GetIntAsync("MAX_ACTIVE_GUESTS", 6, cancellationToken);
        var currentCount = await _db.Visits.CountAsync(v => v.VisitingProfileId == profileId && v.IsCurrentFlag, cancellationToken);
        if (currentCount >= maxActive)
            throw new InvalidOperationException($"A member may have at most {maxActive} guests signed in at once.");
    }

    private async Task RejectIfFrequencyExceededAsync(long guestId, DateOnly visitDate, CancellationToken cancellationToken)
    {
        var maxMonth = await _policy.GetIntAsync("MAX_GUEST_INTRODUCTIONS_PER_MONTH", 2, cancellationToken);
        var maxYear = await _policy.GetIntAsync("MAX_GUEST_INTRODUCTIONS_PER_YEAR", 12, cancellationToken);
        var monthStart = new DateOnly(visitDate.Year, visitDate.Month, 1);
        var monthEnd = monthStart.AddMonths(1);
        var yearStart = new DateOnly(visitDate.Year, 1, 1);
        var monthVisits = await _db.Visits.CountAsync(v => v.GuestId == guestId && v.VisitDate >= monthStart && v.VisitDate < monthEnd, cancellationToken);
        var yearVisits = await _db.Visits.CountAsync(v => v.GuestId == guestId && v.VisitDate >= yearStart && v.VisitDate < yearStart.AddYears(1), cancellationToken);
        if (monthVisits >= maxMonth)
            throw new InvalidOperationException($"The same guest may not be logged more than {maxMonth} times in a month.");
        if (yearVisits >= maxYear)
            throw new InvalidOperationException($"The same guest may not be logged more than {maxYear} times in a calendar year.");
    }

    private async Task<string> NextSlipCodeAsync(CancellationToken cancellationToken)
    {
        for (var i = 0; i < 12; i++)
        {
            var code = "ACEA-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(3));
            if (!await _db.Guests.AnyAsync(g => g.VisitSlipCode == code, cancellationToken))
                return code;
        }
        throw new InvalidOperationException("Could not allocate a visit slip code.");
    }

    private static void RejectIfBarred(MGuest guest)
    {
        if (IsBarred(guest))
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(guest.BarredReason)
                    ? "This guest is barred and may not be re-introduced."
                    : $"This guest is barred and may not be re-introduced. {guest.BarredReason}");
    }

    private static bool IsBarred(MGuest guest) =>
        !string.IsNullOrWhiteSpace(guest.BarredReason) ||
        string.Equals(guest.GuestStatus?.Code, "BARRED", StringComparison.OrdinalIgnoreCase);

    private static bool NamesMatch(string left, string right) =>
        string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);

    private static bool PhonesMatch(string? left, string? right)
    {
        var a = Digits(left);
        var b = Digits(right);
        if (a.Length == 0 || b.Length == 0) return false;
        if (a.Length >= 9) a = a[^9..];
        if (b.Length >= 9) b = b[^9..];
        return a == b;
    }

    private static string Digits(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "" : new string(value.Where(char.IsDigit).ToArray());
}
