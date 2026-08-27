namespace ClubManagement.DTOs.Tenancy;

public record TenantPublicDto(
    long TenantId,
    string Code,
    string Name,
    string? ShortName,
    string? ContactEmail,
    string? ContactPhone,
    string? AddressLine);
