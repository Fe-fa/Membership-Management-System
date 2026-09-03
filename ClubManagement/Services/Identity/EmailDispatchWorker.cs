namespace ClubManagement.Services.Identity;

public class EmailDispatchWorker : BackgroundService
{
    private readonly IEmailDispatchQueue _queue;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<EmailDispatchWorker> _logger;

    public EmailDispatchWorker(
        IEmailDispatchQueue queue,
        IServiceScopeFactory scopes,
        ILogger<EmailDispatchWorker> logger)
    {
        _queue = queue;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var item in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                await using var scope = _scopes.CreateAsyncScope();
                var email = scope.ServiceProvider.GetRequiredService<IEmailSender>();
                await email.SendAsync(item.To, item.Subject, item.Body, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send queued email to {To} ({Subject})", item.To, item.Subject);
            }
        }
    }
}
