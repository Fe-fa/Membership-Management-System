using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Engagement;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Engagement;

public record ClubEventDto(
    long Id,
    string Title,
    string? Location,
    string? Description,
    DateTime StartsAt,
    DateTime? EndsAt,
    string Kind,
    string Bucket);

public record SaveClubEventRequest(
    string Title,
    string? Location,
    string? Description,
    DateTime StartsAt,
    DateTime? EndsAt);

public record MemberEventsDto(
    IReadOnlyList<ClubEventDto> Current,
    IReadOnlyList<ClubEventDto> Upcoming,
    IReadOnlyList<ClubEventDto> Past);

public interface IClubEventService
{
    Task<MemberEventsDto> ListForMemberAsync(CancellationToken cancellationToken);
    Task<ClubEventDto> CreateAsync(SaveClubEventRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ClubEventDto?> UpdateAsync(long id, SaveClubEventRequest request, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(long id, CancellationToken cancellationToken);
}

public class ClubEventService : IClubEventService
{
    private readonly ApplicationModuleDbContext _db;

    public ClubEventService(ApplicationModuleDbContext db) => _db = db;

    public async Task<MemberEventsDto> ListForMemberAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);
        var items = new List<ClubEventDto>();

        var clubEvents = await _db.ClubEvents.AsNoTracking()
            .Where(e => e.IsPublished)
            .OrderByDescending(e => e.StartsAt)
            .Take(200)
            .ToListAsync(cancellationToken);
        items.AddRange(clubEvents.Select(e => MapClub(e, now)));

        var meetings = await _db.GeneralMeetings.AsNoTracking()
            .OrderByDescending(m => m.MeetingDate)
            .Take(80)
            .ToListAsync(cancellationToken);
        foreach (var meeting in meetings)
        {
            if (string.Equals(meeting.Status, "CANCELLED", StringComparison.OrdinalIgnoreCase)) continue;
            var start = meeting.MeetingDate.ToDateTime(TimeOnly.MinValue);
            var end = meeting.MeetingDate.ToDateTime(new TimeOnly(23, 59));
            var bucket = BucketFor(start, end, now, today, meeting.MeetingDate);
            items.Add(new ClubEventDto(
                meeting.GeneralMeetingId,
                $"{meeting.MeetingType} general meeting",
                meeting.Venue,
                meeting.AgendaText,
                start,
                end,
                "MEETING",
                bucket));
        }

        return new MemberEventsDto(
            items.Where(i => i.Bucket == "current").OrderBy(i => i.StartsAt).ToList(),
            items.Where(i => i.Bucket == "upcoming").OrderBy(i => i.StartsAt).ToList(),
            items.Where(i => i.Bucket == "past").OrderByDescending(i => i.StartsAt).Take(40).ToList());
    }

    public async Task<ClubEventDto> CreateAsync(SaveClubEventRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var row = new ClubEvent
        {
            Title = RequireTitle(request.Title),
            Location = Clean(request.Location),
            Description = Clean(request.Description),
            StartsAt = request.StartsAt,
            EndsAt = request.EndsAt,
            IsPublished = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.ClubEvents.Add(row);
        await _db.SaveChangesAsync(cancellationToken);
        return MapClub(row, DateTime.UtcNow);
    }

    public async Task<ClubEventDto?> UpdateAsync(long id, SaveClubEventRequest request, CancellationToken cancellationToken)
    {
        var row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == id, cancellationToken);
        if (row is null) return null;
        row.Title = RequireTitle(request.Title);
        row.Location = Clean(request.Location);
        row.Description = Clean(request.Description);
        row.StartsAt = request.StartsAt;
        row.EndsAt = request.EndsAt;
        await _db.SaveChangesAsync(cancellationToken);
        return MapClub(row, DateTime.UtcNow);
    }

    public async Task<bool> DeleteAsync(long id, CancellationToken cancellationToken)
    {
        var row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == id, cancellationToken);
        if (row is null) return false;
        _db.ClubEvents.Remove(row);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static ClubEventDto MapClub(ClubEvent row, DateTime now)
    {
        var end = row.EndsAt ?? row.StartsAt.Date.AddDays(1).AddMinutes(-1);
        return new ClubEventDto(
            row.ClubEventId,
            row.Title,
            row.Location,
            row.Description,
            row.StartsAt,
            row.EndsAt,
            "CLUB",
            BucketFor(row.StartsAt, end, now, DateOnly.FromDateTime(now), DateOnly.FromDateTime(row.StartsAt)));
    }

    private static string BucketFor(DateTime start, DateTime end, DateTime now, DateOnly today, DateOnly day)
    {
        if (day == today || (start <= now && end >= now)) return "current";
        if (start > now) return "upcoming";
        return "past";
    }

    private static string RequireTitle(string? title)
    {
        var clean = (title ?? "").Trim();
        if (clean.Length < 3) throw new InvalidOperationException("Enter an event title.");
        return clean.Length > 200 ? clean[..200] : clean;
    }

    private static string? Clean(string? value)
    {
        var clean = (value ?? "").Trim();
        return string.IsNullOrWhiteSpace(clean) ? null : clean;
    }
}
