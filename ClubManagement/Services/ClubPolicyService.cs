using ClubManagement.Data.MembershipApplication;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Services;

public interface IClubPolicyService
{
    Task<int> GetIntAsync(string key, int fallback, CancellationToken cancellationToken);
}

public class ClubPolicyService : IClubPolicyService
{
    private readonly ApplicationModuleDbContext _db;
    public ClubPolicyService(ApplicationModuleDbContext db) => _db = db;

    public async Task<int> GetIntAsync(string key, int fallback, CancellationToken cancellationToken)
    {
        var row = await _db.ClubSettings.AsNoTracking()
            .Where(x => x.IsActive && x.SettingKey == key)
            .OrderByDescending(x => x.EffectiveDate)
            .FirstOrDefaultAsync(cancellationToken);
        return row is not null && int.TryParse(row.SettingValue, out var value) ? value : fallback;
    }
}
