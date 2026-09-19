import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

const PAGE_SIZES = [10, 25, 50] as const;

export type ClubSetupColumn<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
};

export function ClubSetupListing<T>({
  title,
  rows,
  columns,
  searchText,
  rowKey,
  onCreate,
  onEdit,
  onDelete,
  deleteDisabled,
}: {
  title: string;
  rows: T[];
  columns: ClubSetupColumn<T>[];
  searchText: (row: T) => string;
  rowKey: (row: T) => string | number;
  onCreate: () => void;
  onEdit: (row: T) => void;
  onDelete?: (row: T) => void;
  deleteDisabled?: (row: T) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => searchText(row).toLowerCase().includes(term));
  }, [query, rows, searchText]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200/80">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        <Button type="button" className="bg-sky-500 text-white hover:bg-sky-400" onClick={onCreate}>
          <Plus className="size-4" />
          Create New
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Show
          <select
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          entries
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Search
          <Input
            className="h-8 w-48"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              {columns.map((column) => (
                <th key={column.key} className={cn("px-3 py-2.5", column.className)}>
                  {column.header}
                </th>
              ))}
              <th className="w-28 px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {slice.length ? (
              slice.map((row) => (
                <tr key={rowKey(row)} className="border-b border-slate-100 text-slate-700">
                  {columns.map((column) => (
                    <td key={column.key} className={cn("px-3 py-2.5 align-middle", column.className)}>
                      {column.render(row)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" className="h-8 bg-slate-800 text-white hover:bg-slate-700">
                          Action
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(row)}>Edit</DropdownMenuItem>
                        {onDelete ? (
                          <DropdownMenuItem
                            disabled={deleteDisabled?.(row)}
                            className="text-rose-600"
                            onClick={() => onDelete(row)}
                          >
                            Delete
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-slate-400">
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>
          Showing {from} to {to} of {total} entries
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-2 py-1 disabled:opacity-40"
            disabled={safePage <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span className="grid size-7 place-items-center rounded bg-slate-800 text-xs font-semibold text-white">
            {safePage}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 disabled:opacity-40"
            disabled={safePage >= pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
