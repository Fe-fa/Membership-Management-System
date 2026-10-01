using ClubManagement.DTOs.Engagement;
using ClubManagement.Entities.Engagement;
using ClubManagement.Entities.Lookups;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Engagement;

public partial class ClubEventService
{
    public async Task<MemberEventSummaryDto> MemberSummaryAsync(long profileId, CancellationToken cancellationToken)
    {
        var accountId = await AccountIdForProfileAsync(profileId, cancellationToken);
        var events = await _db.ClubEvents.AsNoTracking()
            .Where(e => e.Status != "DRAFT")
            .ToListAsync(cancellationToken);
        var upcoming = events.Count(e => DisplayStatusOf(e) == "PUBLISHED");
        if (accountId is null)
            return new MemberEventSummaryDto(upcoming, 0, 0, 0);
        var mine = await _db.EventRegistrations.AsNoTracking()
            .Where(r => r.AccountId == accountId)
            .Select(r => new { r.Status, r.ClubEventId })
            .ToListAsync(cancellationToken);
        var attended = await _db.EventAttendances.AsNoTracking()
            .CountAsync(a => a.AccountId == accountId && a.Status == "PRESENT", cancellationToken);
        var activeEventIds = events.Where(e => DisplayStatusOf(e) != "CANCELLED").Select(e => e.ClubEventId).ToHashSet();
        return new MemberEventSummaryDto(
            upcoming,
            mine.Count(r => r.Status is "PENDING" or "APPROVED" && activeEventIds.Contains(r.ClubEventId)),
            attended,
            mine.Count(r => r.Status == "PENDING"));
    }

    public async Task<IReadOnlyList<ClubEventDetailDto>> MemberListAsync(long profileId, string? bucket, string? category, string? search, DateTime? from, DateTime? to, CancellationToken cancellationToken)
    {
        var accountId = await AccountIdForProfileAsync(profileId, cancellationToken);
        var rows = await _db.ClubEvents.AsNoTracking()
            .Where(e => e.Status != "DRAFT")
            .OrderBy(e => e.StartsAt)
            .ToListAsync(cancellationToken);
        var projected = await ProjectAsync(rows, accountId, cancellationToken);
        var wanted = (bucket ?? "all").Trim().ToLowerInvariant();
        IEnumerable<ClubEventDetailDto> filtered = projected.Where(e => e.DisplayStatus != "DRAFT");
        filtered = wanted switch
        {
            "upcoming" => filtered.Where(e => e.DisplayStatus is "PUBLISHED" or "ONGOING"),
            "registered" => filtered.Where(e => e.MyRegistration is { Status: "PENDING" or "APPROVED" }),
            "attended" => filtered.Where(e => e.MyRegistration?.AttendanceStatus == "PRESENT"),
            "cancelled" => filtered.Where(e => e.DisplayStatus == "CANCELLED" || e.MyRegistration?.Status == "CANCELLED"),
            _ => filtered.Where(e => e.DisplayStatus != "DRAFT")
        };
        return FilterEvents(filtered, search, null, category, from, to).ToList();
    }

    public async Task<ClubEventDetailDto?> MemberGetAsync(long profileId, long id, CancellationToken cancellationToken)
    {
        var row = await _db.ClubEvents.AsNoTracking().FirstOrDefaultAsync(e => e.ClubEventId == id, cancellationToken);
        if (row is null || StoredStatus(row) == "DRAFT") return null;
        var accountId = await AccountIdForProfileAsync(profileId, cancellationToken);
        return await ProjectOneAsync(row, accountId, cancellationToken);
    }

    public async Task<IReadOnlyList<ClubEventDetailDto>> MemberMineAsync(long profileId, string? bucket, CancellationToken cancellationToken)
    {
        var accountId = await AccountIdForProfileAsync(profileId, cancellationToken);
        if (accountId is null) return [];
        var registrationIds = await _db.EventRegistrations.AsNoTracking()
            .Where(r => r.AccountId == accountId)
            .Select(r => r.ClubEventId)
            .ToListAsync(cancellationToken);
        var attendedIds = await _db.EventAttendances.AsNoTracking()
            .Where(a => a.AccountId == accountId && a.Status == "PRESENT")
            .Select(a => a.ClubEventId)
            .ToListAsync(cancellationToken);
        var ids = registrationIds.Concat(attendedIds).Distinct().ToList();
        var rows = await _db.ClubEvents.AsNoTracking()
            .Where(e => ids.Contains(e.ClubEventId))
            .OrderByDescending(e => e.StartsAt)
            .ToListAsync(cancellationToken);
        var projected = await ProjectAsync(rows, accountId, cancellationToken);
        var wanted = (bucket ?? "registered").Trim().ToLowerInvariant();
        return wanted switch
        {
            "upcoming" => projected.Where(e => e.MyRegistration is { Status: "PENDING" or "APPROVED" } && e.DisplayStatus is "PUBLISHED" or "ONGOING").ToList(),
            "attended" => projected.Where(e => e.MyRegistration?.AttendanceStatus == "PRESENT").ToList(),
            "cancelled" => projected.Where(e => e.MyRegistration?.Status == "CANCELLED" || e.DisplayStatus == "CANCELLED").ToList(),
            _ => projected.Where(e => e.MyRegistration is { Status: "PENDING" or "APPROVED" }).ToList()
        };
    }

    public async Task<ClubEventDetailDto> RegisterAsync(long profileId, long eventId, string? guestName, long? actorUserId, CancellationToken cancellationToken)
    {
        var accountId = await AccountIdForProfileAsync(profileId, cancellationToken)
            ?? throw new InvalidOperationException("Only club members can register for events.");
        var row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == eventId, cancellationToken)
            ?? throw new InvalidOperationException("Event not found.");
        var existing = await _db.EventRegistrations.FirstOrDefaultAsync(r => r.ClubEventId == eventId && r.AccountId == accountId, cancellationToken);
        var seats = await SeatMapAsync([eventId], cancellationToken);
        var used = seats.TryGetValue(eventId, out var snap) ? snap.SeatsUsed : 0;
        var display = DisplayStatusOf(row);
        var block = RegistrationBlock(row, display, used, existing?.Status);
        if (existing is { Status: "PENDING" or "APPROVED" })
            throw new InvalidOperationException("You are already registered for this event.");
        if (block is not null) throw new InvalidOperationException(block);

        var guest = Clean(guestName);
        var guestCount = 0;
        if (guest is not null)
        {
            if (!row.AllowGuestRegistration) throw new InvalidOperationException("This event does not allow guest registration.");
            guestCount = 1;
        }
        if (row.Capacity is int cap && used + 1 + guestCount > cap)
            throw new InvalidOperationException("This event is full.");

        var now = DateTime.UtcNow;
        var status = row.RequireApproval ? "PENDING" : "APPROVED";
        var registration = new EventRegistration
        {
            ClubEventId = eventId,
            AccountId = accountId,
            Status = status,
            PaymentStatus = row.Fee is > 0 ? "UNPAID" : "NOT_REQUIRED",
            GuestCount = guestCount,
            GuestName = guest,
            RegisteredAt = now,
            CreatedAt = now,
            CreatedByUserId = actorUserId
        };
        _db.EventRegistrations.Add(registration);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            throw new InvalidOperationException("You cannot register for this event more than once.");
        }

        if (status == "APPROVED")
        {
            registration.TicketCode = TicketCode(registration);
            await EnsureAttendanceAsync(registration, "REGISTERED", cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
        }

        var body = status == "APPROVED"
            ? $"You are registered for {row.Title} on {FormatWhen(row)}. Your ticket code is {registration.TicketCode}."
            : $"Your registration for {row.Title} is awaiting approval.";
        await NotifyOneAsync(accountId, "EVENT_REGISTRATION", "Registration received", $"Registration: {row.Title}", body, eventId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return await ProjectOneAsync(row, accountId, cancellationToken);
    }

    public async Task<ClubEventDetailDto> CancelOwnAsync(long profileId, long eventId, CancellationToken cancellationToken)
    {
        var accountId = await AccountIdForProfileAsync(profileId, cancellationToken)
            ?? throw new InvalidOperationException("Membership account not found.");
        var row = await _db.ClubEvents.FirstOrDefaultAsync(e => e.ClubEventId == eventId, cancellationToken)
            ?? throw new InvalidOperationException("Event not found.");
        var registration = await _db.EventRegistrations.FirstOrDefaultAsync(r => r.ClubEventId == eventId && r.AccountId == accountId, cancellationToken)
            ?? throw new InvalidOperationException("You are not registered for this event.");
        if (registration.Status is not ("PENDING" or "APPROVED"))
            throw new InvalidOperationException("This registration can no longer be cancelled.");
        var display = DisplayStatusOf(row);
        if (display is "ONGOING" or "COMPLETED")
            throw new InvalidOperationException("You can no longer cancel this registration.");
        registration.Status = "CANCELLED";
        registration.UpdatedAt = DateTime.UtcNow;
        await RemoveOpenAttendanceAsync(registration, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await NotifyOneAsync(accountId, "EVENT_REGISTRATION", "Registration cancelled", $"Registration cancelled: {row.Title}", $"You cancelled your registration for {row.Title}.", eventId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return await ProjectOneAsync(row, accountId, cancellationToken);
    }

    public async Task<int> DispatchRemindersAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var soon = now.AddHours(24);
        var deadlineWindow = now.AddHours(48);
        var events = await _db.ClubEvents
            .Where(e => e.Status == "PUBLISHED" && e.IsPublished)
            .ToListAsync(cancellationToken);
        var sent = 0;
        foreach (var row in events)
        {
            var start = ToUtc(row.StartsAt);
            if (start > now && start <= soon)
            {
                sent += await NotifyMembersAsync(row, "EVENT_REMINDER", "Event reminder", $"Reminder: {row.Title}", $"{row.Title} starts {FormatWhen(row)} at {row.Location ?? "the club"}.", true, null, false, cancellationToken);
            }
            if (row.RequireRegistration && row.RegistrationDeadline is DateTime deadline)
            {
                var due = ToUtc(deadline);
                if (due > now && due <= deadlineWindow && start > now)
                    sent += await NotifyMembersAsync(row, "EVENT_DEADLINE", "Registration deadline", $"Registration closes soon: {row.Title}", $"Registration for {row.Title} closes {ToKenya(deadline):ddd d MMM, HH:mm}.", true, null, true, cancellationToken, onlyUnregistered: true);
            }
        }
        return sent;
    }

    private async Task<int> NotifyMembersAsync(
        ClubEvent row,
        string typeCode,
        string typeName,
        string subject,
        string body,
        bool once,
        long? actorUserId,
        bool allMembers,
        CancellationToken cancellationToken,
        bool onlyUnregistered = false)
    {
        List<(long AccountId, string? Email)> recipients;
        if (allMembers)
        {
            var members = await _db.Accounts.AsNoTracking()
                .Where(a => a.IsActive && !a.IsDeleted)
                .Select(a => new { a.AccountId, a.Profile.Email })
                .ToListAsync(cancellationToken);
            recipients = members.Select(m => (m.AccountId, m.Email)).ToList();
            if (onlyUnregistered)
            {
                var registered = await _db.EventRegistrations.AsNoTracking()
                    .Where(r => r.ClubEventId == row.ClubEventId && r.Status != "CANCELLED" && r.Status != "REJECTED")
                    .Select(r => r.AccountId)
                    .ToListAsync(cancellationToken);
                var skip = registered.ToHashSet();
                recipients = recipients.Where(r => !skip.Contains(r.AccountId)).ToList();
            }
        }
        else
        {
            var regs = await _db.EventRegistrations.AsNoTracking()
                .Where(r => r.ClubEventId == row.ClubEventId && (r.Status == "PENDING" || r.Status == "APPROVED"))
                .Select(r => r.AccountId)
                .ToListAsync(cancellationToken);
            var emails = await _db.Accounts.AsNoTracking()
                .Where(a => regs.Contains(a.AccountId))
                .Select(a => new { a.AccountId, a.Profile.Email })
                .ToListAsync(cancellationToken);
            recipients = emails.Select(m => (m.AccountId, m.Email)).ToList();
        }

        if (recipients.Count == 0) return 0;
        var type = await EnsureTypeAsync(typeCode, typeName, cancellationToken);
        HashSet<long> already = [];
        if (once)
        {
            var accountIds = recipients.Select(r => r.AccountId).ToList();
            var existing = await _db.Notifications.AsNoTracking()
                .Where(n => n.NotificationTypeId == type.NotificationTypeId && n.RelatedEntityType == "EVENT" && n.RelatedEntityId == row.ClubEventId && n.AccountId != null && accountIds.Contains(n.AccountId.Value))
                .Select(n => n.AccountId!.Value)
                .ToListAsync(cancellationToken);
            already = existing.ToHashSet();
        }

        var sent = 0;
        foreach (var recipient in recipients)
        {
            if (already.Contains(recipient.AccountId)) continue;
            _db.Notifications.Add(new Notification
            {
                AccountId = recipient.AccountId,
                NotificationTypeId = type.NotificationTypeId,
                Recipient = string.IsNullOrWhiteSpace(recipient.Email) ? recipient.AccountId.ToString() : recipient.Email.Trim(),
                Channel = "IN_APP",
                Content = string.IsNullOrWhiteSpace(subject) ? body : $"{subject}\n\n{body}",
                RelatedEntityType = "EVENT",
                RelatedEntityId = row.ClubEventId,
                SentDate = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            });
            sent++;
        }
        if (sent > 0) await _db.SaveChangesAsync(cancellationToken);
        return sent;
    }

    private async Task NotifyOneAsync(long accountId, string typeCode, string typeName, string subject, string body, long eventId, CancellationToken cancellationToken)
    {
        var type = await EnsureTypeAsync(typeCode, typeName, cancellationToken);
        var email = await _db.Accounts.AsNoTracking()
            .Where(a => a.AccountId == accountId)
            .Select(a => a.Profile.Email)
            .FirstOrDefaultAsync(cancellationToken);
        _db.Notifications.Add(new Notification
        {
            AccountId = accountId,
            NotificationTypeId = type.NotificationTypeId,
            Recipient = string.IsNullOrWhiteSpace(email) ? accountId.ToString() : email.Trim(),
            Channel = "IN_APP",
            Content = $"{subject}\n\n{body}",
            RelatedEntityType = "EVENT",
            RelatedEntityId = eventId,
            SentDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        });
    }

    private async Task<NotificationType> EnsureTypeAsync(string code, string name, CancellationToken cancellationToken)
    {
        var type = await _db.NotificationTypes.FirstOrDefaultAsync(t => t.Code == code, cancellationToken);
        if (type is not null) return type;
        type = new NotificationType
        {
            Code = code,
            Name = name,
            SortOrder = 40,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.NotificationTypes.Add(type);
        await _db.SaveChangesAsync(cancellationToken);
        return type;
    }
}
