using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Engagement;
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
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<MemberEventsDto> ListForMemberAsync(CancellationToken cancellationToken);
    Task<ClubEventDto> CreateAsync(SaveClubEventRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<ClubEventDto?> UpdateAsync(long id, SaveClubEventRequest request, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(long id, CancellationToken cancellationToken);

    Task<EventSummaryDto> AdminSummaryAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<ClubEventDetailDto>> AdminListAsync(string? search, string? status, string? category, CancellationToken cancellationToken);
    Task<ClubEventDetailDto?> AdminGetAsync(long id, CancellationToken cancellationToken);
    Task<IReadOnlyList<ClubEventDetailDto>> CalendarAsync(DateTime from, DateTime to, bool publishedOnly, long? profileId, CancellationToken cancellationToken);
    Task<ClubEventDetailDto> SaveAdminAsync(SaveEventRequest request, long? actorUserId, long? id, CancellationToken cancellationToken);
    Task<ClubEventDetailDto> SetPublishedAsync(long id, bool publish, CancellationToken cancellationToken);
    Task<ClubEventDetailDto> CancelEventAsync(long id, CancellationToken cancellationToken);
    Task DeleteAdminAsync(long id, bool force, CancellationToken cancellationToken);
    Task<IReadOnlyList<EventCategoryDto>> CategoriesAsync(bool activeOnly, CancellationToken cancellationToken);
    Task<EventCategoryDto> SaveCategoryAsync(SaveEventCategoryRequest request, long? id, CancellationToken cancellationToken);
    Task<RegistrationBoardDto> RegistrationsAsync(long? eventId, string? search, string? status, CancellationToken cancellationToken);
    Task<EventRegistrationDto> SetRegistrationStatusAsync(long registrationId, string status, CancellationToken cancellationToken);
    Task<EventRegistrationDto> SetPaymentStatusAsync(long registrationId, string paymentStatus, CancellationToken cancellationToken);
    Task<AttendanceBoardDto> AttendanceAsync(long? eventId, string? search, bool history, CancellationToken cancellationToken);
    Task<EventRegistrationDto> MarkAttendanceAsync(long eventId, MarkAttendanceRequest request, CancellationToken cancellationToken);
    Task<EventReportDto> ReportAsync(CancellationToken cancellationToken);
    Task AnnounceAsync(long eventId, string message, string? audience, long? actorUserId, CancellationToken cancellationToken);

    Task<MemberEventSummaryDto> MemberSummaryAsync(long profileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ClubEventDetailDto>> MemberListAsync(long profileId, string? bucket, string? category, string? search, DateTime? from, DateTime? to, CancellationToken cancellationToken);
    Task<ClubEventDetailDto?> MemberGetAsync(long profileId, long id, CancellationToken cancellationToken);
    Task<IReadOnlyList<ClubEventDetailDto>> MemberMineAsync(long profileId, string? bucket, CancellationToken cancellationToken);
    Task<ClubEventDetailDto> RegisterAsync(long profileId, long eventId, string? guestName, long? actorUserId, CancellationToken cancellationToken);
    Task<ClubEventDetailDto> CancelOwnAsync(long profileId, long eventId, CancellationToken cancellationToken);
    Task<int> DispatchRemindersAsync(CancellationToken cancellationToken);
}

public partial class ClubEventService : IClubEventService
{
    public static readonly string[] EventAdminRoles =
    [
        "ADMIN",
        "GENERAL_MANAGER",
        "CHAIRMAN",
        "TREASURER",
        "COMMITTEE_MEMBER"
    ];

    private readonly ApplicationModuleDbContext _db;

    public ClubEventService(ApplicationModuleDbContext db) => _db = db;

    public async Task<MemberEventsDto> ListForMemberAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(KenyaNow());
        var items = new List<ClubEventDto>();

        var clubEvents = await _db.ClubEvents.AsNoTracking()
            .Where(e => e.IsPublished && e.Status != "CANCELLED" && e.Status != "DRAFT")
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
            Status = "PUBLISHED",
            RequireRegistration = false,
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
        row.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return MapClub(row, DateTime.UtcNow);
    }

    public async Task<bool> DeleteAsync(long id, CancellationToken cancellationToken)
    {
        var exists = await _db.ClubEvents.AnyAsync(e => e.ClubEventId == id, cancellationToken);
        if (!exists) return false;
        await DeleteAdminAsync(id, force: false, cancellationToken);
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
            BucketFor(row.StartsAt, end, now, DateOnly.FromDateTime(KenyaNow()), DateOnly.FromDateTime(ToKenya(row.StartsAt))));
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
        if (clean.Length < 3) throw new InvalidOperationException("Event title is required.");
        return clean.Length > 200 ? clean[..200] : clean;
    }

    private static string? Clean(string? value)
    {
        var clean = (value ?? "").Trim();
        return string.IsNullOrWhiteSpace(clean) ? null : clean;
    }

    private static string StoredStatus(ClubEvent row)
    {
        var status = (row.Status ?? "").Trim().ToUpperInvariant();
        if (status is "DRAFT" or "PUBLISHED" or "CANCELLED") return status;
        return row.IsPublished ? "PUBLISHED" : "DRAFT";
    }

    private static void ApplyStoredStatus(ClubEvent row, string status)
    {
        row.Status = status;
        row.IsPublished = status == "PUBLISHED";
    }

    internal static string DisplayStatusOf(ClubEvent row)
    {
        var stored = StoredStatus(row);
        if (stored == "CANCELLED") return "CANCELLED";
        if (stored == "DRAFT") return "DRAFT";
        var now = KenyaNow();
        var start = ToKenya(row.StartsAt);
        var end = ToKenya(row.EndsAt ?? row.StartsAt);
        if (now < start) return "PUBLISHED";
        if (now <= end) return "ONGOING";
        return "COMPLETED";
    }

    private static TimeZoneInfo KenyaZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("E. Africa Standard Time"); }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Africa/Nairobi");
        }
    }

    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
    };

    private static DateTime ToKenya(DateTime value) =>
        TimeZoneInfo.ConvertTimeFromUtc(ToUtc(value), KenyaZone());

    private static DateTime KenyaNow() =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, KenyaZone());

    private static bool OccupiesSeat(string status) => status is "PENDING" or "APPROVED";

    private static int SeatUse(string status, int guestCount) =>
        OccupiesSeat(status) ? 1 + Math.Max(0, guestCount) : 0;

    private static string PersonName(string first, string? middle, string last) =>
        string.Join(" ", new[] { first, middle, last }.Where(part => !string.IsNullOrWhiteSpace(part)));

    private static string? RegistrationBlock(ClubEvent row, string display, int seatsUsed, string? myStatus)
    {
        if (myStatus is "PENDING" or "APPROVED") return null;
        if (myStatus is not null) return "You cannot register for this event more than once.";
        if (!row.RequireRegistration) return "Registration is not open for this event.";
        if (display == "DRAFT") return "This event is not open for registration.";
        if (display == "CANCELLED") return "A cancelled event cannot accept new registrations.";
        if (display == "COMPLETED") return "A completed event cannot accept new registrations.";
        if (row.RegistrationDeadline is DateTime deadline && DateTime.UtcNow > ToUtc(deadline))
            return "Registration has closed.";
        if (row.Capacity is int cap && seatsUsed >= cap) return "This event is full.";
        return null;
    }
}
