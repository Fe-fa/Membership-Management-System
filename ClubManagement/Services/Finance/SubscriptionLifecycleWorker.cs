namespace ClubManagement.Services.Finance;

/// <summary>
/// Periodically enforces the Aero Club annual subscription lifecycle:
/// 1 Jan generate unpaid subscriptions → after 28 Feb POSTED → after 30 Apr REMOVED.
/// </summary>
public class SubscriptionLifecycleWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private static readonly TimeSpan StartupDelay = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<SubscriptionLifecycleWorker> _logger;

    public SubscriptionLifecycleWorker(
        IServiceScopeFactory scopes,
        ILogger<SubscriptionLifecycleWorker> logger)
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
                var finance = scope.ServiceProvider.GetRequiredService<IFinanceService>();
                var result = await finance.EnforceSubscriptionLifecycleAsync(stoppingToken);
                if (result.TotalUpdated > 0)
                {
                    _logger.LogInformation(
                        "Subscription lifecycle {Year} as of {AsOf}: generated={Generated}, posted={Posted}, removed={Removed}",
                        result.Year,
                        result.AsOf,
                        result.SubscriptionsGenerated,
                        result.MembersPosted,
                        result.MembersRemoved);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Subscription lifecycle enforcement failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
