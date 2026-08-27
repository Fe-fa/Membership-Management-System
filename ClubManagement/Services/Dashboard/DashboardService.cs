using ClubManagement.Data.MembershipApplication;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Dashboard;

public record AdminOverviewDto(
    ApplicationRollup Applications,
    FinanceRollup Finances,
    GovernanceRollup Governance,
    FacilityRollup Facilities);

public record ApplicationRollup(int PendingApprovals, int Waitlisted, int Rejected, int ExistingMembers);
public record FinanceRollup(decimal AnnualSubscriptionRevenue, decimal OutstandingBalances, IReadOnlyList<PaymentMethodCount> RecentTransactions);
public record PaymentMethodCount(string Method, int Count);
public record GovernanceRollup(int ActiveCommitteeMembers, IReadOnlyList<CommitteeRow> CommitteeMembers, IReadOnlyList<MeetingRow> UpcomingMeetings, IReadOnlyList<DocumentRow> Documents);
public record CommitteeRow(string Name, string Role);
public record MeetingRow(string Title, string MeetingDate, string MeetingType, string Status);
public record DocumentRow(string Name, string Version, string Status, string? EffectiveDate);
public record FacilityRollup(int TotalRooms, int OccupiedRooms, decimal OccupancyRate, IReadOnlyList<StayRow> UpcomingReservations);
public record StayRow(string MemberName, string? RoomType, string CheckIn, string CheckOut);

public interface IDashboardService
{
    Task<AdminOverviewDto> GetOverviewAsync(CancellationToken cancellationToken);
}

public class DashboardService : IDashboardService
{
    private readonly ApplicationModuleDbContext _db;
    public DashboardService(ApplicationModuleDbContext db) => _db = db;

    public async Task<AdminOverviewDto> GetOverviewAsync(CancellationToken cancellationToken)
    {
        var pendingCodes = new[] { "Submitted", "UnderReview", "SUBMITTED", "UNDER_REVIEW" };
        var pending = await _db.Applications.CountAsync(a => pendingCodes.Contains(a.Status.Code), cancellationToken);
        var waitlisted = await _db.Applications.CountAsync(a => a.Status.Code == "Waitlist" || a.Status.Code == "WAITLIST", cancellationToken);
        var rejected = await _db.Applications.CountAsync(a => a.Status.Code == "Rejected" || a.Status.Code == "REJECTED", cancellationToken);
        var members = await _db.Accounts.CountAsync(a => a.IsActive && !a.IsDeleted && a.CurrentMemberStatus.IsActiveStatus, cancellationToken);

        var year = DateTime.UtcNow.Year;
        var revenue = await _db.Subscriptions.Where(s => s.SubscriptionYear == year).SumAsync(s => (decimal?)s.AmountPaid, cancellationToken) ?? 0;
        var outstanding = await _db.Arrearses.Where(a => a.Status == "OPEN").SumAsync(a => (decimal?)a.Amount, cancellationToken) ?? 0;
        var methods = await _db.Transactions.AsNoTracking()
            .Where(t => t.PaymentDate != null && t.PaymentDate.Value >= DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30)))
            .GroupBy(t => t.PaymentMethod.Name)
            .Select(g => new PaymentMethodCount(g.Key, g.Count()))
            .ToListAsync(cancellationToken);

        var committee = await _db.CommitteeMembers.AsNoTracking()
            .Where(c => c.IsActive)
            .Include(c => c.Member)
            .Include(c => c.CommitteeRole)
            .Select(c => new CommitteeRow(c.Member.FirstName + " " + c.Member.LastName, c.CommitteeRole.Name))
            .ToListAsync(cancellationToken);

        var meetings = await _db.CommitteeMeetings.AsNoTracking()
            .Where(m => m.MeetingDate >= DateOnly.FromDateTime(DateTime.UtcNow))
            .Include(m => m.MeetingType)
            .OrderBy(m => m.MeetingDate)
            .Take(5)
            .Select(m => new MeetingRow(m.MeetingType.Name, m.MeetingDate.ToString("yyyy-MM-dd"), "COMMITTEE", m.Status))
            .ToListAsync(cancellationToken);

        var occupied = await _db.AccommodationBookings.CountAsync(b => b.Status == "OCCUPIED" || b.Status == "BOOKED", cancellationToken);
        var upcoming = await _db.AccommodationBookings.AsNoTracking()
            .Where(b => b.CheckInDate >= DateOnly.FromDateTime(DateTime.UtcNow) && (b.Status == "BOOKED" || b.Status == "OCCUPIED"))
            .Include(b => b.Account).ThenInclude(a => a.Profile)
            .OrderBy(b => b.CheckInDate)
            .Take(5)
            .Select(b => new StayRow(b.Account.Profile.FirstName + " " + b.Account.Profile.LastName, b.RoomType, b.CheckInDate.ToString("yyyy-MM-dd"), b.CheckOutDate.ToString("yyyy-MM-dd")))
            .ToListAsync(cancellationToken);

        return new AdminOverviewDto(
            new ApplicationRollup(pending, waitlisted, rejected, members),
            new FinanceRollup(revenue, outstanding, methods),
            new GovernanceRollup(committee.Count, committee, meetings, Array.Empty<DocumentRow>()),
            new FacilityRollup(24, occupied, 24 == 0 ? 0 : occupied / 24m, upcoming));
    }
}
