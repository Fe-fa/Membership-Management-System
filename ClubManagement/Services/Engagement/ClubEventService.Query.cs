using ClubManagement.DTOs.Engagement;
using ClubManagement.Entities.Engagement;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Engagement;

public partial class ClubEventService
{
    private sealed record SeatSnapshot(int Approved, int Pending, int Rejected, int Cancelled, int SeatsUsed);

    private async Task<Dictionary<long, SeatSnapshot>> SeatMapAsync(IReadOnlyCollection<long> eventIds, CancellationToken cancellationToken)
    {
        if (eventIds.Count == 0) return new Dictionary<long, SeatSnapshot>();
        var rows = await _db.EventRegistrations.AsNoTracking()
            .Where(r => eventIds.Contains(r.ClubEventId))
            .Select(r => new { r.ClubEventId, r.Status, r.GuestCount })
            .ToListAsync(cancellationToken);
        return rows
            .GroupBy(r => r.ClubEventId)
            .ToDictionary(
                g => g.Key,
                g => new SeatSnapshot(
                    g.Count(r => r.Status == "APPROVED"),
                    g.Count(r => r.Status == "PENDING"),
                    g.Count(r => r.Status == "REJECTED"),
                    g.Count(r => r.Status == "CANCELLED"),
                    g.Sum(r => SeatUse(r.Status, r.GuestCount))));
    }

    private async Task<Dictionary<string, string>> CategoryNamesAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.EventCategories.AsNoTracking().ToListAsync(cancellationToken);
        return rows.ToDictionary(c => c.Code, c => c.Name, StringComparer.OrdinalIgnoreCase);
    }

    private async Task<Dictionary<long, string>> CreatorNamesAsync(IEnumerable<long?> ids, CancellationToken cancellationToken)
    {
        var keys = ids.Where(id => id is > 0).Select(id => id!.Value).Distinct().ToList();
        if (keys.Count == 0) return new Dictionary<long, string>();
        var users = await _db.UserAccounts.AsNoTracking()
            .Where(u => keys.Contains(u.UserAccountId))
            .Select(u => new { u.UserAccountId, u.Username, u.Profile.FirstName, u.Profile.LastName })
            .ToListAsync(cancellationToken);
        return users.ToDictionary(
            u => u.UserAccountId,
            u =>
            {
                var name = PersonName(u.FirstName, null, u.LastName);
                return string.IsNullOrWhiteSpace(name) ? u.Username : name;
            });
    }

    private async Task<long?> AccountIdForProfileAsync(long profileId, CancellationToken cancellationToken)
    {
        return await _db.Accounts.AsNoTracking()
            .Where(a => a.ProfileId == profileId && !a.IsDeleted)
            .OrderByDescending(a => a.IsActive)
            .ThenByDescending(a => a.AccountId)
            .Select(a => (long?)a.AccountId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<Dictionary<long, EventRegistration>> RegistrationsForAccountAsync(long accountId, CancellationToken cancellationToken)
    {
        var rows = await _db.EventRegistrations.AsNoTracking()
            .Where(r => r.AccountId == accountId)
            .ToListAsync(cancellationToken);
        return rows.ToDictionary(r => r.ClubEventId);
    }

    private ClubEventDetailDto MapDetail(
        ClubEvent row,
        IReadOnlyDictionary<string, string> categories,
        IReadOnlyDictionary<long, string> creators,
        SeatSnapshot? seats,
        EventRegistration? mine,
        string? attendanceStatus,
        DateTime? checkedInAt)
    {
        var snap = seats ?? new SeatSnapshot(0, 0, 0, 0, 0);
        var display = DisplayStatusOf(row);
        string? categoryName = null;
        if (!string.IsNullOrWhiteSpace(row.CategoryCode))
            categories.TryGetValue(row.CategoryCode, out categoryName);
        string? createdBy = null;
        if (row.CreatedByUserId is long userId)
            creators.TryGetValue(userId, out createdBy);
        var myStatus = mine?.Status;
        int? available = row.Capacity is int cap ? Math.Max(0, cap - snap.SeatsUsed) : null;
        return new ClubEventDetailDto(
            row.ClubEventId,
            row.Title,
            row.Description,
            row.CategoryCode,
            categoryName,
            row.ImageUrl,
            row.StartsAt,
            row.EndsAt,
            row.Location,
            row.Capacity,
            row.RegistrationDeadline,
            row.Fee,
            row.RequireRegistration,
            row.RequireApproval,
            row.AllowGuestRegistration,
            StoredStatus(row),
            display,
            row.IsPublished,
            snap.Approved + snap.Pending,
            snap.Approved,
            snap.Pending,
            available,
            createdBy,
            row.CreatedByUserId,
            row.CreatedAt,
            row.UpdatedAt,
            RegistrationBlock(row, display, snap.SeatsUsed, myStatus),
            mine is null ? null : ToRegistrationDto(mine, "You", null, null, null, mine.AccountId, attendanceStatus, checkedInAt));
    }

    private static EventRegistrationDto ToRegistrationDto(
        EventRegistration row,
        string memberName,
        string? membershipNo,
        string? email,
        string? phone,
        long accountIdOverride,
        string? attendanceStatus,
        DateTime? checkedInAt)
    {
        return new EventRegistrationDto(
            row.EventRegistrationId,
            row.ClubEventId,
            accountIdOverride == 0 ? row.AccountId : accountIdOverride,
            memberName,
            membershipNo,
            email,
            phone,
            row.Status,
            row.PaymentStatus,
            row.RegisteredAt,
            row.TicketCode,
            row.GuestCount,
            row.GuestName,
            attendanceStatus,
            checkedInAt);
    }

    private async Task<List<ClubEventDetailDto>> ProjectAsync(
        IReadOnlyList<ClubEvent> rows,
        long? accountId,
        CancellationToken cancellationToken)
    {
        var ids = rows.Select(r => r.ClubEventId).ToList();
        var seats = await SeatMapAsync(ids, cancellationToken);
        var categories = await CategoryNamesAsync(cancellationToken);
        var creators = await CreatorNamesAsync(rows.Select(r => r.CreatedByUserId), cancellationToken);
        Dictionary<long, EventRegistration> mine = accountId is long id
            ? await RegistrationsForAccountAsync(id, cancellationToken)
            : new Dictionary<long, EventRegistration>();
        var attendance = accountId is null
            ? new Dictionary<long, EventAttendance>()
            : (await _db.EventAttendances.AsNoTracking()
                .Where(a => a.AccountId == accountId && ids.Contains(a.ClubEventId))
                .ToListAsync(cancellationToken))
                .ToDictionary(a => a.ClubEventId);

        return rows.Select(row =>
        {
            mine.TryGetValue(row.ClubEventId, out var registration);
            attendance.TryGetValue(row.ClubEventId, out var mark);
            seats.TryGetValue(row.ClubEventId, out var snap);
            return MapDetail(row, categories, creators, snap, registration, mark?.Status, mark?.CheckedInAt);
        }).ToList();
    }

    private async Task<ClubEventDetailDto> ProjectOneAsync(ClubEvent row, long? accountId, CancellationToken cancellationToken)
    {
        var list = await ProjectAsync([row], accountId, cancellationToken);
        return list[0];
    }
}
