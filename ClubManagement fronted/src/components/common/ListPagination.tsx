import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export function ListPagination({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize?: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const pages = Math.max(1, totalPages || Math.ceil((totalCount || 0) / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pages);
  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(totalCount, safePage * pageSize);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {totalCount === 0 ? "No results" : `Showing ${from}–${to} of ${totalCount}`}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Rows
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={pageSize}
              onChange={(event) => {
                onPageSizeChange(Number(event.target.value));
                onPageChange(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-24 text-center text-sm text-muted-foreground">
          Page {safePage} of {pages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          disabled={safePage >= pages}
          onClick={() => onPageChange(safePage + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
