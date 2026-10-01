using System.Security.Cryptography;
using ClubManagement.DTOs.Engagement;
using ClubManagement.Entities.Engagement;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Engagement;

public partial class ClubEventService
{
    public async Task<EventSummaryDto> AdminSummaryAsync(CancellationToken cancellationToken)
    {
        var events = await _db.ClubEvents.AsNoTracking().ToListAsync(cancellationToken);
        var regs = await _db.EventRegistrations.AsNoTracking()
            .Select(r => r.Status)
            .ToListAsync(cancellationToken);
        var today = DateOnly.FromDateTime(KenyaNow());
        return new EventSummaryDto(
            events.Count,
            events.Count(e => DisplayStatusOf(e) == "PUBLISHED"),
            events.Count(e => DisplayStatusOf(e) == "ONGOING"),
            events.Count(e => DisplayStatusOf(e) == "COMPLETED"),
            regs.Count(s => s is "PENDING" or "APPROVED"),
            regs.Count(s => s == "PENDING"),
            events.Count(e => DateOnly.FromDateTime(ToKenya(e.StartsAt)) == today && StoredStatus(e) != "DRAFT" && StoredStatus(e) != "CANCELLED"));
    }

    public async Task<IReadOnlyList<ClubEventDetailDto>> AdminListAsync(string? search, string? status, string? category, CancellationToken cancellationToken)
    {
        var rows = await _db.ClubEvents.AsNoTracking().OrderByDescending(e => e.StartsAt).ToListAsync(cancellationToken);
        var projected = await ProjectAsync(rows, null, cancellationToken);
        return FilterEvents(projected, search, status, category, null, null).ToList();
    }

    public async Task<ClubEventDetailDto?> AdminGetAsync(long id, CancellationToken cancellationToken)
    {
        var row = await _db.ClubEvents.AsNoTracking().FirstOrDefaultAsync(e => e.ClubEventId == id, cancellationToken);
        return row is null ? null : await ProjectOneAsync(row, null, cancellationToken);
    }

    public async Task<IReadOnlyList<ClubEventDetailDto>> CalendarAsync(DateTime from, DateTime to, bool publishedOnly, long? profileId, CancellationToken cancellationToken)
    {
        var start = ToUtc(from);
        var end = ToUtc(to);
        var rows = await _db.ClubEvents.AsNoTracking()
            .Where(e => e.StartsAt < end && (e.EndsAt ?? e.StartsAt) >= start)
            .OrderBy(e => e.StartsAt)
            .ToListAsync(cancellationToken);
        if (publishedOnly)
            rows = rows.Where(e => StoredStatus(e) != "DRAFT").ToList();
        long? accountId = profileId is long profile ? await AccountIdForProfileAsync(profile, cancellationToken) : null;
        return await ProjectAsync(rows, accountId, cancellationToken);
    }

    public async Task<ClubEventDetailDto> SaveAdminAsync(SaveEventRequest request, long? actorUserId, long? id, CancellationToken cancellationToken)
    {
        var status = (request.Status ?? "DRAFT").Trim().ToUpperInvariant();
        if (status is not ("DRAFT" or "PUBLISHED"))
            throw new InvalidOperationException("Choose Draft or Published.");
        await ValidateSaveAsync(request, cancellationToken);

        ClubEvent row;
        var previousStart = (DateTime?)null;
        var previousEnd = (DateTime?)null;
        var previousVenue = (string?)null;
        var wasPublished = false;
        if (id is null)
        {
            row = new ClubEvent { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId };
            _db.ClubEvents.Add(row);
        }
        else
        {
            row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == id, cancellationToken)
                ?? throw new InvalidOperationException("Event not found.");
            if (StoredStatus(row) == "CANCELLED" && status == "PUBLISHED")
                status = "PUBLISHED";
            previousStart = row.StartsAt;
            previousEnd = row.EndsAt;
            previousVenue = row.Location;
            wasPublished = StoredStatus(row) == "PUBLISHED" || DisplayStatusOf(row) is "ONGOING" or "COMPLETED";
            row.UpdatedAt = DateTime.UtcNow;
        }

        row.Title = RequireTitle(request.Title);
        row.Description = Clean(request.Description);
        row.CategoryCode = request.CategoryCode!.Trim().ToUpperInvariant();
        row.ImageUrl = Clean(request.ImageUrl);
        row.StartsAt = request.StartsAt;
        row.EndsAt = request.EndsAt;
        row.Location = Clean(request.Venue);
        row.Capacity = request.Capacity;
        row.RegistrationDeadline = request.RegistrationDeadline;
        row.Fee = request.Fee;
        row.RequireRegistration = request.RequireRegistration;
        row.RequireApproval = request.RequireApproval;
        row.AllowGuestRegistration = request.AllowGuestRegistration;
        if (StoredStatus(row) != "CANCELLED" || status == "PUBLISHED")
            ApplyStoredStatus(row, status);
        await _db.SaveChangesAsync(cancellationToken);

        if (status == "PUBLISHED" && !wasPublished)
            await NotifyMembersAsync(row, "EVENT_PUBLISHED", "New club event", $"New event: {row.Title}", $"A new club event has been published: {row.Title}. It starts {FormatWhen(row)} at {row.Location ?? "the club"}.", true, actorUserId, allMembers: true, cancellationToken);
        else if (wasPublished && previousStart is DateTime oldStart)
            await NotifyScheduleChangesAsync(row, oldStart, previousEnd, previousVenue, actorUserId, cancellationToken);

        return await ProjectOneAsync(row, null, cancellationToken);
    }

    public async Task<ClubEventDetailDto> SetPublishedAsync(long id, bool publish, CancellationToken cancellationToken)
    {
        var row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == id, cancellationToken)
            ?? throw new InvalidOperationException("Event not found.");
        if (StoredStatus(row) == "CANCELLED")
            throw new InvalidOperationException("A cancelled event must be edited before it can be published again.");
        var wasPublished = row.IsPublished && StoredStatus(row) == "PUBLISHED";
        ApplyStoredStatus(row, publish ? "PUBLISHED" : "DRAFT");
        row.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        if (publish && !wasPublished)
            await NotifyMembersAsync(row, "EVENT_PUBLISHED", "New club event", $"New event: {row.Title}", $"A new club event has been published: {row.Title}. It starts {FormatWhen(row)} at {row.Location ?? "the club"}.", true, null, allMembers: true, cancellationToken);
        return await ProjectOneAsync(row, null, cancellationToken);
    }

    public async Task<ClubEventDetailDto> CancelEventAsync(long id, CancellationToken cancellationToken)
    {
        var row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == id, cancellationToken)
            ?? throw new InvalidOperationException("Event not found.");
        ApplyStoredStatus(row, "CANCELLED");
        row.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        await NotifyMembersAsync(row, "EVENT_CANCELLED", "Event cancelled", $"{row.Title} was cancelled", $"The club event {row.Title} scheduled for {FormatWhen(row)} has been cancelled.", false, null, allMembers: false, cancellationToken);
        return await ProjectOneAsync(row, null, cancellationToken);
    }

    public async Task DeleteAdminAsync(long id, bool force, CancellationToken cancellationToken)
    {
        var row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == id, cancellationToken)
            ?? throw new InvalidOperationException("Event not found.");
        var registrationCount = await _db.EventRegistrations.CountAsync(r => r.ClubEventId == id, cancellationToken);
        if (registrationCount > 0 && !force)
            throw new EventConflictException($"This event has {registrationCount} registration(s). Confirm deletion to remove the event and its registrations.");
        var attendance = await _db.EventAttendances.Where(a => a.ClubEventId == id).ToListAsync(cancellationToken);
        var registrations = await _db.EventRegistrations.Where(r => r.ClubEventId == id).ToListAsync(cancellationToken);
        _db.EventAttendances.RemoveRange(attendance);
        _db.EventRegistrations.RemoveRange(registrations);
        _db.ClubEvents.Remove(row);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<EventCategoryDto>> CategoriesAsync(bool activeOnly, CancellationToken cancellationToken)
    {
        var categories = await _db.EventCategories.AsNoTracking()
            .OrderBy(c => c.SortOrder)
            .ToListAsync(cancellationToken);
        var counts = await _db.ClubEvents.AsNoTracking()
            .Where(e => e.CategoryCode != null)
            .GroupBy(e => e.CategoryCode!)
            .Select(g => new { Code = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var byCode = counts.ToDictionary(c => c.Code, c => c.Count, StringComparer.OrdinalIgnoreCase);
        return categories
            .Where(c => !activeOnly || c.IsActive)
            .Select(c => new EventCategoryDto(c.EventCategoryId, c.Code, c.Name, c.SortOrder, c.IsActive, byCode.GetValueOrDefault(c.Code)))
            .ToList();
    }

    public async Task<EventCategoryDto> SaveCategoryAsync(SaveEventCategoryRequest request, long? id, CancellationToken cancellationToken)
    {
        var name = (request.Name ?? "").Trim();
        if (name.Length < 2) throw new InvalidOperationException("Enter a category name.");
        EventCategory row;
        if (id is null)
        {
            var code = new string(name.ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
            if (code.Length > 40) code = code[..40];
            if (code.Length < 2) code = "CATEGORY";
            var baseCode = code;
            var suffix = 2;
            while (await _db.EventCategories.AnyAsync(c => c.Code == code, cancellationToken))
            {
                code = baseCode.Length > 36 ? $"{baseCode[..36]}{suffix}" : $"{baseCode}{suffix}";
                suffix++;
            }
            var sort = await _db.EventCategories.MaxAsync(c => (int?)c.SortOrder, cancellationToken) ?? 0;
            row = new EventCategory
            {
                Code = code,
                Name = name,
                SortOrder = sort + 1,
                IsActive = request.IsActive,
                CreatedAt = DateTime.UtcNow
            };
            _db.EventCategories.Add(row);
        }
        else
        {
            row = await _db.EventCategories.FirstOrDefaultAsync(c => c.EventCategoryId == id, cancellationToken)
                ?? throw new InvalidOperationException("Category not found.");
            row.Name = name;
            row.IsActive = request.IsActive;
            row.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(cancellationToken);
        var count = await _db.ClubEvents.CountAsync(e => e.CategoryCode == row.Code, cancellationToken);
        return new EventCategoryDto(row.EventCategoryId, row.Code, row.Name, row.SortOrder, row.IsActive, count);
    }

    public async Task<RegistrationBoardDto> RegistrationsAsync(long? eventId, string? search, string? status, CancellationToken cancellationToken)
    {
        var query = _db.EventRegistrations.AsNoTracking().AsQueryable();
        if (eventId is long id) query = query.Where(r => r.ClubEventId == id);
        var registrations = await query.OrderByDescending(r => r.RegisteredAt).ToListAsync(cancellationToken);
        var rows = await HydrateRegistrationsAsync(registrations, cancellationToken);
        var term = (search ?? "").Trim();
        if (term.Length > 0)
        {
            rows = rows.Where(r =>
                r.MemberName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (r.Email ?? "").Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (r.Phone ?? "").Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (r.MembershipNo ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
        }
        var wanted = (status ?? "").Trim().ToUpperInvariant();
        if (wanted is "PENDING" or "APPROVED" or "REJECTED" or "CANCELLED")
            rows = rows.Where(r => r.Status == wanted).ToList();

        ClubEvent? ev = null;
        int? available = null;
        if (eventId is long eventKey)
        {
            ev = await _db.ClubEvents.AsNoTracking().FirstOrDefaultAsync(e => e.ClubEventId == eventKey, cancellationToken);
            if (ev is not null)
            {
                var seats = await SeatMapAsync([eventKey], cancellationToken);
                seats.TryGetValue(eventKey, out var snap);
                available = ev.Capacity is int cap ? Math.Max(0, cap - (snap?.SeatsUsed ?? 0)) : null;
            }
        }
        var source = eventId is null ? registrations : registrations.Where(r => r.ClubEventId == eventId).ToList();
        return new RegistrationBoardDto(
            eventId,
            ev?.Title,
            source.Count(r => r.Status is "PENDING" or "APPROVED"),
            source.Count(r => r.Status == "APPROVED"),
            source.Count(r => r.Status == "PENDING"),
            source.Count(r => r.Status == "REJECTED"),
            source.Count(r => r.Status == "CANCELLED"),
            available,
            rows);
    }

    public async Task<EventRegistrationDto> SetRegistrationStatusAsync(long registrationId, string status, CancellationToken cancellationToken)
    {
        var next = (status ?? "").Trim().ToUpperInvariant();
        if (next is not ("APPROVED" or "REJECTED" or "CANCELLED"))
            throw new InvalidOperationException("Choose approve, reject, or cancel.");
        var row = await _db.EventRegistrations.FirstOrDefaultAsync(r => r.EventRegistrationId == registrationId, cancellationToken)
            ?? throw new InvalidOperationException("Registration not found.");
        var ev = await _db.ClubEvents.FirstAsync(e => e.ClubEventId == row.ClubEventId, cancellationToken);
        if (next == "APPROVED" && row.Status != "APPROVED")
        {
            var seats = await SeatMapAsync([row.ClubEventId], cancellationToken);
            var used = seats.TryGetValue(row.ClubEventId, out var snap) ? snap.SeatsUsed : 0;
            if (!OccupiesSeat(row.Status)) used += SeatUse("APPROVED", row.GuestCount);
            if (ev.Capacity is int cap && used > cap)
                throw new InvalidOperationException("Approving this registration would exceed the event capacity.");
        }
        row.Status = next;
        row.UpdatedAt = DateTime.UtcNow;
        if (next == "APPROVED")
        {
            row.TicketCode ??= TicketCode(row);
            await EnsureAttendanceAsync(row, "REGISTERED", cancellationToken);
            await NotifyOneAsync(row.AccountId, "EVENT_APPROVED", "Registration approved", $"{ev.Title} registration approved", $"Your registration for {ev.Title} has been approved. Your ticket code is {row.TicketCode}.", ev.ClubEventId, cancellationToken);
        }
        else
        {
            await RemoveOpenAttendanceAsync(row, cancellationToken);
            var code = next == "REJECTED" ? "EVENT_REJECTED" : "EVENT_REGISTRATION";
            var title = next == "REJECTED" ? "Registration not approved" : "Registration cancelled";
            var body = next == "REJECTED"
                ? $"Your registration for {ev.Title} was not approved."
                : $"Your registration for {ev.Title} has been cancelled.";
            await NotifyOneAsync(row.AccountId, code, title, title, body, ev.ClubEventId, cancellationToken);
        }
        await _db.SaveChangesAsync(cancellationToken);
        var hydrated = await HydrateRegistrationsAsync([row], cancellationToken);
        return hydrated[0];
    }

    public async Task<EventRegistrationDto> SetPaymentStatusAsync(long registrationId, string paymentStatus, CancellationToken cancellationToken)
    {
        var next = (paymentStatus ?? "").Trim().ToUpperInvariant();
        if (next is not ("PAID" or "UNPAID" or "NOT_REQUIRED"))
            throw new InvalidOperationException("Payment status must be paid, unpaid, or not required.");
        var row = await _db.EventRegistrations.FirstOrDefaultAsync(r => r.EventRegistrationId == registrationId, cancellationToken)
            ?? throw new InvalidOperationException("Registration not found.");
        row.PaymentStatus = next;
        row.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return (await HydrateRegistrationsAsync([row], cancellationToken))[0];
    }

    public async Task<AttendanceBoardDto> AttendanceAsync(long? eventId, string? search, bool history, CancellationToken cancellationToken)
    {
        var registrationQuery = _db.EventRegistrations.AsNoTracking().Where(r => r.Status == "APPROVED");
        if (eventId is long id) registrationQuery = registrationQuery.Where(r => r.ClubEventId == id);
        else if (history)
        {
            var pastIds = await _db.ClubEvents.AsNoTracking()
                .Where(e => e.EndsAt != null ? e.EndsAt < DateTime.UtcNow : e.StartsAt < DateTime.UtcNow)
                .Select(e => e.ClubEventId)
                .ToListAsync(cancellationToken);
            registrationQuery = registrationQuery.Where(r => pastIds.Contains(r.ClubEventId));
        }
        var registrations = await registrationQuery.OrderBy(r => r.RegisteredAt).ToListAsync(cancellationToken);
        var rows = await HydrateRegistrationsAsync(registrations, cancellationToken);
        var term = (search ?? "").Trim();
        if (term.Length > 0)
        {
            rows = rows.Where(r =>
                r.MemberName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (r.MembershipNo ?? "").Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (r.Email ?? "").Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (r.TicketCode ?? "").Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
        }
        string? title = null;
        if (eventId is long eventKey)
            title = await _db.ClubEvents.AsNoTracking().Where(e => e.ClubEventId == eventKey).Select(e => e.Title).FirstOrDefaultAsync(cancellationToken);
        return new AttendanceBoardDto(
            eventId,
            title,
            rows.Count,
            rows.Count,
            rows.Count(r => r.AttendanceStatus == "PRESENT"),
            rows.Count(r => r.AttendanceStatus == "ABSENT"),
            rows);
    }

    public async Task<EventRegistrationDto> MarkAttendanceAsync(long eventId, MarkAttendanceRequest request, CancellationToken cancellationToken)
    {
        var status = (request.Status ?? "").Trim().ToUpperInvariant();
        if (status is not ("PRESENT" or "ABSENT" or "REGISTERED"))
            throw new InvalidOperationException("Attendance must be present, absent, or registered.");
        EventRegistration? registration = null;
        if (!string.IsNullOrWhiteSpace(request.TicketCode))
        {
            var code = request.TicketCode.Trim();
            registration = await _db.EventRegistrations.FirstOrDefaultAsync(r => r.ClubEventId == eventId && r.TicketCode == code, cancellationToken);
            if (registration is null) throw new InvalidOperationException("No registration matches that ticket code.");
        }
        else if (request.AccountId is long accountId)
        {
            registration = await _db.EventRegistrations.FirstOrDefaultAsync(r => r.ClubEventId == eventId && r.AccountId == accountId, cancellationToken);
        }
        if (registration is null) throw new InvalidOperationException("Choose a registered member.");
        if (registration.Status != "APPROVED")
            throw new InvalidOperationException("Attendance can only be recorded for approved registrations.");
        var mark = await _db.EventAttendances.FirstOrDefaultAsync(a => a.ClubEventId == eventId && a.AccountId == registration.AccountId, cancellationToken);
        if (mark is null)
        {
            mark = new EventAttendance
            {
                ClubEventId = eventId,
                AccountId = registration.AccountId,
                EventRegistrationId = registration.EventRegistrationId,
                CreatedAt = DateTime.UtcNow
            };
            _db.EventAttendances.Add(mark);
        }
        mark.Status = status;
        mark.CheckedInAt = status == "PRESENT" ? mark.CheckedInAt ?? DateTime.UtcNow : null;
        mark.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return (await HydrateRegistrationsAsync([registration], cancellationToken))[0];
    }

    public async Task<EventReportDto> ReportAsync(CancellationToken cancellationToken)
    {
        var summary = await AdminSummaryAsync(cancellationToken);
        var events = await _db.ClubEvents.AsNoTracking().OrderByDescending(e => e.StartsAt).ToListAsync(cancellationToken);
        var regs = await _db.EventRegistrations.AsNoTracking()
            .Select(r => new { r.ClubEventId, r.Status, r.RegisteredAt })
            .ToListAsync(cancellationToken);
        var marks = await _db.EventAttendances.AsNoTracking()
            .Select(a => new { a.ClubEventId, a.Status })
            .ToListAsync(cancellationToken);
        var rows = events.Select(ev =>
        {
            var eventRegs = regs.Where(r => r.ClubEventId == ev.ClubEventId && r.Status == "APPROVED").ToList();
            var present = marks.Count(a => a.ClubEventId == ev.ClubEventId && a.Status == "PRESENT");
            var absent = marks.Count(a => a.ClubEventId == ev.ClubEventId && a.Status == "ABSENT");
            var expected = eventRegs.Count;
            var attendanceRate = expected == 0 ? 0 : Math.Round(present * 100m / expected, 1);
            var noShow = expected == 0 ? 0 : Math.Round(absent * 100m / expected, 1);
            return new EventReportRowDto(ev.ClubEventId, ev.Title, DisplayStatusOf(ev), ev.StartsAt, expected, present, absent, attendanceRate, noShow);
        }).OrderByDescending(r => r.Registrations).ToList();

        var trend = regs
            .Where(r => r.Status is "PENDING" or "APPROVED")
            .GroupBy(r => new { r.RegisteredAt.Year, r.RegisteredAt.Month })
            .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
            .TakeLast(6)
            .Select(g => new EventTrendPointDto($"{g.Key.Year:0000}-{g.Key.Month:00}", g.Count()))
            .ToList();
        return new EventReportDto(summary, rows, trend);
    }

    public async Task AnnounceAsync(long eventId, string message, string? audience, long? actorUserId, CancellationToken cancellationToken)
    {
        var body = (message ?? "").Trim();
        if (body.Length < 3) throw new InvalidOperationException("Enter an announcement.");
        var row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == eventId, cancellationToken)
            ?? throw new InvalidOperationException("Event not found.");
        var all = string.Equals(audience, "members", StringComparison.OrdinalIgnoreCase);
        await NotifyMembersAsync(row, "EVENT_ANNOUNCEMENT", "Event announcement", $"{row.Title}: announcement", body, false, actorUserId, all, cancellationToken);
    }

    private async Task ValidateSaveAsync(SaveEventRequest request, CancellationToken cancellationToken)
    {
        RequireTitle(request.Title);
        if (request.EndsAt is null) throw new InvalidOperationException("Enter an end time.");
        if (request.EndsAt <= request.StartsAt) throw new InvalidOperationException("End time must be after the start time.");
        if (request.Capacity is null || request.Capacity <= 0) throw new InvalidOperationException("Capacity must be greater than zero.");
        if (request.RegistrationDeadline is DateTime deadline && ToUtc(deadline) > ToUtc(request.StartsAt))
            throw new InvalidOperationException("Registration deadline cannot be after the event date.");
        if (request.Fee is < 0) throw new InvalidOperationException("Event fee cannot be negative.");
        if (string.IsNullOrWhiteSpace(request.Venue)) throw new InvalidOperationException("Enter a venue.");
        var code = (request.CategoryCode ?? "").Trim().ToUpperInvariant();
        if (code.Length == 0) throw new InvalidOperationException("Choose an event category.");
        var category = await _db.EventCategories.AsNoTracking().FirstOrDefaultAsync(c => c.Code == code && c.IsActive, cancellationToken);
        if (category is null) throw new InvalidOperationException("Choose a valid event category.");
    }

    private async Task NotifyScheduleChangesAsync(ClubEvent row, DateTime oldStart, DateTime? oldEnd, string? oldVenue, long? actorUserId, CancellationToken cancellationToken)
    {
        var dateChanged = ToKenya(oldStart).Date != ToKenya(row.StartsAt).Date;
        var timeChanged = ToKenya(oldStart).TimeOfDay != ToKenya(row.StartsAt).TimeOfDay
            || ToKenya(oldEnd ?? oldStart).TimeOfDay != ToKenya(row.EndsAt ?? row.StartsAt).TimeOfDay;
        var venueChanged = !string.Equals(oldVenue ?? "", row.Location ?? "", StringComparison.OrdinalIgnoreCase);
        if (dateChanged)
            await NotifyMembersAsync(row, "EVENT_RESCHEDULED", "Event date changed", $"{row.Title} date changed", $"The date for {row.Title} has changed. It is now {FormatWhen(row)}.", false, actorUserId, false, cancellationToken);
        if (timeChanged)
            await NotifyMembersAsync(row, "EVENT_TIME_CHANGED", "Event time changed", $"{row.Title} time changed", $"The time for {row.Title} has changed. It is now {FormatWhen(row)}.", false, actorUserId, false, cancellationToken);
        if (venueChanged)
            await NotifyMembersAsync(row, "EVENT_VENUE_CHANGED", "Event venue changed", $"{row.Title} venue changed", $"The venue for {row.Title} is now {row.Location ?? "to be confirmed"}.", false, actorUserId, false, cancellationToken);
    }

    private static IEnumerable<ClubEventDetailDto> FilterEvents(
        IEnumerable<ClubEventDetailDto> rows,
        string? search,
        string? status,
        string? category,
        DateTime? from,
        DateTime? to)
    {
        var term = (search ?? "").Trim();
        var wanted = (status ?? "").Trim().ToUpperInvariant();
        var cat = (category ?? "").Trim().ToUpperInvariant();
        foreach (var row in rows)
        {
            if (term.Length > 0 && !row.Title.Contains(term, StringComparison.OrdinalIgnoreCase) && !(row.Venue ?? "").Contains(term, StringComparison.OrdinalIgnoreCase) && !(row.CategoryName ?? "").Contains(term, StringComparison.OrdinalIgnoreCase))
                continue;
            if (wanted.Length > 0 && wanted != "ALL" && row.DisplayStatus != wanted && row.Status != wanted)
                continue;
            if (cat.Length > 0 && cat != "ALL" && !string.Equals(row.CategoryCode, cat, StringComparison.OrdinalIgnoreCase))
                continue;
            if (from is DateTime start && ToUtc(row.StartsAt) < ToUtc(start)) continue;
            if (to is DateTime end && ToUtc(row.StartsAt) > ToUtc(end)) continue;
            yield return row;
        }
    }

    private async Task<List<EventRegistrationDto>> HydrateRegistrationsAsync(IReadOnlyList<EventRegistration> registrations, CancellationToken cancellationToken)
    {
        if (registrations.Count == 0) return [];
        var accountIds = registrations.Select(r => r.AccountId).Distinct().ToList();
        var eventIds = registrations.Select(r => r.ClubEventId).Distinct().ToList();
        var accounts = await _db.Accounts.AsNoTracking()
            .Where(a => accountIds.Contains(a.AccountId))
            .Select(a => new { a.AccountId, a.MembershipNo, a.ProfileId })
            .ToListAsync(cancellationToken);
        var profileIds = accounts.Select(a => a.ProfileId).Distinct().ToList();
        var profiles = await _db.Profiles.AsNoTracking()
            .Where(p => profileIds.Contains(p.ProfileId))
            .Select(p => new { p.ProfileId, p.FirstName, p.MiddleName, p.LastName, p.Email, p.Mobile, p.MembershipNo })
            .ToListAsync(cancellationToken);
        var attendance = await _db.EventAttendances.AsNoTracking()
            .Where(a => eventIds.Contains(a.ClubEventId) && accountIds.Contains(a.AccountId))
            .ToListAsync(cancellationToken);
        var accountById = accounts.ToDictionary(a => a.AccountId);
        var profileById = profiles.ToDictionary(p => p.ProfileId);
        return registrations.Select(row =>
        {
            accountById.TryGetValue(row.AccountId, out var account);
            profileById.TryGetValue(account?.ProfileId ?? 0, out var profile);
            var mark = attendance.FirstOrDefault(a => a.ClubEventId == row.ClubEventId && a.AccountId == row.AccountId);
            var name = profile is null ? "Member" : PersonName(profile.FirstName, profile.MiddleName, profile.LastName);
            return ToRegistrationDto(
                row,
                name,
                account?.MembershipNo ?? profile?.MembershipNo,
                profile?.Email,
                profile?.Mobile,
                row.AccountId,
                mark?.Status ?? (row.Status == "APPROVED" ? "REGISTERED" : null),
                mark?.CheckedInAt);
        }).ToList();
    }

    private async Task EnsureAttendanceAsync(EventRegistration registration, string status, CancellationToken cancellationToken)
    {
        var mark = await _db.EventAttendances.FirstOrDefaultAsync(a => a.ClubEventId == registration.ClubEventId && a.AccountId == registration.AccountId, cancellationToken);
        if (mark is null)
        {
            _db.EventAttendances.Add(new EventAttendance
            {
                ClubEventId = registration.ClubEventId,
                AccountId = registration.AccountId,
                EventRegistrationId = registration.EventRegistrationId,
                Status = status,
                CreatedAt = DateTime.UtcNow
            });
            return;
        }
        if (mark.Status == "REGISTERED")
        {
            mark.Status = status;
            mark.UpdatedAt = DateTime.UtcNow;
        }
    }

    private async Task RemoveOpenAttendanceAsync(EventRegistration registration, CancellationToken cancellationToken)
    {
        var mark = await _db.EventAttendances.FirstOrDefaultAsync(a => a.ClubEventId == registration.ClubEventId && a.AccountId == registration.AccountId, cancellationToken);
        if (mark is not null && mark.Status == "REGISTERED")
            _db.EventAttendances.Remove(mark);
    }

    private static string TicketCode(EventRegistration row)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(3));
        return $"EVT-{row.ClubEventId}-{row.EventRegistrationId}-{token}";
    }

    private static string FormatWhen(ClubEvent row)
    {
        var start = ToKenya(row.StartsAt);
        var end = row.EndsAt is DateTime ends ? ToKenya(ends) : (DateTime?)null;
        var text = start.ToString("ddd d MMM yyyy, HH:mm");
        if (end is DateTime finish) text += $"–{finish:HH:mm}";
        return text;
    }
}
