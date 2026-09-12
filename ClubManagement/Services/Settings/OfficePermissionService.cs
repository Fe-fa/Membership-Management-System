using System.Text.Json;
using ClubManagement.Data.MembershipApplication;
using ClubManagement.DTOs.Settings;
using ClubManagement.Entities.Settings;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services.Settings;

public interface IOfficePermissionService
{
    Task<OfficePermissionMatrixDto> GetMatrixAsync(CancellationToken cancellationToken);
    Task<OfficePermissionMatrixDto> SaveMatrixAsync(
        SaveOfficePermissionMatrixRequest request,
        long? actorUserId,
        CancellationToken cancellationToken);
}

public class OfficePermissionService : IOfficePermissionService
{
    public const string SettingKey = "OFFICE_MODULE_PERMISSIONS";

    private static readonly string[] OfficeRoles =
    [
        "ADMIN",
        "GENERAL_MANAGER",
        "CHAIRMAN",
        "TREASURER",
        "COMMITTEE_MEMBER",
        "RECEPTIONIST"
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    private readonly ApplicationModuleDbContext _db;

    public OfficePermissionService(ApplicationModuleDbContext db) => _db = db;

    public async Task<OfficePermissionMatrixDto> GetMatrixAsync(CancellationToken cancellationToken)
    {
        var defaults = BuildDefaults();
        var stored = await _db.ClubSettings.AsNoTracking()
            .Where(s => s.IsActive && s.SettingKey == SettingKey)
            .OrderByDescending(s => s.ClubSettingId)
            .FirstOrDefaultAsync(cancellationToken);

        if (stored is null || string.IsNullOrWhiteSpace(stored.SettingValue))
            return defaults;

        try
        {
            var parsed = JsonSerializer.Deserialize<OfficePermissionMatrixDto>(stored.SettingValue, JsonOptions);
            if (parsed?.Modules is null || parsed.Modules.Count == 0)
                return defaults;
            return MergeWithCatalog(parsed);
        }
        catch (JsonException)
        {
            return defaults;
        }
    }

    public async Task<OfficePermissionMatrixDto> SaveMatrixAsync(
        SaveOfficePermissionMatrixRequest request,
        long? actorUserId,
        CancellationToken cancellationToken)
    {
        var catalog = BuildDefaults();
        var byId = catalog.Modules.ToDictionary(m => m.ModuleId, StringComparer.OrdinalIgnoreCase);
        var savedModules = new List<OfficeModulePermissionDto>();

        foreach (var incoming in request.Modules ?? [])
        {
            if (!byId.TryGetValue(incoming.ModuleId, out var catalogRow)) continue;
            var access = new Dictionary<string, OfficeAccessDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var role in OfficeRoles)
            {
                incoming.Access.TryGetValue(role, out var cell);
                var view = cell?.View == true;
                var write = cell?.Write == true;
                // Write implies view.
                if (write) view = true;
                access[role] = new OfficeAccessDto { View = view, Write = write };
            }

            savedModules.Add(new OfficeModulePermissionDto
            {
                ModuleId = catalogRow.ModuleId,
                Title = catalogRow.Title,
                Description = catalogRow.Description,
                Access = access
            });
        }

        // Keep any catalog modules missing from the payload.
        foreach (var catalogRow in catalog.Modules)
        {
            if (savedModules.Any(m => string.Equals(m.ModuleId, catalogRow.ModuleId, StringComparison.OrdinalIgnoreCase)))
                continue;
            savedModules.Add(catalogRow);
        }

        var matrix = new OfficePermissionMatrixDto
        {
            RoleCodes = OfficeRoles,
            Modules = savedModules
        };

        var json = JsonSerializer.Serialize(matrix, JsonOptions);
        var existing = await _db.ClubSettings
            .Where(s => s.SettingKey == SettingKey)
            .OrderByDescending(s => s.ClubSettingId)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing is null)
        {
            _db.ClubSettings.Add(new ClubSetting
            {
                TenantId = 1,
                SettingKey = SettingKey,
                SettingValue = json,
                Description = "Office/staff module view & write permissions by System_role.",
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = actorUserId
            });
        }
        else
        {
            existing.SettingValue = json;
            existing.IsActive = true;
            existing.Description = "Office/staff module view & write permissions by System_role.";
            existing.UpdatedByUserId = actorUserId;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return matrix;
    }

    private static OfficePermissionMatrixDto MergeWithCatalog(OfficePermissionMatrixDto stored)
    {
        var defaults = BuildDefaults();
        var storedById = stored.Modules.ToDictionary(m => m.ModuleId, StringComparer.OrdinalIgnoreCase);
        var modules = new List<OfficeModulePermissionDto>();

        foreach (var catalogRow in defaults.Modules)
        {
            if (!storedById.TryGetValue(catalogRow.ModuleId, out var saved))
            {
                modules.Add(catalogRow);
                continue;
            }

            var access = new Dictionary<string, OfficeAccessDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var role in OfficeRoles)
            {
                if (saved.Access.TryGetValue(role, out var cell))
                {
                    var view = cell.View;
                    var write = cell.Write;
                    if (write) view = true;
                    access[role] = new OfficeAccessDto { View = view, Write = write };
                }
                else if (catalogRow.Access.TryGetValue(role, out var fallback))
                {
                    access[role] = fallback;
                }
                else
                {
                    access[role] = new OfficeAccessDto();
                }
            }

            modules.Add(new OfficeModulePermissionDto
            {
                ModuleId = catalogRow.ModuleId,
                Title = catalogRow.Title,
                Description = catalogRow.Description,
                Access = access
            });
        }

        return new OfficePermissionMatrixDto
        {
            RoleCodes = OfficeRoles,
            Modules = modules
        };
    }

    private static OfficePermissionMatrixDto BuildDefaults()
    {
        OfficeAccessDto VW() => new() { View = true, Write = true };
        OfficeAccessDto V() => new() { View = true, Write = false };
        OfficeAccessDto N() => new() { View = false, Write = false };

        OfficeModulePermissionDto Mod(
            string id,
            string title,
            string description,
            Dictionary<string, OfficeAccessDto> access) =>
            new()
            {
                ModuleId = id,
                Title = title,
                Description = description,
                Access = access
            };

        var modules = new List<OfficeModulePermissionDto>
        {
            Mod("guest-visits", "Guest visits", "Reception guest book and accompanied visits.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = V(),
                ["TREASURER"] = N(), ["COMMITTEE_MEMBER"] = N(), ["RECEPTIONIST"] = VW()
            }),
            Mod("members", "Members", "Applications, register, privileges & member desk.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = VW(),
                ["TREASURER"] = V(), ["COMMITTEE_MEMBER"] = V(), ["RECEPTIONIST"] = N()
            }),
            Mod("manager-queue", "Manager Review", "Manager review queue for membership applications.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = V(),
                ["TREASURER"] = N(), ["COMMITTEE_MEMBER"] = N(), ["RECEPTIONIST"] = N()
            }),
            Mod("finance", "Financial & Payments", "Subscriptions, receipts, cheque & credit approvals.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = V(),
                ["TREASURER"] = VW(), ["COMMITTEE_MEMBER"] = N(), ["RECEPTIONIST"] = N()
            }),
            Mod("committee-manage", "Committee manage", "Terms, sittings, interview scheduling.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = VW(),
                ["TREASURER"] = N(), ["COMMITTEE_MEMBER"] = V(), ["RECEPTIONIST"] = N()
            }),
            Mod("agm-election", "AGM/EGM Election", "Notices, nominations, e-ballot, tally and minutes.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = VW(),
                ["TREASURER"] = V(), ["COMMITTEE_MEMBER"] = V(), ["RECEPTIONIST"] = N()
            }),
            Mod("committee-ballot", "Committee Ballot", "Article 6 membership admission ballot.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = VW(),
                ["TREASURER"] = N(), ["COMMITTEE_MEMBER"] = VW(), ["RECEPTIONIST"] = N()
            }),
            Mod("accommodation", "Accommodation", "Rooms, occupancy and bookings.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = V(),
                ["TREASURER"] = V(), ["COMMITTEE_MEMBER"] = N(), ["RECEPTIONIST"] = VW()
            }),
            Mod("support", "Support", "Help desk, tickets and member queries.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = V(),
                ["TREASURER"] = N(), ["COMMITTEE_MEMBER"] = N(), ["RECEPTIONIST"] = V()
            }),
            Mod("setting", "Setting", "RBAC, accounts, lookups and club preferences.", new(StringComparer.OrdinalIgnoreCase)
            {
                ["ADMIN"] = VW(), ["GENERAL_MANAGER"] = VW(), ["CHAIRMAN"] = VW(),
                ["TREASURER"] = N(), ["COMMITTEE_MEMBER"] = N(), ["RECEPTIONIST"] = N()
            }),
        };

        return new OfficePermissionMatrixDto
        {
            RoleCodes = OfficeRoles,
            Modules = modules
        };
    }
}
