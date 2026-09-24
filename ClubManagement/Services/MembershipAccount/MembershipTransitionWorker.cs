namespace ClubManagement.Services.MembershipAccount;

public class MembershipTransitionWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    private static readonly TimeSpan StartupDelay = TimeSpan.FromMinutes(2);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<MembershipTransitionWorker> _logger;

    public MembershipTransitionWorker(IServiceScopeFactory scopes, ILogger<MembershipTransitionWorker> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(StartupDelay, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            return;
        }

        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                await using var scope = _scopes.CreateAsyncScope();
                var transitions = scope.ServiceProvider.GetRequiredService<IMembershipTransitionService>();
                var converted = await transitions.ApplyDueSeniorLifeAsync(stoppingToken);
                if (converted > 0)
                    _logger.LogInformation("50-year Life conversion applied to {Count} member(s).", converted);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Senior Life conversion run failed.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
