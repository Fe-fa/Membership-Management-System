using System.Threading.Channels;

namespace ClubManagement.Services.Identity;

public record EmailWorkItem(string To, string Subject, string Body);

public interface IEmailDispatchQueue
{
    ValueTask EnqueueAsync(EmailWorkItem item, CancellationToken cancellationToken = default);
    IAsyncEnumerable<EmailWorkItem> ReadAllAsync(CancellationToken cancellationToken);
}

public class EmailDispatchQueue : IEmailDispatchQueue
{
    private readonly Channel<EmailWorkItem> _channel = Channel.CreateUnbounded<EmailWorkItem>(
        new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });

    public ValueTask EnqueueAsync(EmailWorkItem item, CancellationToken cancellationToken = default) =>
        _channel.Writer.WriteAsync(item, cancellationToken);

    public IAsyncEnumerable<EmailWorkItem> ReadAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);
}
