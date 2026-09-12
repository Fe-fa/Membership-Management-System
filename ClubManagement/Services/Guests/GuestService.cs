using System.Security.Cryptography;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Common;
using ClubManagement.Entities;
using ClubManagement.Entities.Guests;
using ClubManagement.Entities.MembershipAccount;
using ClubManagement.Entities.Lookups;
using Microsoft.EntityFrameworkCore;
using ClubManagement.Services;
using ClubManagement.Services.Finance;

namespace ClubManagement.Services.Guests;

public record GuestVisitRequest(string GuestName, DateOnly VisitDate, TimeOnly? TimeIn, string? GuestBookEntryNo);
public record ReciprocalVisitRequest(long HomeClubId, DateOnly VisitDate, int DaysUsed, string? Notes);
public record VisitRowDto(long VisitId, string GuestName, DateOnly VisitDate, TimeOnly? TimeIn, TimeOnly? TimeOut, bool IsCurrent, string? EntryNo);

public record ReceptionMemberDto(
    long ProfileId,
    string MembershipNo,
    string FullName,
    string? Email = null,
    string? Phone = null,
    string? Status = null,
    string? FirstName = null,
    string? LastName = null);
public record RegisterGuestVisitRequest(
    string FirstName,
    string Surname,
    string? Email,
    long HostProfileId,
    DateOnly? VisitDate,
    string? Purpose,
    string? Signature,
    string? Status,
    string? Phone);
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
    string? Notes,
    string? Email = null,
    string? Purpose = null,
    string? Status = null,
    bool HasSignature = false,
    string? Signature = null);
public record GuestEligibilityRequest(string? GuestName, string? Phone, string? VisitSlipCode);
public record ParentApplicantRequest(
    string? ApplicantFullName,
    string? Email,
    string? Phone,
    string? ParentMembershipNo,
    string? ParentFullName,
    DateOnly? ApplicantDateOfBirth = null);
public record ParentApplicantEligibilityDto(
    bool Found,
    bool NameMatches,
    bool CanContinue,
    bool EntranceFeeWaived,
    long? ParentAccountId,
    long? ParentProfileId,
    string? ParentMembershipNo,
    string? ParentName,
    string? ParentStatus,
    int ParentContinuousYears,
    string? ParentEmail,
    string? ParentPhone,
    int? YearOfJoining,
    string Message,
    DateOnly? RecordedDateOfBirth = null,
    int? ApplicantAgeYears = null);
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
    Task<IReadOnlyList<ReceptionMemberDto>> ListActiveHostsAsync(string? search, CancellationToken cancellationToken);
    Task<IReadOnlyList<ReceptionVisitDto>> ListHostVisitsAsync(long profileId, CancellationToken cancellationToken);
    Task<ReceptionVisitDto> RegisterGuestVisitAsync(RegisterGuestVisitRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<GuestLookupDto>> SearchGuestsAsync(string? name, string? phone, string? visitSlipCode, CancellationToken cancellationToken);
    Task<GuestLookupDto> UpsertGuestAsync(UpsertGuestRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ReceptionVisitDto> ReceptionSignInAsync(ReceptionVisitRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ReceptionVisitDto> ReceptionSignOutAsync(long visitId, CancellationToken cancellationToken);
    Task<PagedResult<ReceptionVisitDto>> ListReceptionVisitsAsync(PagedRequest paging, bool currentOnly, CancellationToken cancellationToken);
    Task<IReadOnlyList<ReceptionVisitDto>> LookupGuestVisitsAsync(string? name, CancellationToken cancellationToken);
    Task<ReceptionVisitDto?> GetReceptionVisitAsync(long visitId, CancellationToken cancellationToken);
    Task<GuestEligibilityDto> CheckRegistrationEligibilityAsync(GuestEligibilityRequest request, CancellationToken cancellationToken);
    Task<ParentApplicantEligibilityDto> CheckParentApplicantAsync(ParentApplicantRequest request, CancellationToken cancellationToken);
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
IF OBJECT_ID(N'dbo.MGuest', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.MGuest', N'email') IS NULL
    ALTER TABLE dbo.MGuest ADD email NVARCHAR(255) NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.MVisit', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.MVisit', N'purpose') IS NULL
    ALTER TABLE dbo.MVisit ADD purpose NVARCHAR(80) NULL;", cancellationToken);
        await _db.Database.ExecuteSqlRawAsync(@"
IF OBJECT_ID(N'dbo.MVisit', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.MVisit', N'signature') IS NULL
    ALTER TABLE dbo.MVisit ADD signature NVARCHAR(MAX) NULL;", cancellationToken);
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

        await RejectIfAlreadyOnSiteAsync(guest, cancellationToken);
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

    public async Task<IReadOnlyList<ReceptionMemberDto>> ListActiveHostsAsync(string? search, CancellationToken cancellationToken)
    {
        var term = (search ?? "").Trim();
        if (term.Length < 2)
            return [];

        var needle = term.ToLowerInvariant();
        var digits = new string(term.Where(char.IsDigit).ToArray());
        return await _db.Accounts.AsNoTracking()
            .Where(a => a.IsActive && !a.IsDeleted && a.MembershipType.CanIntroduceGuests && a.CurrentMemberStatus.IsActiveStatus)
            .Where(a =>
                a.Profile.FirstName.ToLower().Contains(needle)
                || a.Profile.LastName.ToLower().Contains(needle)
                || ((a.Profile.FirstName ?? "") + " " + (a.Profile.LastName ?? "")).ToLower().Contains(needle)
                || (a.MembershipNo ?? "").ToLower().Contains(needle)
                || (a.Profile.Email ?? "").ToLower().Contains(needle)
                || (a.Profile.Mobile ?? "").Contains(term)
                || (digits.Length >= 4 && (a.Profile.Mobile ?? "").Contains(digits)))
            .OrderBy(a => a.Profile.LastName).ThenBy(a => a.Profile.FirstName)
            .Take(8)
            .Select(a => new ReceptionMemberDto(
                a.ProfileId,
                a.MembershipNo ?? "",
                ((a.Profile.Title ?? "") + " " + a.Profile.FirstName + " " + a.Profile.LastName).Trim(),
                a.Profile.Email,
                a.Profile.Mobile,
                a.CurrentMemberStatus.Name,
                a.Profile.FirstName,
                a.Profile.LastName))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ReceptionVisitDto>> ListHostVisitsAsync(long profileId, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var ids = await _db.Visits.AsNoTracking()
            .Where(v => v.VisitingProfileId == profileId || v.Guest.IntroducedByProfileId == profileId)
            .OrderByDescending(v => v.VisitDate)
            .ThenByDescending(v => v.CreatedAt)
            .Take(12)
            .Select(v => v.VisitId)
            .ToListAsync(cancellationToken);

        var rows = new List<ReceptionVisitDto>();
        foreach (var id in ids)
        {
            var row = await MapReceptionVisitAsync(id, cancellationToken);
            if (row is not null) rows.Add(row);
        }
        return rows;
    }

    public async Task<ReceptionVisitDto> RegisterGuestVisitAsync(
        RegisterGuestVisitRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var first = (request.FirstName ?? "").Trim();
        var surname = (request.Surname ?? "").Trim();
        if (string.IsNullOrWhiteSpace(first) || string.IsNullOrWhiteSpace(surname))
            throw new InvalidOperationException("Guest first name and surname are required.");
        if (request.HostProfileId <= 0)
            throw new InvalidOperationException("Select the host member from the membership record. A new member is not created here.");

        var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        if (email is not null && !email.Contains('@'))
            throw new InvalidOperationException("Enter a valid guest email address.");

        var signature = (request.Signature ?? "").Trim();
        if (signature.Length < 2)
            throw new InvalidOperationException("Capture the guest signature before registering the visit.");
        if (signature.Length > 200_000)
            throw new InvalidOperationException("The signature is too large. Sign again in the box, or type the guest's name.");

        var purpose = string.IsNullOrWhiteSpace(request.Purpose) ? null : request.Purpose.Trim();
        if (purpose is { Length: > 80 })
            throw new InvalidOperationException("Visit purpose must be under 80 characters.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var visitDate = request.VisitDate ?? today;
        if (visitDate > today.AddDays(1))
            throw new InvalidOperationException("Visit date cannot be in the future.");

        var onSite = !string.Equals(request.Status, "SIGNED_OUT", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(request.Status, "Signed out", StringComparison.OrdinalIgnoreCase);

        await RequireHostAsync(request.HostProfileId, cancellationToken);

        var fullName = $"{first} {surname}";
        var existing = await FindGuestsAsync(fullName, request.Phone, null, cancellationToken);
        var guest = existing.FirstOrDefault(g =>
            NamesMatch(g.GuestName, fullName)
            && (string.IsNullOrWhiteSpace(email)
                || string.IsNullOrWhiteSpace(g.Email)
                || string.Equals(g.Email, email, StringComparison.OrdinalIgnoreCase)));

        if (guest is not null)
        {
            RejectIfBarred(guest);
            if (string.IsNullOrWhiteSpace(guest.Email) && email is not null)
                guest.Email = email;
            if (string.IsNullOrWhiteSpace(guest.Phone) && !string.IsNullOrWhiteSpace(request.Phone))
                guest.Phone = request.Phone.Trim();
            guest.IntroducedByProfileId ??= request.HostProfileId;
            guest.UpdatedByUserId = actorUserId;
            await _db.SaveChangesAsync(cancellationToken);
        }
        else
        {
            guest = await CreateGuestCoreAsync(fullName, request.HostProfileId, request.Phone, actorUserId, cancellationToken);
            if (email is not null)
            {
                guest.Email = email;
                await _db.SaveChangesAsync(cancellationToken);
            }
        }

        if (onSite)
        {
            await RejectIfAlreadyOnSiteAsync(guest, cancellationToken);
            await EnsureActiveGuestCapacityAsync(request.HostProfileId, cancellationToken);
            await RejectIfFrequencyExceededAsync(guest.GuestId, visitDate, cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(guest.VisitSlipCode))
        {
            guest.VisitSlipCode = await NextSlipCodeAsync(cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var now = DateTime.UtcNow;
        var visit = new MVisit
        {
            GuestId = guest.GuestId,
            VisitingProfileId = request.HostProfileId,
            VisitDate = visitDate,
            TimeIn = TimeOnly.FromDateTime(now),
            TimeOut = onSite ? null : TimeOnly.FromDateTime(now),
            GuestBookEntryNo = guest.VisitSlipCode,
            Purpose = purpose,
            Signature = signature,
            Notes = purpose,
            IsCurrentFlag = onSite,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.Visits.Add(visit);
        await _db.SaveChangesAsync(cancellationToken);
        return (await MapReceptionVisitAsync(visit.VisitId, cancellationToken))!;
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

    public Task<ReceptionVisitDto?> GetReceptionVisitAsync(long visitId, CancellationToken cancellationToken) =>
        MapReceptionVisitAsync(visitId, cancellationToken);

    public async Task<IReadOnlyList<ReceptionVisitDto>> LookupGuestVisitsAsync(string? name, CancellationToken cancellationToken)
    {
        var needle = (name ?? "").Trim();
        if (needle.Length < 2)
            throw new InvalidOperationException("Enter at least two letters of the guest name.");

        await EnsureSchemaAsync(cancellationToken);
        var ids = await _db.Visits.AsNoTracking()
            .Where(v => v.Guest.GuestName.Contains(needle))
            .OrderByDescending(v => v.IsCurrentFlag)
            .ThenByDescending(v => v.VisitDate)
            .ThenByDescending(v => v.CreatedAt)
            .Take(8)
            .Select(v => v.VisitId)
            .ToListAsync(cancellationToken);

        var rows = new List<ReceptionVisitDto>();
        foreach (var id in ids)
        {
            var row = await MapReceptionVisitAsync(id, cancellationToken);
            if (row is not null) rows.Add(row with { Signature = null });
        }
        return rows;
    }

    public async Task<PagedResult<ReceptionVisitDto>> ListReceptionVisitsAsync(PagedRequest paging, bool currentOnly, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        var query = _db.Visits.AsNoTracking();
        if (currentOnly)
            query = query.Where(v => v.IsCurrentFlag);
        return await query
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
                v.CreatedByUserId == null
                    ? null
                    : _db.UserAccounts.Where(u => u.UserAccountId == v.CreatedByUserId)
                        .Select(u => u.Profile.FirstName + " " + u.Profile.LastName)
                        .FirstOrDefault(),
                v.Notes,
                v.Guest.Email,
                v.Purpose,
                v.IsCurrentFlag ? "On site" : "Signed out",
                v.Signature != null && v.Signature != "",
                null))
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

    public async Task<ParentApplicantEligibilityDto> CheckParentApplicantAsync(
        ParentApplicantRequest request,
        CancellationToken cancellationToken)
    {
        var applicantName = (request.ApplicantFullName ?? "").Trim();
        var email = (request.Email ?? "").Trim();
        var phone = (request.Phone ?? "").Trim();
        var membershipNo = (request.ParentMembershipNo ?? "").Trim();
        var parentName = (request.ParentFullName ?? "").Trim();

        if (string.IsNullOrWhiteSpace(applicantName))
            throw new InvalidOperationException("Enter your full name.");
        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(phone))
            throw new InvalidOperationException("Enter an email address or phone number.");
        if (!string.IsNullOrWhiteSpace(email) && !email.Contains('@'))
            throw new InvalidOperationException("Enter a valid email address.");
        if (string.IsNullOrWhiteSpace(membershipNo))
            throw new InvalidOperationException("Enter your parent's membership number.");
        if (string.IsNullOrWhiteSpace(parentName))
            throw new InvalidOperationException("Enter your parent's full name so we can verify the membership number.");

        var wanted = NormalizeMembershipNo(membershipNo);
        var accounts = await _db.Accounts.AsNoTracking()
            .Include(a => a.Profile)
                .ThenInclude(p => p.MDependants)
                    .ThenInclude(d => d.RelationshipType)
            .Include(a => a.CurrentMemberStatus)
            .Where(a => !a.IsDeleted && a.MembershipNo != null)
            .ToListAsync(cancellationToken);
        var parent = accounts.FirstOrDefault(a => NormalizeMembershipNo(a.MembershipNo) == wanted);
        if (parent is null || parent.Profile is null)
        {
            return new ParentApplicantEligibilityDto(
                false, false, false, false, null, null, null, null, null, 0, null, null, null,
                "No member matches that membership number. Check the number with your parent and try again.");
        }

        var officialName = $"{parent.Profile.FirstName} {parent.Profile.MiddleName} {parent.Profile.LastName}";
        if (!ParentNamesMatch(parentName, officialName))
        {
            return new ParentApplicantEligibilityDto(
                true, false, false, false, null, null, parent.MembershipNo, null,
                parent.CurrentMemberStatus?.Code, 0, null, null, null,
                $"Parent's name does not match membership {parent.MembershipNo}, which belongs to {($"{parent.Profile.FirstName} {parent.Profile.LastName}").Trim()}. Check the spelling and try again.");
        }

        var asOf = DateOnly.FromDateTime(DateTime.UtcNow);
        var joined = parent.JoinedDate ?? parent.StartDate;
        var years = joined is DateOnly start ? MembershipFeeCalculator.CompletedYears(start, asOf) : 0;
        var status = (parent.CurrentMemberStatus?.Code ?? "").Trim().ToUpperInvariant();
        var active = status == "ACTIVE";
        var waived = active && years >= MembershipFeeCalculator.EntranceWaiverMinimumParentYears;
        var confirmedName = $"{parent.Profile.FirstName} {parent.Profile.LastName}".Trim();
        if (!active)
        {
            return new ParentApplicantEligibilityDto(
                true, true, false, false, parent.AccountId, parent.ProfileId, parent.MembershipNo,
                confirmedName, status, years, null, null, joined?.Year,
                "That membership is not active, so this parent cannot start a child's application. Ask the club office.");
        }

        var childLink = MatchRecordedChild(parent.Profile.MDependants, applicantName);
        if (childLink.Result == ChildLinkResult.NotRecorded)
        {
            return new ParentApplicantEligibilityDto(
                true, true, false, false, parent.AccountId, parent.ProfileId, parent.MembershipNo,
                confirmedName, status, years, null, null, joined?.Year,
                $"{applicantName} is not listed as a child of {confirmedName}. This path uses the children already saved on that member's record. Ask the club office to add you, or apply as a standard applicant.");
        }
        if (childLink.Result == ChildLinkResult.DateOfBirthMissing || childLink.DateOfBirth is not DateOnly recordedDob)
        {
            return new ParentApplicantEligibilityDto(
                true, true, false, false, parent.AccountId, parent.ProfileId, parent.MembershipNo,
                confirmedName, status, years, null, null, joined?.Year,
                $"{confirmedName} has {applicantName} listed as a child, but that record has no date of birth. Ask the club office to record the date of birth already held for this child.");
        }

        var age = MembershipFeeCalculator.CompletedYears(recordedDob, asOf);
        if (age < MembershipFeeCalculator.EntranceWaiverMinimumAge)
        {
            var eligibleOn = recordedDob.AddYears(MembershipFeeCalculator.EntranceWaiverMinimumAge);
            return new ParentApplicantEligibilityDto(
                true, true, false, false, parent.AccountId, parent.ProfileId, parent.MembershipNo,
                confirmedName, status, years, null, null, joined?.Year,
                $"A member's child can apply only after reaching 21. The date of birth already on {confirmedName}'s record ({recordedDob:d MMMM yyyy}) shows {applicantName} is {age}. You can apply from {eligibleOn:d MMMM yyyy}.",
                recordedDob,
                age);
        }

        var waiverNote = waived
            ? $" Entrance fee can be waived ({years} continuous years)."
            : $" Entrance fee is still payable. This parent has {years} continuous year(s); 5 are required for a waiver.";

        return new ParentApplicantEligibilityDto(
            true,
            true,
            true,
            waived,
            parent.AccountId,
            parent.ProfileId,
            parent.MembershipNo,
            confirmedName,
            status,
            years,
            parent.Profile.Email,
            parent.Profile.Mobile,
            joined?.Year,
            $"Parent verified. {confirmedName} has you listed as a child, and the date of birth on that record ({recordedDob:d MMMM yyyy}) shows you have reached 21 (age {age}). Club visits are not required. Your parent can act as proposer. A seconder is still required." + waiverNote,
            recordedDob,
            age);
    }

    private readonly record struct ChildLink(ChildLinkResult Result, DateOnly? DateOfBirth);

    private enum ChildLinkResult
    {
        NotRecorded,
        DateOfBirthMissing,
        Matched
    }

    private static ChildLink MatchRecordedChild(IEnumerable<MDependant> dependants, string applicantName)
    {
        var nameMatches = dependants
            .Where(d => d.IsActive && IsChildRelationship(d.RelationshipType))
            .Where(d => ChildNamesMatch(applicantName, d.DependantName))
            .ToList();
        if (nameMatches.Count == 0)
            return new ChildLink(ChildLinkResult.NotRecorded, null);

        var matched = nameMatches.FirstOrDefault(d => d.DependantDob is not null) ?? nameMatches[0];
        if (matched.DependantDob is not DateOnly dob)
            return new ChildLink(ChildLinkResult.DateOfBirthMissing, null);
        return new ChildLink(ChildLinkResult.Matched, dob);
    }

    private static bool IsChildRelationship(RelationshipType? relationship)
    {
        if (relationship is null) return false;
        if (string.Equals(relationship.Code, "CHILD", StringComparison.OrdinalIgnoreCase)) return true;
        var name = relationship.Name ?? "";
        return name.Contains("child", StringComparison.OrdinalIgnoreCase)
            || name.Contains("son", StringComparison.OrdinalIgnoreCase)
            || name.Contains("daughter", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeMembershipNo(string? value) =>
        new string((value ?? "").Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();

    private static bool ParentNamesMatch(string provided, string official) => TokenNamesMatch(provided, official);

    private static bool ChildNamesMatch(string applicantName, string recordedName) => TokenNamesMatch(applicantName, recordedName);

    private static bool TokenNamesMatch(string provided, string official)
    {
        var left = NameTokens(provided);
        var right = NameTokens(official);
        if (left.Count < 2 || right.Count < 2) return false;
        return left.All(right.Contains) && right.Take(1).All(left.Contains) && right.TakeLast(1).All(left.Contains);
    }

    private static List<string> NameTokens(string value)
    {
        var titles = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "mr", "mrs", "ms", "miss", "dr", "prof", "sir" };
        return value
            .Split([' ', ',', '.', '-'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(token => token.Trim().ToLowerInvariant())
            .Where(token => token.Length > 1 && !titles.Contains(token))
            .ToList();
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
                v.Notes,
                Email = v.Guest.Email,
                v.Purpose,
                v.Signature
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
            result.Notes,
            result.Email,
            result.Purpose,
            result.IsCurrentFlag ? "On site" : "Signed out",
            !string.IsNullOrWhiteSpace(result.Signature),
            result.Signature);
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

    private async Task RejectIfAlreadyOnSiteAsync(MGuest guest, CancellationToken cancellationToken)
    {
        var openForGuest = await _db.Visits.AsNoTracking()
            .AnyAsync(v => v.GuestId == guest.GuestId && v.IsCurrentFlag, cancellationToken);
        if (openForGuest)
            throw new InvalidOperationException(
                $"{guest.GuestName} is already on site. Sign that guest out before registering another visit.");

        // Same person may exist as duplicate guest rows; block any matching name still on site.
        var otherOpenNames = await _db.Visits.AsNoTracking()
            .Where(v => v.IsCurrentFlag && v.GuestId != guest.GuestId)
            .Select(v => v.Guest.GuestName)
            .ToListAsync(cancellationToken);
        if (otherOpenNames.Any(name => NamesMatch(name, guest.GuestName)))
            throw new InvalidOperationException(
                $"{guest.GuestName} is already on site. Sign that guest out before registering another visit.");
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
