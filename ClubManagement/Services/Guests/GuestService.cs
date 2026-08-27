using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Guests;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Guests;

public record GuestVisitRequest(string GuestName, DateOnly VisitDate, TimeOnly? TimeIn, string? GuestBookEntryNo);
public record ReciprocalVisitRequest(long HomeClubId, DateOnly VisitDate, int DaysUsed, string? Notes);
public record VisitRowDto(long VisitId, string GuestName, DateOnly VisitDate, TimeOnly? TimeIn, TimeOnly? TimeOut, bool IsCurrent, string? EntryNo);

public interface IGuestService
{
    Task<VisitRowDto> SignInGuestAsync(long visitingProfileId, GuestVisitRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task SignOutAsync(long visitId, TimeOnly timeOut, CancellationToken cancellationToken);
    Task<IReadOnlyList<VisitRowDto>> ListCurrentAsync(long visitingProfileId, CancellationToken cancellationToken);
    Task RecordReciprocalAsync(long profileId, ReciprocalVisitRequest request, long? actorUserId, CancellationToken cancellationToken);
}

public class GuestService : IGuestService
{
    private readonly ApplicationModuleDbContext _db;
    private readonly IClubPolicyService _policy;

    public GuestService(ApplicationModuleDbContext db, IClubPolicyService policy)
    {
        _db = db;
        _policy = policy;
    }

    public async Task<VisitRowDto> SignInGuestAsync(long visitingProfileId, GuestVisitRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var account = await _db.Accounts.Include(a => a.MembershipType).Include(a => a.CurrentMemberStatus)
            .FirstOrDefaultAsync(a => a.ProfileId == visitingProfileId && a.IsActive && !a.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException("Active membership was not found for this profile.");
        if (!account.MembershipType.CanIntroduceGuests)
            throw new InvalidOperationException("This membership class cannot introduce guests.");
        if (!account.CurrentMemberStatus.IsActiveStatus)
            throw new InvalidOperationException("Members who are posted or removed cannot introduce guests.");

        var maxActive = await _policy.GetIntAsync("MAX_ACTIVE_GUESTS", 6, cancellationToken);
        var maxMonth = await _policy.GetIntAsync("MAX_GUEST_INTRODUCTIONS_PER_MONTH", 2, cancellationToken);
        var maxYear = await _policy.GetIntAsync("MAX_GUEST_INTRODUCTIONS_PER_YEAR", 12, cancellationToken);

        var currentCount = await _db.Visits.CountAsync(v => v.VisitingProfileId == visitingProfileId && v.IsCurrentFlag, cancellationToken);
        if (currentCount >= maxActive)
            throw new InvalidOperationException($"A member may have at most {maxActive} guests signed in at once.");

        var status = await _db.GuestStatuses.FirstOrDefaultAsync(x => x.Code == "ACTIVE", cancellationToken)
            ?? await _db.GuestStatuses.FirstAsync(cancellationToken);

        var guest = await _db.Guests.FirstOrDefaultAsync(g =>
            g.IntroducedByProfileId == visitingProfileId && g.GuestName == request.GuestName && g.IsActive, cancellationToken);
        if (guest is null)
        {
            guest = new MGuest
            {
                GuestName = request.GuestName.Trim(),
                IntroducedByProfileId = visitingProfileId,
                GuestStatusId = status.GuestStatusId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.Guests.Add(guest);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var monthStart = new DateOnly(request.VisitDate.Year, request.VisitDate.Month, 1);
        var monthEnd = monthStart.AddMonths(1);
        var yearStart = new DateOnly(request.VisitDate.Year, 1, 1);
        var monthVisits = await _db.Visits.CountAsync(v => v.GuestId == guest.GuestId && v.VisitDate >= monthStart && v.VisitDate < monthEnd, cancellationToken);
        var yearVisits = await _db.Visits.CountAsync(v => v.GuestId == guest.GuestId && v.VisitDate >= yearStart && v.VisitDate < yearStart.AddYears(1), cancellationToken);
        if (monthVisits >= maxMonth)
            throw new InvalidOperationException($"The same guest may not be introduced more than {maxMonth} times in a month.");
        if (yearVisits >= maxYear)
            throw new InvalidOperationException($"The same guest may not be introduced more than {maxYear} times in a year.");

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
}
