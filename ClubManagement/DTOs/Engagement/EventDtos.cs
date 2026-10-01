namespace ClubManagement.DTOs.Engagement;

public record EventSummaryDto(
    int TotalEvents,
    int UpcomingEvents,
    int OngoingEvents,
    int CompletedEvents,
    int TotalRegistrations,
    int PendingRegistrations,
    int TodaysEvents);

public record MemberEventSummaryDto(
    int UpcomingEvents,
    int MyRegistrations,
    int AttendedEvents,
    int PendingRegistrations);

public record EventCategoryDto(
    long Id,
    string Code,
    string Name,
    int SortOrder,
    bool IsActive,
    int EventCount);

public record SaveEventCategoryRequest(string Name, bool IsActive = true);

public record EventRegistrationDto(
    long Id,
    long EventId,
    long AccountId,
    string MemberName,
    string? MembershipNo,
    string? Email,
    string? Phone,
    string Status,
    string PaymentStatus,
    DateTime RegisteredAt,
    string? TicketCode,
    int GuestCount,
    string? GuestName,
    string? AttendanceStatus,
    DateTime? CheckedInAt);

public record ClubEventDetailDto(
    long Id,
    string Title,
    string? Description,
    string? CategoryCode,
    string? CategoryName,
    string? ImageUrl,
    DateTime StartsAt,
    DateTime? EndsAt,
    string? Venue,
    int? Capacity,
    DateTime? RegistrationDeadline,
    decimal? Fee,
    bool RequireRegistration,
    bool RequireApproval,
    bool AllowGuestRegistration,
    string Status,
    string DisplayStatus,
    bool IsPublished,
    int RegisteredCount,
    int ApprovedCount,
    int PendingCount,
    int? AvailableSeats,
    string? CreatedByName,
    long? CreatedByUserId,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    string? RegistrationBlockReason,
    EventRegistrationDto? MyRegistration);

public record SaveEventRequest(
    string Title,
    string? Description,
    string? CategoryCode,
    string? ImageUrl,
    DateTime StartsAt,
    DateTime? EndsAt,
    string? Venue,
    int? Capacity,
    DateTime? RegistrationDeadline,
    decimal? Fee,
    bool RequireRegistration,
    bool RequireApproval,
    bool AllowGuestRegistration,
    string? Status);

public record RegisterForEventRequest(string? GuestName);

public record MarkAttendanceRequest(long? AccountId, string? TicketCode, string Status);

public record MarkPaymentRequest(string PaymentStatus);

public record EventAnnouncementRequest(string Message, string? Audience);

public record RegistrationBoardDto(
    long? EventId,
    string? EventTitle,
    int TotalRegistered,
    int Approved,
    int Pending,
    int Rejected,
    int Cancelled,
    int? AvailableSeats,
    IReadOnlyList<EventRegistrationDto> Rows);

public record AttendanceBoardDto(
    long? EventId,
    string? EventTitle,
    int Expected,
    int Registered,
    int CheckedIn,
    int Absent,
    IReadOnlyList<EventRegistrationDto> Rows);

public record EventReportRowDto(
    long EventId,
    string Title,
    string DisplayStatus,
    DateTime StartsAt,
    int Registrations,
    int Present,
    int Absent,
    decimal AttendanceRate,
    decimal NoShowRate);

public record EventTrendPointDto(string Month, int Registrations);

public record EventReportDto(
    EventSummaryDto Summary,
    IReadOnlyList<EventReportRowDto> Events,
    IReadOnlyList<EventTrendPointDto> RegistrationTrend);

public class EventConflictException : Exception
{
    public EventConflictException(string message) : base(message) { }
}
