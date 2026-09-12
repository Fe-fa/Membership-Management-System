using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities.Identity;
using ClubManagement.Entities.Lookups;
using ClubManagement.Entities.Subscriptions;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Settings;

public record LookupCatalogDto(string Key, string Label, string TableName, string Kind, string Description);

public record LookupRowDto(
    long Id,
    string Code,
    string Name,
    string? Description,
    int SortOrder,
    bool IsActive,
    long? MembershipTypeId = null,
    string? MembershipTypeName = null,
    decimal? JoiningFee = null,
    decimal? JoiningFeeUnder30 = null,
    decimal? AnnualSubscription = null,
    string? EffectiveDate = null);

public record LookupUpsertRequest(
    string? Code,
    string? Name,
    string? Description,
    int? SortOrder,
    bool? IsActive,
    long? MembershipTypeId,
    decimal? JoiningFee,
    decimal? JoiningFeeUnder30,
    decimal? AnnualSubscription,
    string? EffectiveDate);

public interface ILookupAdminService
{
    IReadOnlyList<LookupCatalogDto> ListCatalogs(string? search);
    Task<IReadOnlyList<LookupRowDto>> ListRowsAsync(string key, CancellationToken cancellationToken);
    Task<LookupRowDto> CreateAsync(string key, LookupUpsertRequest request, long? actorUserId, CancellationToken cancellationToken);
    Task<LookupRowDto> UpdateAsync(string key, long id, LookupUpsertRequest request, long? actorUserId, CancellationToken cancellationToken);
}

public class LookupAdminService : ILookupAdminService
{
    private static readonly LookupCatalogDto[] Catalogs =
    [
        new("membership-fee-schedule", "Membership fee schedule", "Membership_fee_schedule", "fee-schedule",
            "Official joining and annual tariffs by membership type (Full / Country / Overseas)."),
        new("membership-types", "Membership types", "Membership_type", "standard", "Full, Country, Overseas and related membership classes."),
        new("payment-status", "Payment statuses", "Payment_status", "standard", "PENDING, PAID, REJECTED and other payment lifecycle states."),
        new("payment-methods", "Payment methods", "Payment_method", "standard", "Cheque, M-Pesa, Cash, Card, bank transfer, etc."),
        new("fee-types", "Fee types", "Fee_type", "standard", "Joining / annual and other fee categories."),
        new("application-status", "Application statuses", "Application_status", "standard", "Draft, Submitted, Endorsement, Interview, Approved, etc."),
        new("member-statuses", "Member statuses", "Member_status", "standard", "Paid, posted, arrears and other member account states."),
        new("document-types", "Document types", "Document_type", "standard", "CV, ID, cheque copies, licence and other document kinds."),
        new("genders", "Genders", "Gender", "standard", "Gender lookup values."),
        new("blood-groups", "Blood groups", "blood_group", "standard", "Blood group lookup values."),
        new("marital-status", "Marital status", "Marital_status", "standard", "Marital status lookup values."),
        new("countries", "Countries", "Country", "standard", "Country list used on applications and profiles."),
        new("license-types", "License types", "License_type", "standard", "Pilot licence categories."),
        new("aircraft-types", "Aircraft types", "Aircraft_type", "standard", "Aircraft type lookup values."),
        new("affiliation-types", "Affiliation types", "Affiliation_type", "standard", "Club affiliation categories."),
        new("relationship-types", "Relationship types", "Relationship_type", "standard", "Emergency contact / relationship types."),
        new("club-types", "Club types", "Club_type", "standard", "Types of affiliated clubs."),
        new("election-types", "Election / class types", "Election_type", "standard", "Membership class / election types on applications."),
        new("guest-status", "Guest statuses", "Guest_status", "standard", "Guest visit statuses."),
        new("committee-roles", "Committee roles", "Committee_role", "standard", "Committee office roles."),
        new("meeting-types", "Meeting types", "Meeting_type", "standard", "Committee / AGM meeting types."),
        new("notification-types", "Notification types", "Notification_type", "standard", "In-app / email notification categories."),
        new("system-roles", "System roles", "System_role", "standard", "RBAC System_role catalog (codes used for authorization)."),
        new("account-types", "Account types", "Account_type", "standard", "Member account type lookup."),
        new("disciplinary-action-types", "Disciplinary action types", "Disciplinary_action_type", "standard", "Disciplinary action categories."),
        new("resolution-types", "Resolution types", "Resolution_type", "standard", "Meeting resolution categories."),
    ];

    private readonly ApplicationModuleDbContext _db;
    public LookupAdminService(ApplicationModuleDbContext db) => _db = db;

    public IReadOnlyList<LookupCatalogDto> ListCatalogs(string? search)
    {
        IEnumerable<LookupCatalogDto> rows = Catalogs;
        if (!string.IsNullOrWhiteSpace(search))
        {
            static string Normalize(string value) =>
                value.Replace('_', ' ').Replace('-', ' ').Replace("  ", " ").Trim();

            var term = Normalize(search);
            rows = rows.Where(c =>
            {
                var haystacks = new[]
                {
                    c.Key,
                    c.Label,
                    c.TableName,
                    c.Description,
                    Normalize(c.Key),
                    Normalize(c.Label),
                    Normalize(c.TableName),
                };
                return haystacks.Any(h => h.Contains(term, StringComparison.OrdinalIgnoreCase));
            });
        }
        return rows.OrderBy(c => c.Label).ToList();
    }

    public async Task<IReadOnlyList<LookupRowDto>> ListRowsAsync(string key, CancellationToken cancellationToken)
    {
        key = NormalizeKey(key);
        EnsureKnown(key);

        if (key == "membership-fee-schedule")
        {
            return await _db.MembershipFeeSchedules.AsNoTracking()
                .Include(x => x.MembershipType)
                .OrderBy(x => x.MembershipType.SortOrder)
                .ThenByDescending(x => x.EffectiveDate)
                .Select(x => new LookupRowDto(
                    x.MembershipFeeScheduleId,
                    x.MembershipType.Code,
                    x.MembershipType.Name,
                    null,
                    x.MembershipType.SortOrder,
                    x.IsActive,
                    x.MembershipTypeId,
                    x.MembershipType.Name,
                    x.JoiningFee,
                    x.JoiningFeeUnder30,
                    x.AnnualSubscription,
                    x.EffectiveDate.ToString("yyyy-MM-dd")))
                .ToListAsync(cancellationToken);
        }

        return key switch
        {
            "genders" => await MapAsync(_db.Genders, x => x.GenderId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "blood-groups" => await MapAsync(_db.BloodGroups, x => x.BloodGroupId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "marital-status" => await MapAsync(_db.MaritalStatuses, x => x.MaritalStatusId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "countries" => await _db.Countries.AsNoTracking().OrderBy(x => x.SortOrder).ThenBy(x => x.CountryName)
                .Select(x => new LookupRowDto(x.CountryId, x.CountryCode, x.CountryName, x.Description, x.SortOrder, x.IsActive)).ToListAsync(cancellationToken),
            "license-types" => await _db.LicenseTypes.AsNoTracking().OrderBy(x => x.Name)
                .Select(x => new LookupRowDto(x.LicenseTypeId, x.Code, x.Name, x.Description, 0, x.IsActive)).ToListAsync(cancellationToken),
            "aircraft-types" => await MapAsync(_db.AircraftTypes, x => x.AircraftTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "affiliation-types" => await MapAsync(_db.AffiliationTypes, x => x.AffiliationTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "relationship-types" => await MapAsync(_db.RelationshipTypes, x => x.RelationshipTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "club-types" => await MapAsync(_db.ClubTypes, x => x.ClubTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "membership-types" => await MapAsync(_db.MembershipTypes, x => x.MembershipTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "election-types" => await MapAsync(_db.ElectionTypes, x => x.ElectionTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "member-statuses" => await MapAsync(_db.MemberStatuses, x => x.MemberStatusId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "document-types" => await MapAsync(_db.DocumentTypes, x => x.DocumentTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "application-status" => await MapAsync(_db.ApplicationStatuses, x => x.ApplicationStatusId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "payment-methods" => await MapAsync(_db.PaymentMethods, x => x.PaymentMethodId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "payment-status" => await MapAsync(_db.PaymentStatuses, x => x.PaymentStatusId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "fee-types" => await MapAsync(_db.FeeTypes, x => x.FeeTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "guest-status" => await MapAsync(_db.GuestStatuses, x => x.GuestStatusId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "committee-roles" => await MapAsync(_db.CommitteeRoles, x => x.CommitteeRoleId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "meeting-types" => await MapAsync(_db.MeetingTypes, x => x.MeetingTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "notification-types" => await MapAsync(_db.NotificationTypes, x => x.NotificationTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "system-roles" => await MapAsync(_db.SystemRoles, x => x.SystemRoleId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "account-types" => await MapAsync(_db.AccountTypes, x => x.AccountTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "disciplinary-action-types" => await MapAsync(_db.DisciplinaryActionTypes, x => x.DisciplinaryActionTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            "resolution-types" => await MapAsync(_db.ResolutionTypes, x => x.ResolutionTypeId, x => x.Code, x => x.Name, x => x.Description, x => x.SortOrder, x => x.IsActive, cancellationToken),
            _ => throw new InvalidOperationException($"Lookup '{key}' is not editable."),
        };
    }

    public Task<LookupRowDto> CreateAsync(string key, LookupUpsertRequest request, long? actorUserId, CancellationToken cancellationToken) =>
        SaveAsync(NormalizeKey(key), 0, request, create: true, actorUserId, cancellationToken);

    public Task<LookupRowDto> UpdateAsync(string key, long id, LookupUpsertRequest request, long? actorUserId, CancellationToken cancellationToken) =>
        SaveAsync(NormalizeKey(key), id, request, create: false, actorUserId, cancellationToken);

    private async Task<LookupRowDto> SaveAsync(
        string key,
        long id,
        LookupUpsertRequest request,
        bool create,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        EnsureKnown(key);
        if (key == "membership-fee-schedule")
            return await SaveFeeScheduleAsync(id, request, create, actorUserId, cancellationToken);
        if (key == "countries")
            return await SaveCountryAsync(id, request, create, actorUserId, cancellationToken);
        if (key == "license-types")
            return await SaveLicenseTypeAsync(id, request, create, actorUserId, cancellationToken);

        return key switch
        {
            "genders" => await SaveStandardAsync(_db.Genders, id, create, request, actorUserId,
                () => new Gender { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.GenderId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "blood-groups" => await SaveStandardAsync(_db.BloodGroups, id, create, request, actorUserId,
                () => new BloodGroup { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.BloodGroupId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "marital-status" => await SaveStandardAsync(_db.MaritalStatuses, id, create, request, actorUserId,
                () => new MaritalStatus { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.MaritalStatusId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "aircraft-types" => await SaveStandardAsync(_db.AircraftTypes, id, create, request, actorUserId,
                () => new AircraftType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.AircraftTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "affiliation-types" => await SaveStandardAsync(_db.AffiliationTypes, id, create, request, actorUserId,
                () => new AffiliationType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.AffiliationTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "relationship-types" => await SaveStandardAsync(_db.RelationshipTypes, id, create, request, actorUserId,
                () => new RelationshipType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.RelationshipTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "club-types" => await SaveStandardAsync(_db.ClubTypes, id, create, request, actorUserId,
                () => new ClubType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.ClubTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "membership-types" => await SaveStandardAsync(_db.MembershipTypes, id, create, request, actorUserId,
                () => new MembershipType { CreatedAt = DateTime.UtcNow, TenantId = 1 },
                x => x.MembershipTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "election-types" => await SaveStandardAsync(_db.ElectionTypes, id, create, request, actorUserId,
                () => new ElectionType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.ElectionTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "member-statuses" => await SaveStandardAsync(_db.MemberStatuses, id, create, request, actorUserId,
                () => new MemberStatus { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.MemberStatusId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "document-types" => await SaveStandardAsync(_db.DocumentTypes, id, create, request, actorUserId,
                () => new DocumentType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.DocumentTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "application-status" => await SaveStandardAsync(_db.ApplicationStatuses, id, create, request, actorUserId,
                () => new ApplicationStatus { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.ApplicationStatusId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "payment-methods" => await SaveStandardAsync(_db.PaymentMethods, id, create, request, actorUserId,
                () => new PaymentMethod { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.PaymentMethodId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "payment-status" => await SaveStandardAsync(_db.PaymentStatuses, id, create, request, actorUserId,
                () => new PaymentStatus { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.PaymentStatusId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "fee-types" => await SaveStandardAsync(_db.FeeTypes, id, create, request, actorUserId,
                () => new FeeType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.FeeTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "guest-status" => await SaveStandardAsync(_db.GuestStatuses, id, create, request, actorUserId,
                () => new GuestStatus { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.GuestStatusId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "committee-roles" => await SaveStandardAsync(_db.CommitteeRoles, id, create, request, actorUserId,
                () => new CommitteeRole { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.CommitteeRoleId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "meeting-types" => await SaveStandardAsync(_db.MeetingTypes, id, create, request, actorUserId,
                () => new MeetingType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.MeetingTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "notification-types" => await SaveStandardAsync(_db.NotificationTypes, id, create, request, actorUserId,
                () => new NotificationType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.NotificationTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "system-roles" => await SaveStandardAsync(_db.SystemRoles, id, create, request, actorUserId,
                () => new SystemRole { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.SystemRoleId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "account-types" => await SaveStandardAsync(_db.AccountTypes, id, create, request, actorUserId,
                () => new AccountType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.AccountTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "disciplinary-action-types" => await SaveStandardAsync(_db.DisciplinaryActionTypes, id, create, request, actorUserId,
                () => new DisciplinaryActionType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.DisciplinaryActionTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            "resolution-types" => await SaveStandardAsync(_db.ResolutionTypes, id, create, request, actorUserId,
                () => new ResolutionType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId },
                x => x.ResolutionTypeId, x => x.Code, (x, v) => x.Code = v, x => x.Name, (x, v) => x.Name = v,
                (x, v) => x.Description = v, x => x.SortOrder, (x, v) => x.SortOrder = v, x => x.IsActive, (x, v) => x.IsActive = v,
                (x, u) => x.UpdatedByUserId = u, cancellationToken),
            _ => throw new InvalidOperationException($"Lookup '{key}' is not editable."),
        };
    }

    private async Task<LookupRowDto> SaveFeeScheduleAsync(
        long id,
        LookupUpsertRequest request,
        bool create,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        MembershipFeeSchedule entity;
        if (create)
        {
            if (request.MembershipTypeId is not long typeId || typeId <= 0)
                throw new InvalidOperationException("Select a membership type for the fee schedule row.");
            if (!await _db.MembershipTypes.AnyAsync(x => x.MembershipTypeId == typeId, cancellationToken))
                throw new InvalidOperationException("Membership type was not found.");
            entity = new MembershipFeeSchedule
            {
                MembershipTypeId = typeId,
                EffectiveDate = ParseDate(request.EffectiveDate) ?? DateOnly.FromDateTime(DateTime.UtcNow),
                IsActive = request.IsActive ?? true,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            };
            _db.MembershipFeeSchedules.Add(entity);
        }
        else
        {
            entity = await _db.MembershipFeeSchedules.FirstOrDefaultAsync(x => x.MembershipFeeScheduleId == id, cancellationToken)
                ?? throw new KeyNotFoundException("Row was not found.");
        }

        if (request.JoiningFee is decimal jf) entity.JoiningFee = jf;
        if (request.JoiningFeeUnder30 is decimal u30) entity.JoiningFeeUnder30 = u30;
        if (request.AnnualSubscription is decimal annual) entity.AnnualSubscription = annual;
        if (!string.IsNullOrWhiteSpace(request.EffectiveDate))
            entity.EffectiveDate = ParseDate(request.EffectiveDate) ?? entity.EffectiveDate;
        if (request.IsActive is bool active) entity.IsActive = active;
        if (request.MembershipTypeId is long mt && mt > 0) entity.MembershipTypeId = mt;
        entity.UpdatedByUserId = actorUserId;
        await _db.SaveChangesAsync(cancellationToken);

        var type = await _db.MembershipTypes.AsNoTracking()
            .FirstAsync(x => x.MembershipTypeId == entity.MembershipTypeId, cancellationToken);
        return new LookupRowDto(
            entity.MembershipFeeScheduleId,
            type.Code,
            type.Name,
            null,
            type.SortOrder,
            entity.IsActive,
            entity.MembershipTypeId,
            type.Name,
            entity.JoiningFee,
            entity.JoiningFeeUnder30,
            entity.AnnualSubscription,
            entity.EffectiveDate.ToString("yyyy-MM-dd"));
    }

    private async Task<LookupRowDto> SaveCountryAsync(long id, LookupUpsertRequest request, bool create, long? actorUserId, CancellationToken cancellationToken)
    {
        var code = NormalizeCode(request.Code);
        var name = (request.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(code)) throw new InvalidOperationException("Code is required.");
        if (string.IsNullOrWhiteSpace(name)) throw new InvalidOperationException("Name is required.");

        Country entity;
        if (create)
        {
            if ((await _db.Countries.AsNoTracking().ToListAsync(cancellationToken))
                .Any(x => string.Equals(x.CountryCode, code, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Code '{code}' already exists.");
            entity = new Country { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId };
            _db.Countries.Add(entity);
        }
        else
        {
            entity = await _db.Countries.FirstOrDefaultAsync(x => x.CountryId == id, cancellationToken)
                ?? throw new KeyNotFoundException("Row was not found.");
            if (!string.Equals(entity.CountryCode, code, StringComparison.OrdinalIgnoreCase)
                && (await _db.Countries.AsNoTracking().ToListAsync(cancellationToken))
                    .Any(x => x.CountryId != id && string.Equals(x.CountryCode, code, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Code '{code}' already exists.");
        }

        entity.CountryCode = code;
        entity.CountryName = name;
        entity.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        if (request.SortOrder is int sort) entity.SortOrder = sort;
        if (request.IsActive is bool active) entity.IsActive = active;
        entity.UpdatedByUserId = actorUserId;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return new LookupRowDto(entity.CountryId, entity.CountryCode, entity.CountryName, entity.Description, entity.SortOrder, entity.IsActive);
    }

    private async Task<LookupRowDto> SaveLicenseTypeAsync(long id, LookupUpsertRequest request, bool create, long? actorUserId, CancellationToken cancellationToken)
    {
        var code = NormalizeCode(request.Code);
        var name = (request.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(code)) throw new InvalidOperationException("Code is required.");
        if (string.IsNullOrWhiteSpace(name)) throw new InvalidOperationException("Name is required.");

        LicenseType entity;
        if (create)
        {
            if ((await _db.LicenseTypes.AsNoTracking().ToListAsync(cancellationToken))
                .Any(x => string.Equals(x.Code, code, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Code '{code}' already exists.");
            entity = new LicenseType { CreatedAt = DateTime.UtcNow, CreatedByUserId = actorUserId };
            _db.LicenseTypes.Add(entity);
        }
        else
        {
            entity = await _db.LicenseTypes.FirstOrDefaultAsync(x => x.LicenseTypeId == id, cancellationToken)
                ?? throw new KeyNotFoundException("Row was not found.");
            if (!string.Equals(entity.Code, code, StringComparison.OrdinalIgnoreCase)
                && (await _db.LicenseTypes.AsNoTracking().ToListAsync(cancellationToken))
                    .Any(x => x.LicenseTypeId != id && string.Equals(x.Code, code, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Code '{code}' already exists.");
        }

        entity.Code = code;
        entity.Name = name;
        entity.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        if (request.IsActive is bool active) entity.IsActive = active;
        entity.UpdatedByUserId = actorUserId;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return new LookupRowDto(entity.LicenseTypeId, entity.Code, entity.Name, entity.Description, 0, entity.IsActive);
    }

    private async Task<LookupRowDto> SaveStandardAsync<T>(
        DbSet<T> set,
        long id,
        bool create,
        LookupUpsertRequest request,
        long? actorUserId,
        Func<T> factory,
        Func<T, long> getId,
        Func<T, string> getCode,
        Action<T, string> setCode,
        Func<T, string> getName,
        Action<T, string> setName,
        Action<T, string?> setDescription,
        Func<T, int> getSort,
        Action<T, int> setSort,
        Func<T, bool> getActive,
        Action<T, bool> setActive,
        Action<T, long?> setUpdatedBy,
        CancellationToken cancellationToken) where T : class
    {
        var code = NormalizeCode(request.Code);
        var name = (request.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(code)) throw new InvalidOperationException("Code is required.");
        if (string.IsNullOrWhiteSpace(name)) throw new InvalidOperationException("Name is required.");

        var existing = await set.AsNoTracking().ToListAsync(cancellationToken);
        T entity;
        if (create)
        {
            if (existing.Any(x => string.Equals(getCode(x), code, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Code '{code}' already exists.");
            entity = factory();
            set.Add(entity);
        }
        else
        {
            // Primary-key lookup — a Func<T, long> cannot be translated by EF.
            entity = await set.FindAsync([id], cancellationToken)
                ?? throw new KeyNotFoundException("Row was not found.");
            if (!string.Equals(getCode(entity), code, StringComparison.OrdinalIgnoreCase)
                && existing.Any(x => getId(x) != id && string.Equals(getCode(x), code, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Code '{code}' already exists.");
        }

        setCode(entity, code);
        setName(entity, name);
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        setDescription(entity, description);
        if (request.SortOrder is int sort) setSort(entity, sort);
        if (request.IsActive is bool active) setActive(entity, active);
        setUpdatedBy(entity, actorUserId);
        await _db.SaveChangesAsync(cancellationToken);
        return new LookupRowDto(getId(entity), getCode(entity), getName(entity), description, getSort(entity), getActive(entity));
    }

    private static async Task<IReadOnlyList<LookupRowDto>> MapAsync<T>(
        IQueryable<T> query,
        Func<T, long> id,
        Func<T, string> code,
        Func<T, string> name,
        Func<T, string?> description,
        Func<T, int> sortOrder,
        Func<T, bool> isActive,
        CancellationToken cancellationToken) where T : class
    {
        var rows = await query.AsNoTracking().ToListAsync(cancellationToken);
        return rows
            .OrderBy(x => sortOrder(x))
            .ThenBy(x => name(x))
            .Select(x => new LookupRowDto(id(x), code(x), name(x), description(x), sortOrder(x), isActive(x)))
            .ToList();
    }

    private static void EnsureKnown(string key)
    {
        if (!Catalogs.Any(c => string.Equals(c.Key, key, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Unknown lookup '{key}'.");
    }

    private static string NormalizeKey(string key) => (key ?? "").Trim().ToLowerInvariant();
    private static string NormalizeCode(string? code) =>
        (code ?? "").Trim().ToUpperInvariant().Replace(' ', '_').Replace('-', '_');
    private static DateOnly? ParseDate(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : DateOnly.TryParse(value.Trim(), out var d) ? d : null;
}
