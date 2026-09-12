using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Common;
using ClubManagement.Entities.Finance;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Finance;

public record NmRevenueSummaryDto(
    decimal CollectionTotal,
    int OpenItems,
    string Period,
    DateOnly From,
    DateOnly To);

public record NmPayRequest(string PaymentMethod, string? ReferenceCode = null);

public record NmAccommodationCreateRequest(
    string GuestName,
    string? Phone,
    string? Email,
    long? AccountId,
    bool IsGuest,
    DateOnly CheckInDate,
    DateOnly CheckOutDate,
    string? RoomNumber,
    decimal NightlyRate,
    decimal ExtraCharges,
    bool IsPaidInAdvance,
    long? AccommodationBookingId = null);

public record NmAccommodationRowDto(
    long Id,
    string GuestName,
    string? Phone,
    string? Email,
    long? AccountId,
    string? MembershipNo,
    bool IsGuest,
    DateOnly CheckInDate,
    DateOnly CheckOutDate,
    int NumberOfNights,
    string? RoomNumber,
    decimal NightlyRate,
    decimal ExtraCharges,
    decimal TotalAmount,
    bool IsPaidInAdvance,
    string Status,
    string? ReceiptNo,
    DateTime? PaidAt,
    string? PaymentMethod,
    string? ReferenceCode,
    DateTime CreatedAt,
    long? AccommodationBookingId = null,
    string? StayStatus = null,
    string? RoomType = null);

public record NmCorkageCreateRequest(
    string PayerName,
    long? AccountId,
    bool IsGuest,
    string ItemDescription,
    decimal FeeAmount,
    bool AuthorizedByManager,
    string? ManagerName);

public record NmCorkageRowDto(
    long Id,
    string PayerName,
    long? AccountId,
    string? MembershipNo,
    bool IsGuest,
    string ItemDescription,
    decimal FeeAmount,
    bool AuthorizedByManager,
    string? ManagerName,
    string Status,
    string? ReceiptNo,
    DateTime? PaidAt,
    string? PaymentMethod,
    string? ReferenceCode,
    DateTime CreatedAt);

public record NmCustomLineRequest(string Description, decimal UnitPrice, decimal Quantity);

public record NmCustomCreateRequest(
    string PayerName,
    long? AccountId,
    string Category,
    IReadOnlyList<NmCustomLineRequest> LineItems);

public record NmCustomLineDto(long Id, string Description, decimal UnitPrice, decimal Quantity, decimal Subtotal);

public record NmCustomRowDto(
    long Id,
    string PayerName,
    long? AccountId,
    string? MembershipNo,
    string Category,
    decimal TotalAmount,
    string Status,
    string? ReceiptNo,
    DateTime? PaidAt,
    string? PaymentMethod,
    string? ReferenceCode,
    string? CreatedByUsername,
    DateTime CreatedAt,
    IReadOnlyList<NmCustomLineDto> LineItems);

public record NmReceiptDto(
    string Kind,
    long Id,
    string PayerName,
    string? MembershipNo,
    string Description,
    decimal Amount,
    string Status,
    string? ReceiptNo,
    DateTime? PaidAt,
    string? PaymentMethod,
    string? ReferenceCode,
    DateTime CreatedAt);

public record NmListFilter(
    DateOnly? From = null,
    DateOnly? To = null,
    string? Status = null,
    string? PaymentMethod = null,
    string? Search = null,
    long? AccountId = null);

public interface INonMembershipBillingService
{
    Task EnsureSchemaAsync(CancellationToken cancellationToken);
    Task<NmRevenueSummaryDto> GetSummaryAsync(string? period, DateOnly? from, DateOnly? to, CancellationToken cancellationToken);
    Task<PagedResult<NmAccommodationRowDto>> ListAccommodationAsync(NmListFilter filter, PagedRequest paging, CancellationToken cancellationToken);
    Task<NmAccommodationRowDto> CreateAccommodationAsync(NmAccommodationCreateRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<NmAccommodationRowDto> PayAccommodationAsync(long id, NmPayRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<NmAccommodationRowDto> CancelAccommodationAsync(long id, long? actorUserId, CancellationToken cancellationToken);
    Task<PagedResult<NmCorkageRowDto>> ListCorkageAsync(NmListFilter filter, PagedRequest paging, CancellationToken cancellationToken);
    Task<NmCorkageRowDto> CreateCorkageAsync(NmCorkageCreateRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<NmCorkageRowDto> PayCorkageAsync(long id, NmPayRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<PagedResult<NmCustomRowDto>> ListCustomAsync(NmListFilter filter, PagedRequest paging, CancellationToken cancellationToken);
    Task<NmCustomRowDto> CreateCustomAsync(NmCustomCreateRequest request, long? actorUserId, string? username, CancellationToken cancellationToken);
    Task<NmCustomRowDto> PayCustomAsync(long id, NmPayRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<NmReceiptDto> GetReceiptAsync(string kind, long id, CancellationToken cancellationToken);
    Task SettleFromMemberPaymentAsync(
        long accountId,
        string feeTypeCode,
        decimal amount,
        string paymentMethodCode,
        string? referenceCode,
        long? nmChargeId,
        long? actorUserId,
        CancellationToken cancellationToken);
}

public class NonMembershipBillingService : INonMembershipBillingService
{
    private readonly ApplicationModuleDbContext _db;

    public NonMembershipBillingService(ApplicationModuleDbContext db) => _db = db;

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync("""
IF OBJECT_ID(N'dbo.Nm_accommodation_booking', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Nm_accommodation_booking (
        nm_accommodation_booking_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        guest_name NVARCHAR(200) NOT NULL,
        phone NVARCHAR(40) NULL,
        email NVARCHAR(200) NULL,
        account_id BIGINT NULL,
        is_guest BIT NOT NULL CONSTRAINT DF_nm_acc_is_guest DEFAULT(1),
        check_in_date DATE NOT NULL,
        check_out_date DATE NOT NULL,
        number_of_nights INT NOT NULL,
        room_number NVARCHAR(40) NULL,
        nightly_rate DECIMAL(18,2) NOT NULL,
        extra_charges DECIMAL(18,2) NOT NULL CONSTRAINT DF_nm_acc_extra DEFAULT(0),
        total_amount DECIMAL(18,2) NOT NULL,
        is_paid_in_advance BIT NOT NULL CONSTRAINT DF_nm_acc_advance DEFAULT(0),
        status NVARCHAR(40) NOT NULL,
        receipt_no NVARCHAR(40) NULL,
        paid_at DATETIME2 NULL,
        payment_method NVARCHAR(40) NULL,
        reference_code NVARCHAR(80) NULL,
        created_at DATETIME2 NOT NULL,
        created_by_user_id BIGINT NULL,
        updated_by_user_id BIGINT NULL,
        accommodation_booking_id BIGINT NULL
    );
END

IF COL_LENGTH(N'dbo.Nm_accommodation_booking', N'accommodation_booking_id') IS NULL
    ALTER TABLE dbo.Nm_accommodation_booking ADD accommodation_booking_id BIGINT NULL;

IF OBJECT_ID(N'dbo.Nm_corkage_charge', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Nm_corkage_charge (
        nm_corkage_charge_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        payer_name NVARCHAR(200) NOT NULL,
        account_id BIGINT NULL,
        is_guest BIT NOT NULL CONSTRAINT DF_nm_cork_is_guest DEFAULT(1),
        item_description NVARCHAR(500) NOT NULL,
        fee_amount DECIMAL(18,2) NOT NULL,
        authorized_by_manager BIT NOT NULL CONSTRAINT DF_nm_cork_auth DEFAULT(0),
        manager_name NVARCHAR(200) NULL,
        status NVARCHAR(40) NOT NULL,
        receipt_no NVARCHAR(40) NULL,
        paid_at DATETIME2 NULL,
        payment_method NVARCHAR(40) NULL,
        reference_code NVARCHAR(80) NULL,
        created_at DATETIME2 NOT NULL,
        created_by_user_id BIGINT NULL,
        updated_by_user_id BIGINT NULL
    );
END

IF OBJECT_ID(N'dbo.Nm_custom_charge', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Nm_custom_charge (
        nm_custom_charge_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        payer_name NVARCHAR(200) NOT NULL,
        account_id BIGINT NULL,
        category NVARCHAR(60) NOT NULL,
        total_amount DECIMAL(18,2) NOT NULL,
        status NVARCHAR(40) NOT NULL,
        receipt_no NVARCHAR(40) NULL,
        paid_at DATETIME2 NULL,
        payment_method NVARCHAR(40) NULL,
        reference_code NVARCHAR(80) NULL,
        created_by_username NVARCHAR(120) NULL,
        created_at DATETIME2 NOT NULL,
        created_by_user_id BIGINT NULL,
        updated_by_user_id BIGINT NULL
    );
END

IF OBJECT_ID(N'dbo.Nm_custom_charge_line', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Nm_custom_charge_line (
        nm_custom_charge_line_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        nm_custom_charge_id BIGINT NOT NULL,
        description NVARCHAR(300) NOT NULL,
        unit_price DECIMAL(18,2) NOT NULL,
        quantity DECIMAL(18,2) NOT NULL,
        subtotal DECIMAL(18,2) NOT NULL,
        CONSTRAINT FK_nm_custom_line_charge FOREIGN KEY (nm_custom_charge_id)
            REFERENCES dbo.Nm_custom_charge(nm_custom_charge_id) ON DELETE CASCADE
    );
END
""", cancellationToken);
    }

    public async Task<NmRevenueSummaryDto> GetSummaryAsync(
        string? period, DateOnly? from, DateOnly? to, CancellationToken cancellationToken)
    {
        var (resolvedPeriod, rangeStart, rangeEndExclusive) = ResolveCollectionRange(period, from, to);

        var accPaid = await _db.NmAccommodationBookings.AsNoTracking()
            .Where(x => x.Status == "PAID" && x.PaidAt != null && x.PaidAt >= rangeStart && x.PaidAt < rangeEndExclusive)
            .SumAsync(x => x.TotalAmount, cancellationToken);
        var corkPaid = await _db.NmCorkageCharges.AsNoTracking()
            .Where(x => x.Status == "PAID" && x.PaidAt != null && x.PaidAt >= rangeStart && x.PaidAt < rangeEndExclusive)
            .SumAsync(x => x.FeeAmount, cancellationToken);
        var customPaid = await _db.NmCustomCharges.AsNoTracking()
            .Where(x => x.Status == "PAID" && x.PaidAt != null && x.PaidAt >= rangeStart && x.PaidAt < rangeEndExclusive)
            .SumAsync(x => x.TotalAmount, cancellationToken);

        var open = await _db.NmAccommodationBookings.CountAsync(x => x.Status == "PENDING_ADVANCE_PAYMENT", cancellationToken)
            + await _db.NmCorkageCharges.CountAsync(x => x.Status == "PENDING", cancellationToken)
            + await _db.NmCustomCharges.CountAsync(x => x.Status == "PENDING", cancellationToken);

        return new NmRevenueSummaryDto(
            accPaid + corkPaid + customPaid,
            open,
            resolvedPeriod,
            DateOnly.FromDateTime(rangeStart),
            DateOnly.FromDateTime(rangeEndExclusive.AddDays(-1)));
    }

    private static (string Period, DateTime Start, DateTime EndExclusive) ResolveCollectionRange(
        string? period, DateOnly? from, DateOnly? to)
    {
        var today = DateTime.UtcNow.Date;
        var key = (period ?? "month").Trim().ToLowerInvariant();

        if (key is "custom" || (from.HasValue && to.HasValue))
        {
            var start = (from ?? DateOnly.FromDateTime(today)).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var endDay = (to ?? from ?? DateOnly.FromDateTime(today)).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            if (endDay < start)
            {
                (start, endDay) = (endDay, start);
            }

            return ("custom", start, endDay.AddDays(1));
        }

        return key switch
        {
            "today" => ("today", today, today.AddDays(1)),
            "week" => ("week", today.AddDays(-(int)today.DayOfWeek), today.AddDays(-(int)today.DayOfWeek).AddDays(7)),
            "year" => ("year", new DateTime(today.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(today.Year + 1, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
            _ => ("month", new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1)),
        };
    }

    public async Task<PagedResult<NmAccommodationRowDto>> ListAccommodationAsync(
        NmListFilter filter, PagedRequest paging, CancellationToken cancellationToken)
    {
        var q = _db.NmAccommodationBookings.AsNoTracking().Include(x => x.Account).AsQueryable();
        if (filter.AccountId is long accountId) q = q.Where(x => x.AccountId == accountId);
        if (filter.From is DateOnly from) q = q.Where(x => x.CheckInDate >= from);
        if (filter.To is DateOnly to) q = q.Where(x => x.CheckInDate <= to);
        if (!string.IsNullOrWhiteSpace(filter.Status)) q = q.Where(x => x.Status == filter.Status.Trim().ToUpperInvariant());
        if (!string.IsNullOrWhiteSpace(filter.PaymentMethod)) q = q.Where(x => x.PaymentMethod == filter.PaymentMethod);
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim().ToLowerInvariant();
            q = q.Where(x =>
                x.GuestName.ToLower().Contains(term)
                || (x.ReceiptNo != null && x.ReceiptNo.ToLower().Contains(term))
                || (x.RoomNumber != null && x.RoomNumber.ToLower().Contains(term))
                || (x.Phone != null && x.Phone.ToLower().Contains(term)));
        }
        var total = await q.CountAsync(cancellationToken);
        var rows = await q.OrderByDescending(x => x.CreatedAt).Skip(paging.Skip).Take(paging.PageSize).ToListAsync(cancellationToken);
        var stayIds = rows.Where(x => x.AccommodationBookingId is not null).Select(x => x.AccommodationBookingId!.Value).Distinct().ToList();
        var stayRows = stayIds.Count == 0
            ? []
            : await _db.AccommodationBookings.AsNoTracking()
                .Where(x => stayIds.Contains(x.AccommodationBookingId))
                .Select(x => new { x.AccommodationBookingId, x.Status, x.RoomType })
                .ToListAsync(cancellationToken);
        var stays = stayRows.ToDictionary(x => x.AccommodationBookingId, x => (x.Status, x.RoomType));
        return Paging.Create(rows.Select(x => MapAccommodation(x, stays)).ToList(), paging, total);
    }

    public async Task<NmAccommodationRowDto> CreateAccommodationAsync(
        NmAccommodationCreateRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.GuestName))
            throw new InvalidOperationException("Guest name is required.");
        if (request.CheckOutDate <= request.CheckInDate)
            throw new InvalidOperationException("Check-out must be after check-in.");
        if (request.NightlyRate < 0 || request.ExtraCharges < 0)
            throw new InvalidOperationException("Rates cannot be negative.");

        var nights = request.CheckOutDate.DayNumber - request.CheckInDate.DayNumber;
        var total = Math.Round(nights * request.NightlyRate + request.ExtraCharges, 2);
        var status = request.IsPaidInAdvance ? "PENDING_ADVANCE_PAYMENT" : "PENDING_ADVANCE_PAYMENT";

        var row = new NmAccommodationBooking
        {
            GuestName = request.GuestName.Trim(),
            Phone = request.Phone?.Trim(),
            Email = request.Email?.Trim(),
            AccountId = request.IsGuest ? null : request.AccountId,
            IsGuest = request.IsGuest || request.AccountId is null,
            CheckInDate = request.CheckInDate,
            CheckOutDate = request.CheckOutDate,
            NumberOfNights = nights,
            RoomNumber = request.RoomNumber?.Trim(),
            NightlyRate = request.NightlyRate,
            ExtraCharges = request.ExtraCharges,
            TotalAmount = total,
            IsPaidInAdvance = request.IsPaidInAdvance,
            AccommodationBookingId = request.AccommodationBookingId,
            Status = status,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.NmAccommodationBookings.Add(row);
        await _db.SaveChangesAsync(cancellationToken);
        await _db.Entry(row).Reference(x => x.Account).LoadAsync(cancellationToken);
        return MapAccommodation(row);
    }

    public async Task<NmAccommodationRowDto> PayAccommodationAsync(
        long id, NmPayRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var row = await _db.NmAccommodationBookings.Include(x => x.Account)
            .FirstOrDefaultAsync(x => x.NmAccommodationBookingId == id, cancellationToken)
            ?? throw new InvalidOperationException("Booking was not found.");
        if (row.Status is "CANCELLED" or "REFUNDED")
            throw new InvalidOperationException("Cancelled or refunded bookings cannot be paid.");
        if (row.Status == "PAID")
            throw new InvalidOperationException("Booking is already paid.");

        ApplyPayment(row, request, actorUserId, await NextReceiptNoAsync(cancellationToken));
        row.Status = "PAID";
        await _db.SaveChangesAsync(cancellationToken);
        return MapAccommodation(row);
    }

    public async Task<NmAccommodationRowDto> CancelAccommodationAsync(
        long id, long? actorUserId, CancellationToken cancellationToken)
    {
        var row = await _db.NmAccommodationBookings.Include(x => x.Account)
            .FirstOrDefaultAsync(x => x.NmAccommodationBookingId == id, cancellationToken)
            ?? throw new InvalidOperationException("Booking was not found.");
        if (row.Status == "PAID")
            throw new InvalidOperationException("Paid bookings cannot be cancelled — use refund.");
        row.Status = "CANCELLED";
        row.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);
        return MapAccommodation(row);
    }

    public async Task<PagedResult<NmCorkageRowDto>> ListCorkageAsync(
        NmListFilter filter, PagedRequest paging, CancellationToken cancellationToken)
    {
        var q = _db.NmCorkageCharges.AsNoTracking().Include(x => x.Account).AsQueryable();
        if (filter.AccountId is long accountId) q = q.Where(x => x.AccountId == accountId);
        if (filter.From is DateOnly from)
        {
            var fromDt = from.ToDateTime(TimeOnly.MinValue);
            q = q.Where(x => x.CreatedAt >= fromDt);
        }
        if (filter.To is DateOnly to)
        {
            var toDt = to.ToDateTime(TimeOnly.MaxValue);
            q = q.Where(x => x.CreatedAt <= toDt);
        }
        if (!string.IsNullOrWhiteSpace(filter.Status)) q = q.Where(x => x.Status == filter.Status.Trim().ToUpperInvariant());
        if (!string.IsNullOrWhiteSpace(filter.PaymentMethod)) q = q.Where(x => x.PaymentMethod == filter.PaymentMethod);
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim().ToLowerInvariant();
            q = q.Where(x =>
                x.PayerName.ToLower().Contains(term)
                || x.ItemDescription.ToLower().Contains(term)
                || (x.ReceiptNo != null && x.ReceiptNo.ToLower().Contains(term)));
        }
        var total = await q.CountAsync(cancellationToken);
        var rows = await q.OrderByDescending(x => x.CreatedAt).Skip(paging.Skip).Take(paging.PageSize).ToListAsync(cancellationToken);
        return Paging.Create(rows.Select(MapCorkage).ToList(), paging, total);
    }

    public async Task<NmCorkageRowDto> CreateCorkageAsync(
        NmCorkageCreateRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.PayerName))
            throw new InvalidOperationException("Payer name is required.");
        if (string.IsNullOrWhiteSpace(request.ItemDescription))
            throw new InvalidOperationException("Item description is required.");
        if (request.FeeAmount <= 0)
            throw new InvalidOperationException("Fee amount must be greater than zero.");
        if (request.AuthorizedByManager && string.IsNullOrWhiteSpace(request.ManagerName))
            throw new InvalidOperationException("Manager name is required when authorized by manager.");

        var row = new NmCorkageCharge
        {
            PayerName = request.PayerName.Trim(),
            AccountId = request.IsGuest ? null : request.AccountId,
            IsGuest = request.IsGuest || request.AccountId is null,
            ItemDescription = request.ItemDescription.Trim(),
            FeeAmount = request.FeeAmount,
            AuthorizedByManager = request.AuthorizedByManager,
            ManagerName = request.ManagerName?.Trim(),
            Status = "PENDING",
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId
        };
        _db.NmCorkageCharges.Add(row);
        await _db.SaveChangesAsync(cancellationToken);
        await _db.Entry(row).Reference(x => x.Account).LoadAsync(cancellationToken);
        return MapCorkage(row);
    }

    public async Task<NmCorkageRowDto> PayCorkageAsync(
        long id, NmPayRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var row = await _db.NmCorkageCharges.Include(x => x.Account)
            .FirstOrDefaultAsync(x => x.NmCorkageChargeId == id, cancellationToken)
            ?? throw new InvalidOperationException("Corkage charge was not found.");
        if (row.Status != "PENDING")
            throw new InvalidOperationException("Only pending corkage charges can be paid.");
        ApplyPayment(row, request, actorUserId, await NextReceiptNoAsync(cancellationToken));
        row.Status = "PAID";
        await _db.SaveChangesAsync(cancellationToken);
        return MapCorkage(row);
    }

    public async Task<PagedResult<NmCustomRowDto>> ListCustomAsync(
        NmListFilter filter, PagedRequest paging, CancellationToken cancellationToken)
    {
        var q = _db.NmCustomCharges.AsNoTracking().Include(x => x.Account).Include(x => x.LineItems).AsQueryable();
        if (filter.AccountId is long accountId) q = q.Where(x => x.AccountId == accountId);
        if (filter.From is DateOnly from)
        {
            var fromDt = from.ToDateTime(TimeOnly.MinValue);
            q = q.Where(x => x.CreatedAt >= fromDt);
        }
        if (filter.To is DateOnly to)
        {
            var toDt = to.ToDateTime(TimeOnly.MaxValue);
            q = q.Where(x => x.CreatedAt <= toDt);
        }
        if (!string.IsNullOrWhiteSpace(filter.Status)) q = q.Where(x => x.Status == filter.Status.Trim().ToUpperInvariant());
        if (!string.IsNullOrWhiteSpace(filter.PaymentMethod)) q = q.Where(x => x.PaymentMethod == filter.PaymentMethod);
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim().ToLowerInvariant();
            q = q.Where(x =>
                x.PayerName.ToLower().Contains(term)
                || x.Category.ToLower().Contains(term)
                || (x.ReceiptNo != null && x.ReceiptNo.ToLower().Contains(term)));
        }
        var total = await q.CountAsync(cancellationToken);
        var rows = await q.OrderByDescending(x => x.CreatedAt).Skip(paging.Skip).Take(paging.PageSize).ToListAsync(cancellationToken);
        return Paging.Create(rows.Select(MapCustom).ToList(), paging, total);
    }

    public async Task<NmCustomRowDto> CreateCustomAsync(
        NmCustomCreateRequest request, long? actorUserId, string? username, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.PayerName))
            throw new InvalidOperationException("Payer name is required.");
        var category = (request.Category ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        if (category is not ("FACILITY_HIRE" or "EVENT_SPACE_DEPOSIT" or "DAMAGE_FEE" or "GUEST_DAY_PASS"))
            throw new InvalidOperationException("Invalid custom charge category.");
        if (request.LineItems is null || request.LineItems.Count == 0)
            throw new InvalidOperationException("Add at least one line item.");

        var lines = new List<NmCustomChargeLine>();
        decimal total = 0;
        foreach (var line in request.LineItems)
        {
            if (string.IsNullOrWhiteSpace(line.Description))
                throw new InvalidOperationException("Each line needs a description.");
            if (line.UnitPrice < 0 || line.Quantity <= 0)
                throw new InvalidOperationException("Line price/quantity is invalid.");
            var sub = Math.Round(line.UnitPrice * line.Quantity, 2);
            total += sub;
            lines.Add(new NmCustomChargeLine
            {
                Description = line.Description.Trim(),
                UnitPrice = line.UnitPrice,
                Quantity = line.Quantity,
                Subtotal = sub
            });
        }

        var row = new NmCustomCharge
        {
            PayerName = request.PayerName.Trim(),
            AccountId = request.AccountId,
            Category = category,
            TotalAmount = total,
            Status = "PENDING",
            CreatedByUsername = username,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = actorUserId,
            LineItems = lines
        };
        _db.NmCustomCharges.Add(row);
        await _db.SaveChangesAsync(cancellationToken);
        await _db.Entry(row).Reference(x => x.Account).LoadAsync(cancellationToken);
        return MapCustom(row);
    }

    public async Task<NmCustomRowDto> PayCustomAsync(
        long id, NmPayRequest request, long? actorUserId, CancellationToken cancellationToken)
    {
        var row = await _db.NmCustomCharges.Include(x => x.Account).Include(x => x.LineItems)
            .FirstOrDefaultAsync(x => x.NmCustomChargeId == id, cancellationToken)
            ?? throw new InvalidOperationException("Custom charge was not found.");
        if (row.Status != "PENDING")
            throw new InvalidOperationException("Only pending custom charges can be paid.");
        ApplyPayment(row, request, actorUserId, await NextReceiptNoAsync(cancellationToken));
        row.Status = "PAID";
        await _db.SaveChangesAsync(cancellationToken);
        return MapCustom(row);
    }

    public async Task<NmReceiptDto> GetReceiptAsync(string kind, long id, CancellationToken cancellationToken)
    {
        var k = (kind ?? "").Trim().ToLowerInvariant();
        if (k is "accommodation" or "acc")
        {
            var row = await _db.NmAccommodationBookings.AsNoTracking().Include(x => x.Account)
                .FirstOrDefaultAsync(x => x.NmAccommodationBookingId == id, cancellationToken)
                ?? throw new InvalidOperationException("Booking was not found.");
            return new NmReceiptDto(
                "accommodation", row.NmAccommodationBookingId, row.GuestName, row.Account?.MembershipNo,
                $"Room {row.RoomNumber ?? "—"} · {row.NumberOfNights} night(s) · {row.CheckInDate:yyyy-MM-dd} to {row.CheckOutDate:yyyy-MM-dd}",
                row.TotalAmount, row.Status, row.ReceiptNo, row.PaidAt, row.PaymentMethod, row.ReferenceCode, row.CreatedAt);
        }
        if (k is "corkage" or "cork")
        {
            var row = await _db.NmCorkageCharges.AsNoTracking().Include(x => x.Account)
                .FirstOrDefaultAsync(x => x.NmCorkageChargeId == id, cancellationToken)
                ?? throw new InvalidOperationException("Corkage charge was not found.");
            return new NmReceiptDto(
                "corkage", row.NmCorkageChargeId, row.PayerName, row.Account?.MembershipNo,
                row.ItemDescription, row.FeeAmount, row.Status, row.ReceiptNo, row.PaidAt, row.PaymentMethod, row.ReferenceCode, row.CreatedAt);
        }
        if (k is "custom")
        {
            var row = await _db.NmCustomCharges.AsNoTracking().Include(x => x.Account).Include(x => x.LineItems)
                .FirstOrDefaultAsync(x => x.NmCustomChargeId == id, cancellationToken)
                ?? throw new InvalidOperationException("Custom charge was not found.");
            var desc = string.Join("; ", row.LineItems.Select(l => $"{l.Description} × {l.Quantity}"));
            return new NmReceiptDto(
                "custom", row.NmCustomChargeId, row.PayerName, row.Account?.MembershipNo,
                $"{row.Category}: {desc}", row.TotalAmount, row.Status, row.ReceiptNo, row.PaidAt, row.PaymentMethod, row.ReferenceCode, row.CreatedAt);
        }
        throw new InvalidOperationException("Unknown receipt kind.");
    }

    public async Task SettleFromMemberPaymentAsync(
        long accountId,
        string feeTypeCode,
        decimal amount,
        string paymentMethodCode,
        string? referenceCode,
        long? nmChargeId,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var fee = (feeTypeCode ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        var method = MapMemberMethod(paymentMethodCode);
        var reference = referenceCode?.Trim();
        if (method is not "CASH" && string.IsNullOrWhiteSpace(reference))
            reference = $"MEMBER-{DateTime.UtcNow:yyyyMMddHHmmss}";
        var pay = new NmPayRequest(method, reference);

        if (fee is "ACCOMMODATION" or "ROOM")
        {
            var id = nmChargeId;
            if (id is null)
            {
                id = await _db.NmAccommodationBookings
                    .Where(x => x.AccountId == accountId && x.Status == "PENDING_ADVANCE_PAYMENT")
                    .OrderBy(x => x.CreatedAt)
                    .Select(x => (long?)x.NmAccommodationBookingId)
                    .FirstOrDefaultAsync(cancellationToken);
            }
            if (id is long bookingId)
                await PayAccommodationAsync(bookingId, pay, actorUserId, cancellationToken);
            return;
        }

        if (fee is "CORKAGE")
        {
            var id = nmChargeId;
            if (id is null)
            {
                id = await _db.NmCorkageCharges
                    .Where(x => x.AccountId == accountId && x.Status == "PENDING")
                    .OrderBy(x => x.CreatedAt)
                    .Select(x => (long?)x.NmCorkageChargeId)
                    .FirstOrDefaultAsync(cancellationToken);
            }
            if (id is long corkId)
                await PayCorkageAsync(corkId, pay, actorUserId, cancellationToken);
            return;
        }

        if (fee is "OTHER" or "CUSTOM")
        {
            var id = nmChargeId;
            if (id is null)
            {
                id = await _db.NmCustomCharges
                    .Where(x => x.AccountId == accountId && x.Status == "PENDING")
                    .OrderBy(x => x.CreatedAt)
                    .Select(x => (long?)x.NmCustomChargeId)
                    .FirstOrDefaultAsync(cancellationToken);
            }
            if (id is long customId)
                await PayCustomAsync(customId, pay, actorUserId, cancellationToken);
        }
    }

    private static string MapMemberMethod(string? code)
    {
        var key = (code ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        return key switch
        {
            "MPESA" or "MPESA_EXPRESS" or "MPESA_STK" or "STK" => "MPESA_MANUAL",
            "MPESA_MANUAL" => "MPESA_MANUAL",
            "CARD" or "CREDIT" or "CREDIT_CARD" or "DEBIT" or "DEBIT_CARD" => "CARD",
            "CHEQUE" or "CHEQUE_PAYMENT" => "CHEQUE",
            "CLUB_CARD" or "ACCOUNT_BALANCE" or "CLUB_CREDIT" or "MEMBER_ACCOUNT" or "CASH" => "CASH",
            _ => "CASH",
        };
    }

    private async Task<string> NextReceiptNoAsync(CancellationToken cancellationToken)
    {
        var acc = await _db.NmAccommodationBookings.AsNoTracking()
            .Where(x => x.ReceiptNo != null).Select(x => x.ReceiptNo!).ToListAsync(cancellationToken);
        var cork = await _db.NmCorkageCharges.AsNoTracking()
            .Where(x => x.ReceiptNo != null).Select(x => x.ReceiptNo!).ToListAsync(cancellationToken);
        var custom = await _db.NmCustomCharges.AsNoTracking()
            .Where(x => x.ReceiptNo != null).Select(x => x.ReceiptNo!).ToListAsync(cancellationToken);
        var finance = await _db.Receipts.AsNoTracking().Select(r => r.ReceiptNumber).ToListAsync(cancellationToken);
        var max = 0;
        foreach (var no in acc.Concat(cork).Concat(custom).Concat(finance))
        {
            var digits = new string((no ?? "").Where(char.IsDigit).ToArray());
            if (int.TryParse(digits, out var n) && n > max) max = n;
        }
        return $"RCT-{(max + 1):D6}";
    }

    private static string NormalizeMethod(string? raw)
    {
        var code = (raw ?? "").Trim().ToUpperInvariant().Replace("-", "_").Replace(" ", "_");
        return code switch
        {
            "MPESA_EXPRESS" or "MPESA_STK" or "STK" => "MPESA_EXPRESS",
            "MPESA_MANUAL" or "MPESA" or "MPESA_REF" => "MPESA_MANUAL",
            "CREDIT" or "DEBIT" or "CREDIT_CARD" or "DEBIT_CARD" => "CARD",
            "CASH" or "CHEQUE" or "CARD" => code,
            _ => throw new InvalidOperationException("Unsupported payment method.")
        };
    }

    private static void ApplyPayment(NmAccommodationBooking row, NmPayRequest request, long? actorUserId, string receiptNo)
    {
        var method = NormalizeMethod(request.PaymentMethod);
        if (method is not "CASH" && string.IsNullOrWhiteSpace(request.ReferenceCode))
            throw new InvalidOperationException("Reference code is required for this payment method.");
        row.PaymentMethod = method;
        row.ReferenceCode = request.ReferenceCode?.Trim();
        row.ReceiptNo = receiptNo;
        row.PaidAt = DateTime.UtcNow;
        row.UpdatedByUserId = actorUserId;
    }

    private static void ApplyPayment(NmCorkageCharge row, NmPayRequest request, long? actorUserId, string receiptNo)
    {
        var method = NormalizeMethod(request.PaymentMethod);
        if (method is not "CASH" && string.IsNullOrWhiteSpace(request.ReferenceCode))
            throw new InvalidOperationException("Reference code is required for this payment method.");
        row.PaymentMethod = method;
        row.ReferenceCode = request.ReferenceCode?.Trim();
        row.ReceiptNo = receiptNo;
        row.PaidAt = DateTime.UtcNow;
        row.UpdatedByUserId = actorUserId;
    }

    private static void ApplyPayment(NmCustomCharge row, NmPayRequest request, long? actorUserId, string receiptNo)
    {
        var method = NormalizeMethod(request.PaymentMethod);
        if (method is not "CASH" && string.IsNullOrWhiteSpace(request.ReferenceCode))
            throw new InvalidOperationException("Reference code is required for this payment method.");
        row.PaymentMethod = method;
        row.ReferenceCode = request.ReferenceCode?.Trim();
        row.ReceiptNo = receiptNo;
        row.PaidAt = DateTime.UtcNow;
        row.UpdatedByUserId = actorUserId;
    }

    private static NmAccommodationRowDto MapAccommodation(
        NmAccommodationBooking x,
        IReadOnlyDictionary<long, (string Status, string? RoomType)>? stays = null)
    {
        string? stayStatus = null;
        string? roomType = null;
        if (x.AccommodationBookingId is long stayId && stays is not null && stays.TryGetValue(stayId, out var stay))
        {
            stayStatus = stay.Status;
            roomType = stay.RoomType;
        }

        return new(
            x.NmAccommodationBookingId, x.GuestName, x.Phone, x.Email, x.AccountId, x.Account?.MembershipNo,
            x.IsGuest, x.CheckInDate, x.CheckOutDate, x.NumberOfNights, x.RoomNumber, x.NightlyRate,
            x.ExtraCharges, x.TotalAmount, x.IsPaidInAdvance, x.Status, x.ReceiptNo, x.PaidAt,
            x.PaymentMethod, x.ReferenceCode, x.CreatedAt, x.AccommodationBookingId, stayStatus, roomType);
    }

    private static NmCorkageRowDto MapCorkage(NmCorkageCharge x) => new(
        x.NmCorkageChargeId, x.PayerName, x.AccountId, x.Account?.MembershipNo, x.IsGuest,
        x.ItemDescription, x.FeeAmount, x.AuthorizedByManager, x.ManagerName, x.Status,
        x.ReceiptNo, x.PaidAt, x.PaymentMethod, x.ReferenceCode, x.CreatedAt);

    private static NmCustomRowDto MapCustom(NmCustomCharge x) => new(
        x.NmCustomChargeId, x.PayerName, x.AccountId, x.Account?.MembershipNo, x.Category,
        x.TotalAmount, x.Status, x.ReceiptNo, x.PaidAt, x.PaymentMethod, x.ReferenceCode,
        x.CreatedByUsername, x.CreatedAt,
        x.LineItems.OrderBy(l => l.NmCustomChargeLineId)
            .Select(l => new NmCustomLineDto(l.NmCustomChargeLineId, l.Description, l.UnitPrice, l.Quantity, l.Subtotal))
            .ToList());
}
