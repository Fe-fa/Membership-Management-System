import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

type Catalog = {
  key: string;
  label: string;
  tableName: string;
  kind: "standard" | "fee-schedule" | string;
  description: string;
};

type Row = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  membershipTypeId?: number | null;
  membershipTypeName?: string | null;
  joiningFee?: number | null;
  joiningFeeUnder30?: number | null;
  annualSubscription?: number | null;
  effectiveDate?: string | null;
};

type Draft = {
  id: number | null;
  code: string;
  name: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
  membershipTypeId: string;
  joiningFee: string;
  joiningFeeUnder30: string;
  annualSubscription: string;
  effectiveDate: string;
};

const emptyDraft = (): Draft => ({
  id: null,
  code: "",
  name: "",
  description: "",
  sortOrder: "10",
  isActive: true,
  membershipTypeId: "",
  joiningFee: "",
  joiningFeeUnder30: "",
  annualSubscription: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
});

function rowToDraft(row: Row): Draft {
  return {
    id: row.id,
    code: row.code ?? "",
    name: row.name ?? "",
    description: row.description ?? "",
    sortOrder: String(row.sortOrder ?? 0),
    isActive: Boolean(row.isActive),
    membershipTypeId: row.membershipTypeId != null ? String(row.membershipTypeId) : "",
    joiningFee: row.joiningFee != null ? String(row.joiningFee) : "",
    joiningFeeUnder30: row.joiningFeeUnder30 != null ? String(row.joiningFeeUnder30) : "",
    annualSubscription: row.annualSubscription != null ? String(row.annualSubscription) : "",
    effectiveDate: row.effectiveDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  };
}

export function LookupsSettingsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>("membership-fee-schedule");
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [creating, setCreating] = useState(false);

  const catalogs = useQuery({
    queryKey: ["lookup-admin", "catalogs", search],
    queryFn: () =>
      apiRequest<Catalog[]>(
        `/api/lookup-admin/catalogs${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`,
      ),
  });

  const selected = useMemo(
    () => (catalogs.data ?? []).find((c) => c.key === selectedKey) ?? null,
    [catalogs.data, selectedKey],
  );

  const rows = useQuery({
    queryKey: ["lookup-admin", "rows", selectedKey],
    queryFn: () => apiRequest<Row[]>(`/api/lookup-admin/${encodeURIComponent(selectedKey)}/rows`),
    enabled: Boolean(selectedKey),
  });

  const membershipTypes = useQuery({
    queryKey: ["lookup-admin", "rows", "membership-types"],
    queryFn: () => apiRequest<Row[]>(`/api/lookup-admin/membership-types/rows`),
    enabled: selected?.kind === "fee-schedule",
  });

  useEffect(() => {
    const list = catalogs.data ?? [];
    if (!list.length) return;
    if (!list.some((c) => c.key === selectedKey)) {
      setSelectedKey(list[0].key);
    }
  }, [catalogs.data, selectedKey]);

  useEffect(() => {
    setCreating(false);
    setDraft(emptyDraft());
  }, [selectedKey]);

  const save = useMutation({
    mutationFn: async () => {
      const body =
        selected?.kind === "fee-schedule"
          ? {
              membershipTypeId: Number(draft.membershipTypeId) || undefined,
              joiningFee: Number(draft.joiningFee),
              joiningFeeUnder30: Number(draft.joiningFeeUnder30),
              annualSubscription: Number(draft.annualSubscription),
              effectiveDate: draft.effectiveDate || undefined,
              isActive: draft.isActive,
            }
          : {
              code: draft.code,
              name: draft.name,
              description: draft.description || null,
              sortOrder: Number(draft.sortOrder) || 0,
              isActive: draft.isActive,
            };

      if (creating || draft.id == null) {
        return apiRequest<Row>(`/api/lookup-admin/${encodeURIComponent(selectedKey)}/rows`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      return apiRequest<Row>(`/api/lookup-admin/${encodeURIComponent(selectedKey)}/rows/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async (row) => {
      toast.success(creating ? "Lookup row created." : "Lookup row updated.");
      setCreating(false);
      setDraft(rowToDraft(row));
      await queryClient.invalidateQueries({ queryKey: ["lookup-admin", "rows", selectedKey] });
      await queryClient.invalidateQueries({ queryKey: ["lookups"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const isFee = selected?.kind === "fee-schedule";

  return (
    <PageFrame width="lg">
      <PageHeader
        title="Lookups & fee schedule"
        description="Search a catalog, select the table, edit the loaded database values, then save to update."
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-xl border border-border bg-card p-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Search lookups</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="fee schedule, payment status…"
              />
            </div>
          </label>
          {catalogs.isLoading ? (
            <PageBodyLoading label="Loading catalogs…" minHeightClassName="min-h-[16rem]" />
          ) : catalogs.isError ? (
            <p className="text-sm text-destructive">
              Could not load catalogs. Restart the API, then refresh this page.
            </p>
          ) : (catalogs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No catalogs match. Try “meeting”, “fee”, or “payment”.
            </p>
          ) : (
            <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
              {(catalogs.data ?? []).map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(c.key)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                      selectedKey === c.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-transparent hover:bg-muted",
                    )}
                  >
                    <span className="block font-medium">{c.label}</span>
                    <span className={cn("mt-0.5 block text-xs", selectedKey === c.key ? "opacity-80" : "text-muted-foreground")}>
                      {c.tableName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="space-y-4">
          {selected ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{selected.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Database table: {selected.tableName}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreating(true);
                    setDraft(emptyDraft());
                  }}
                >
                  <Plus className="size-4" />
                  Add row
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">Current values</h3>
              {rows.isLoading ? (
                <PageBodyLoading label="Loading rows…" minHeightClassName="min-h-[12rem]" />
              ) : (rows.data ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No rows in this table yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {isFee ? (
                          <>
                            <th className="p-2">Type</th>
                            <th className="p-2">Joining</th>
                            <th className="p-2">Under 30</th>
                            <th className="p-2">Annual</th>
                            <th className="p-2">Effective</th>
                          </>
                        ) : (
                          <>
                            <th className="p-2">Code</th>
                            <th className="p-2">Name</th>
                            <th className="p-2">Sort</th>
                            <th className="p-2">Active</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(rows.data ?? []).map((row) => {
                        const active = draft.id === row.id && !creating;
                        return (
                          <tr
                            key={row.id}
                            className={cn(
                              "cursor-pointer border-t border-border",
                              active ? "bg-primary/10" : "hover:bg-muted/50",
                            )}
                            onClick={() => {
                              setCreating(false);
                              setDraft(rowToDraft(row));
                            }}
                          >
                            {isFee ? (
                              <>
                                <td className="p-2 font-medium">{row.membershipTypeName || row.name}</td>
                                <td className="p-2">{Number(row.joiningFee ?? 0).toLocaleString()}</td>
                                <td className="p-2">{Number(row.joiningFeeUnder30 ?? 0).toLocaleString()}</td>
                                <td className="p-2">{Number(row.annualSubscription ?? 0).toLocaleString()}</td>
                                <td className="p-2">{row.effectiveDate || "—"}</td>
                              </>
                            ) : (
                              <>
                                <td className="p-2 font-medium">{row.code}</td>
                                <td className="p-2">{row.name}</td>
                                <td className="p-2">{row.sortOrder}</td>
                                <td className="p-2">{row.isActive ? "Yes" : "No"}</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">
                {creating ? "Add new row" : draft.id != null ? `Edit row #${draft.id}` : "Select a row to edit"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Form fields are pre-filled from the database. Change values and save to update.
              </p>

              <div className="mt-4 space-y-3">
                {isFee ? (
                  <>
                    <label className="grid gap-1 text-sm">
                      <Label>Membership type</Label>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={draft.membershipTypeId}
                        onChange={(e) => setDraft((d) => ({ ...d, membershipTypeId: e.target.value }))}
                        disabled={!creating && draft.id != null}
                      >
                        <option value="">Select type…</option>
                        {(membershipTypes.data ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label>Joining fee</Label>
                      <Input
                        type="number"
                        value={draft.joiningFee}
                        onChange={(e) => setDraft((d) => ({ ...d, joiningFee: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label>Joining fee (under 30)</Label>
                      <Input
                        type="number"
                        value={draft.joiningFeeUnder30}
                        onChange={(e) => setDraft((d) => ({ ...d, joiningFeeUnder30: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label>Annual subscription</Label>
                      <Input
                        type="number"
                        value={draft.annualSubscription}
                        onChange={(e) => setDraft((d) => ({ ...d, annualSubscription: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label>Effective date</Label>
                      <Input
                        type="date"
                        value={draft.effectiveDate}
                        onChange={(e) => setDraft((d) => ({ ...d, effectiveDate: e.target.value }))}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="grid gap-1 text-sm">
                      <Label>Code</Label>
                      <Input
                        value={draft.code}
                        onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
                        placeholder="FULL"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label>Name</Label>
                      <Input
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Display name"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label>Description</Label>
                      <Input
                        value={draft.description}
                        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label>Sort order</Label>
                      <Input
                        type="number"
                        value={draft.sortOrder}
                        onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
                      />
                    </label>
                  </>
                )}

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                  />
                  Active
                </label>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    disabled={save.isPending || (!creating && draft.id == null)}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {creating ? "Create" : "Save / update"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={save.isPending}
                    onClick={() => {
                      setCreating(false);
                      setDraft(emptyDraft());
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
