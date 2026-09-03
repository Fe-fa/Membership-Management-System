import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { API_BASE, apiRequest } from "./api";

/** Row shape returned by GET /api/lookups/{table}. */
export type LookupOption = { code: string; name: string; sortOrder: number };

/**
 * Whitelisted lookup tables exposed by `LookupsController`. Mirrors the
 * server-side dictionary; keep both sides in sync.
 */
export const LOOKUP_TABLES = [
  "genders",
  "blood-groups",
  "marital-status",
  "countries",
  "license-types",
  "aircraft-types",
  "affiliation-types",
  "relationship-types",
  "club-types",
  "membership-types",
  "election-types",
  "member-statuses",
  "document-types",
  "application-status",
] as const;
export type LookupTable = (typeof LOOKUP_TABLES)[number];

// Catalogues rarely change — keep them warm for an hour instead of refetching
// every time a wizard step mounts. Callers that need a forced refresh can
// call `refetch()` (returned by `useLookup`) or `queryClient.invalidateQueries`.
const LOOKUP_STALE_MS = 60 * 60 * 1000;

async function fetchLookup(table: string): Promise<LookupOption[]> {
  if (!API_BASE) return [];
  const rows = await apiRequest<unknown[]>(`/api/lookups/${encodeURIComponent(table)}`);
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const code = pickString(r, "code", "Code", "id", "Id");
      const name = pickString(r, "name", "Name", "description", "Description");
      const sortOrderRaw = r["sortOrder"] ?? r["SortOrder"];
      const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;
      return code ? { code, name: name || code, sortOrder } : null;
    })
    .filter((r): r is LookupOption => r !== null);
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

type LookupQueryResult = UseQueryResult<LookupOption[]>;

/**
 * React Query-backed hook for a single lookup table. Options are returned in
 * the order the server emitted them (`sort_order, name`) — render them as
 * received, do not re-sort on the client.
 */
export function useLookup(table: LookupTable): LookupQueryResult {
  return useQuery<LookupOption[]>({
    queryKey: ["lookup", table],
    queryFn: () => fetchLookup(table),
    staleTime: LOOKUP_STALE_MS,
    gcTime: LOOKUP_STALE_MS,
    refetchOnWindowFocus: false,
  });
}
