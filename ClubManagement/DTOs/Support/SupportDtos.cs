namespace ClubManagement.DTOs.Support;

public record SupportCategoryContactDto(string Name, string Email, string? CompanyName);

public record SupportCategoryDto(
    string RoleCode,
    string RoleName,
    IReadOnlyList<SupportCategoryContactDto> Contacts);

public record SupportTicketMessageDto(
    long MessageId,
    string AuthorName,
    bool IsStaff,
    string Body,
    DateTime CreatedAt);

public record SupportTicketListItemDto(
    long TicketId,
    string TicketNo,
    string Subject,
    string CategoryRoleCode,
    string CategoryRoleName,
    string? CategoryEmail,
    string? CategoryAssigneeName,
    string Priority,
    string Status,
    string CreatedByName,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public record SupportTicketDetailDto(
    long TicketId,
    string TicketNo,
    string Subject,
    string? Description,
    string CategoryRoleCode,
    string CategoryRoleName,
    string? CategoryEmail,
    string? CategoryAssigneeName,
    string Priority,
    string Status,
    string CreatedByName,
    long CreatedByUserId,
    string? AttachmentFileName,
    string? AttachmentUrl,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    IReadOnlyList<SupportTicketMessageDto> Messages);

public record SupportDashboardDto(
    int Open,
    int InProgress,
    int Resolved,
    int Closed,
    int SubmittedToday,
    int Total,
    IReadOnlyList<SupportNamedCountDto> ByCategory,
    IReadOnlyList<SupportNamedCountDto> ByPriority);

public record SupportNamedCountDto(string Name, int Count);

public class CreateSupportTicketRequest
{
    public string Subject { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string CategoryRoleCode { get; set; } = string.Empty;
    public string? Priority { get; set; }
}

public class ReplySupportTicketRequest
{
    public string Body { get; set; } = string.Empty;
}

public class ChangeSupportTicketStatusRequest
{
    public string Status { get; set; } = string.Empty;
}
