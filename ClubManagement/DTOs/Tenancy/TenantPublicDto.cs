namespace ClubManagement.DTOs.Tenancy;

public record TenantPublicDto(
    long TenantId,
    string Code,
    string Name,
    string? ShortName,
    string? ContactEmail,
    string? ContactPhone,
    string? AddressLine,
    string? LogoUrl,
    long? CountryId,
    string? CountryCode,
    string? CountryName,
    string? CurrencyCode);
