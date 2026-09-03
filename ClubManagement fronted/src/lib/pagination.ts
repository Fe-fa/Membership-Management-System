export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export function emptyPage<T>(page = 1, pageSize = DEFAULT_PAGE_SIZE): PagedResult<T> {
  return { items: [], page, pageSize, totalCount: 0, totalPages: 0 };
}

export function pagedQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}
