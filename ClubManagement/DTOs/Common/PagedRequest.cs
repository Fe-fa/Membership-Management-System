namespace ClubManagement.DTOs.Common;

public class PagedRequest
{
    private int _page = 1;
    private int _pageSize = 10;
    private const int MaxPageSize = 100;

    public int Page
    {
        get => _page;
        set => _page = value < 1 ? 1 : value;
    }

    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value > MaxPageSize ? MaxPageSize : (value < 1 ? 10 : value);
    }

    public int Skip => (Page - 1) * PageSize;
}