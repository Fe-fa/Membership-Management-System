namespace ClubManagement.Services.Engagement;

public class EventReminderWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private static readonly TimeSpan StartupDelay = TimeSpan.FromMinutes(3);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<EventReminderWorker> _logger;

    public EventReminderWorker(IServiceScopeFactory scopes, ILogger<EventReminderWorker> logger)
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
                var events = scope.ServiceProvider.GetRequiredService<IClubEventService>();
                var sent = await events.DispatchRemindersAsync(stoppingToken);
                if (sent > 0)
                    _logger.LogInformation("Sent {Count} event reminder notification(s).", sent);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Event reminder dispatch failed.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
