using Microsoft.EntityFrameworkCore;

namespace ClubManagement.DTOs.Common;

public static class Paging
{
    public static PagedResult<T> Create<T>(IEnumerable<T> items, PagedRequest request, int totalCount) =>
        new()
        {
            Items = items as List<T> ?? items.ToList(),
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = totalCount
        };

    public static PagedResult<T> FromList<T>(IReadOnlyList<T> items, PagedRequest request)
    {
        var total = items.Count;
        var pageItems = items.Skip(request.Skip).Take(request.PageSize).ToList();
        return Create(pageItems, request, total);
    }

    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(
        this IQueryable<T> query,
        PagedRequest request,
        CancellationToken cancellationToken = default)
    {
        var total = await query.CountAsync(cancellationToken);
        var items = await query.Skip(request.Skip).Take(request.PageSize).ToListAsync(cancellationToken);
        return Create(items, request, total);
    }

    public static async Task<PagedResult<TOut>> ToPagedResultAsync<T, TOut>(
        this IQueryable<T> query,
        PagedRequest request,
        Func<T, TOut> map,
        CancellationToken cancellationToken = default)
    {
        var paged = await query.ToPagedResultAsync(request, cancellationToken);
        return Create(paged.Items.Select(map), request, paged.TotalCount);
    }
}
