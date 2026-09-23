import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Mail, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { PageFrame } from "@/components/layout/PageFrame";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canDeleteFinanceStatements, readUser, subscribeAuthChanged, type AuthUser } from "@/lib/auth";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { useLookup } from "@/services/membership/lookups";
import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";
import {
  buildStatementHtml,
  printHtmlDocument,
  statementLineKind,
  type StatementDocument,
  type StatementLine,
} from "@/utils/financeExport";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Audience = "" | "MEMBER" | "APPLICANT";

type PartyRow = {
  rowKey: string;
  audience: string;
  accountId?: number | null;
  applicationId?: number | null;
  profileId?: number | null;
  displayNo: string;
  partyName: string;
  membershipType?: string | null;
  email?: string | null;
  amountPaid: number;
  balance: number;
};

type StatementDoc = StatementDocument & {
  audience?: string | null;
  email?: string | null;
  lines?: StatementLine[] | null;
};

const MONTHS = [
  { value: "", label: "All year" },
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "JOINING", label: "Joining" },
  { value: "ANNUAL", label: "Annual" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "CORKAGE", label: "Corkage" },
  { value: "CUSTOM", label: "Custom" },
];

function lastDayOfMonth(year: number, month: string) {
  const m = Number(month);
  return new Date(Date.UTC(year, m, 0)).getUTCDate().toString().padStart(2, "0");
}

function statusKey(status?: string | null) {
  return (status ?? "").toUpperCase().replace(/[-\s]/g, "_");
}

function canAdjustLine(line: StatementLine) {
  if (statementLineKind(line) !== "PAYMENT") return false;
  const s = statusKey(line.status);
  return s === "PAID" || s === "WAIVED" || s === "PARTIALLY_PAID" || s === "SETTLED";
}

function statementKindLabel(line: StatementLine) {
  const kind = statementLineKind(line);
  if (kind === "PAYMENT") return "Money in";
  if (kind === "REFUND") return "Money out";
  return "Invoice";
}

function matchesCategory(fee: string | null | undefined, category: string) {
  if (!category) return true;
  const f = (fee ?? "").toUpperCase();
  if (category === "JOINING") return f.includes("JOIN") || f.includes("ENTRANCE");
  if (category === "ANNUAL") return f.includes("ANNUAL") || f.includes("SUBSCRIPTION");
  if (category === "ACCOMMODATION") return f.includes("ACCOM") || f.includes("ROOM");
  if (category === "CORKAGE") return f.includes("CORK");
  if (category === "CUSTOM") return f.includes("CUSTOM") || f.includes("OTHER") || f.includes("CHARGE");
  return true;
}

export function FinanceStatementsPage() {
  const [user, setUser] = useState<AuthUser | null>(() => readUser());
  useEffect(() => subscribeAuthChanged(() => setUser(readUser())), []);
  const tenant = useCurrentTenant();
  const brand = tenantDocumentBrand(tenant.data);
  const queryClient = useQueryClient();
  const membershipTypes = useLookup("membership-types");
  const canDelete = canDeleteFinanceStatements(user);
  const canAdjust = canDeleteFinanceStatements(user);
  const currentYear = new Date().getFullYear();

  const [audience, setAudience] = useState<Audience>("");
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [membershipType, setMembershipType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<Record<string, PartyRow>>({});
  const [viewRow, setViewRow] = useState<PartyRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<PartyRow | null>(null);
  const [adjustLine, setAdjustLine] = useState<{ id: number; kind: "refund" | "reverse"; label: string } | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [busy, setBusy] = useState(false);

  const yearNum = Number(year) || currentYear;
  const from = month ? `${yearNum}-${month}-01` : `${yearNum}-01-01`;
  const to = month ? `${yearNum}-${month}-${lastDayOfMonth(yearNum, month)}` : `${yearNum}-12-31`;
  const selectedRows = Object.values(selected);
  const selectedCount = selectedRows.length;
  const issuedBy = user?.fullName || user?.username || "Finance";

  const parties = useQuery({
    queryKey: ["statement-parties", audience, yearNum, appliedSearch, membershipType, page, pageSize],
    queryFn: () =>
      apiRequest<PagedResult<PartyRow>>(
        `/api/finance/statement-parties?${pagedQuery({
          page,
          pageSize,
          year: yearNum,
          search: appliedSearch || undefined,
          audience: audience || undefined,
          membershipType: membershipType || undefined,
        })}`,
      ),
  });
  const pageData = parties.data ?? emptyPage<PartyRow>(page, pageSize);
  const rows = pageData.items;
  const pageKeys = rows.map((r) => r.rowKey);
  const allOnPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selected[key]);

  const statement = useQuery({
    queryKey: ["party-statement", viewRow?.rowKey, from, to],
    enabled: Boolean(viewRow),
    queryFn: () => {
      if (!viewRow) throw new Error("No party selected.");
      if (viewRow.audience === "APPLICANT" && viewRow.applicationId)
        return apiRequest<StatementDoc>(
          `/api/finance/statements/applicant/${viewRow.applicationId}?from=${from}&to=${to}`,
        );
      if (!viewRow.accountId) throw new Error("Member account was not found.");
      return apiRequest<StatementDoc>(`/api/finance/statements/${viewRow.accountId}?from=${from}&to=${to}`);
    },
  });

  const visibleLines = useMemo(
    () => (statement.data?.lines ?? []).filter((line) => matchesCategory(line.fee, category)),
    [statement.data?.lines, category],
  );

  const previewDoc = useMemo((): StatementDoc | null => {
    if (!statement.data) return null;
    return {
      ...statement.data,
      ...brand,
      issuedBy,
      lines: visibleLines,
    };
  }, [statement.data, brand, issuedBy, visibleLines]);

  const previewHtml = previewDoc ? buildStatementHtml(previewDoc) : "";

  const adjust = useMutation({
    mutationFn: async () => {
      if (!adjustLine || !adjustReason.trim()) throw new Error("Add a reason.");
      const path = adjustLine.kind === "refund" ? "refund" : "reverse";
      await apiRequest(`/api/finance/payments/${adjustLine.id}/${path}`, {
        method: "POST",
        body: JSON.stringify({ reason: adjustReason.trim() }),
      });
    },
    onSuccess: async () => {
      toast.success(adjustLine?.kind === "refund" ? "Credit posted (refund)." : "Debit reversed on the ledger.");
      setAdjustLine(null);
      setAdjustReason("");
      await Promise.all([
        statement.refetch(),
        parties.refetch(),
        queryClient.invalidateQueries({ queryKey: ["statement-parties"] }),
      ]);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const removeStatement = useMutation({
    mutationFn: async (row: PartyRow) => {
      if (!canDeleteFinanceStatements(readUser())) {
        throw new Error("Only Admin can delete issued statements.");
      }
      return apiRequest<{ deleted: number }>(
        `/api/finance/statement-parties?${pagedQuery({
          accountId: row.accountId || undefined,
          applicationId: row.applicationId || undefined,
        })}`,
        { method: "DELETE" },
      );
    },
    onSuccess: async (result, row) => {
      toast.success(`Deleted ${result.deleted} issued statement(s) for ${row.partyName}.`);
      setDeleteRow(null);
      await Promise.all([
        parties.refetch(),
        queryClient.invalidateQueries({ queryKey: ["billing-approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-pending-count"] }),
      ]);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  function applyFilters() {
    setAppliedSearch(search.trim());
    setPage(1);
    setSelected({});
  }

  async function fetchAllParties() {
    const result = await apiRequest<PagedResult<PartyRow>>(
      `/api/finance/statement-parties?${pagedQuery({
        page: 1,
        pageSize: 5000,
        year: yearNum,
        search: appliedSearch || undefined,
        audience: audience || undefined,
        membershipType: membershipType || undefined,
      })}`,
    );
    return result.items;
  }

  async function loadOfficial(row: PartyRow) {
    const doc =
      row.audience === "APPLICANT" && row.applicationId
        ? await apiRequest<StatementDoc>(
            `/api/finance/statements/applicant/${row.applicationId}?from=${from}&to=${to}`,
          )
        : await apiRequest<StatementDoc>(`/api/finance/statements/${row.accountId}?from=${from}&to=${to}`);
    return buildStatementHtml({
      ...doc,
      ...brand,
      issuedBy,
      lines: (doc.lines ?? []).filter((line) => matchesCategory(line.fee, category)),
    });
  }

  async function printSelected() {
    const targets = selectedCount > 0 ? selectedRows : rows;
    if (targets.length === 0) {
      toast.error("Nothing to print.");
      return;
    }
    try {
      setBusy(true);
      const htmlParts: string[] = [];
      for (const row of targets) htmlParts.push(await loadOfficial(row));
      const combined = htmlParts
        .map((html, index) => html.replace("</body>", index < htmlParts.length - 1 ? '<div style="page-break-after:always"></div></body>' : "</body>"))
        .join("");
      printHtmlDocument(combined);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function emailSelected() {
    const targets = selectedCount > 0 ? selectedRows : [];
    if (targets.length === 0) {
      toast.error("Select at least one member or applicant to email.");
      return;
    }
    const missing = targets.filter((row) => !row.email?.trim()).length;
    try {
      setBusy(true);
      const items = [];
      for (const row of targets) {
        if (!row.email?.trim()) continue;
        items.push({
          email: row.email.trim(),
          partyName: row.partyName,
          html: await loadOfficial(row),
        });
      }
      if (items.length === 0) {
        toast.error("None of the selected parties have an email address.");
        return;
      }
      const result = await apiRequest<{ sent: number; skipped: number }>("/api/finance/statements/email", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      toast.success(
        `Emailed ${result.sent} official statement(s)` +
          (result.skipped || missing ? ` · ${result.skipped || missing} skipped (no email).` : "."),
      );
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
    <PageFrame width="lg" className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {([
          { id: "" as Audience, label: "All" },
          { id: "MEMBER" as Audience, label: "Members" },
          { id: "APPLICANT" as Audience, label: "Applicants" },
        ]).map((tab) => (
          <button
            key={tab.id || "all"}
            type="button"
            onClick={() => {
              setAudience(tab.id);
              setPage(1);
              setSelected({});
            }}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              audience === tab.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-200 bg-white text-slate-700 hover:border-primary/40",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Year</span>
          <Input
            type="number"
            className="w-28 bg-white"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Month</span>
          <select
            className="h-9 min-w-[10rem] rounded-md border border-input bg-white px-2 text-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            {MONTHS.map((item) => (
              <option key={item.value || "year"} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Category</span>
          <select
            className="h-9 min-w-[10rem] rounded-md border border-input bg-white px-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((item) => (
              <option key={item.value || "all"} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="bg-white pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Name, membership no., APP-, email"
            />
          </div>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Membership type</span>
          <select
            className="h-9 min-w-[10rem] rounded-md border border-input bg-white px-2 text-sm"
            value={membershipType}
            onChange={(e) => {
              setMembershipType(e.target.value);
              setPage(1);
              setSelected({});
            }}
          >
            <option value="">All</option>
            {(membershipTypes.data ?? []).map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={applyFilters}>
          Apply filters
        </Button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">
              {pageData.totalCount} {audience === "APPLICANT" ? "applicants" : audience === "MEMBER" ? "members" : "accounts"} · {from} to {to}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void printSelected()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              Print official
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void emailSelected()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Email notices
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={parties.isFetching || busy}
              onClick={() => {
                void (async () => {
                  try {
                    setBusy(true);
                    const all = await fetchAllParties();
                    const next: Record<string, PartyRow> = {};
                    for (const row of all) next[row.rowKey] = row;
                    setSelected(next);
                    toast.success(`${all.length} selected.`);
                  } catch (err) {
                    toast.error(extractErrorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Select all
            </Button>
            {selectedCount > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected({})}>
                Clear ({selectedCount})
              </Button>
            ) : null}
          </div>
        </div>

        {parties.isLoading ? (
          <PageBodyLoading label="Loading statements…" minHeightClassName="min-h-[14rem]" />
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-muted-foreground">
            No members or applicants match the current filters.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 py-2 pr-2">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={(checked) => {
                          setSelected((prev) => {
                            const next = { ...prev };
                            for (const row of rows) {
                              if (checked) next[row.rowKey] = row;
                              else delete next[row.rowKey];
                            }
                            return next;
                          });
                        }}
                        aria-label="Select page"
                      />
                    </th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">No.</th>
                    <th className="py-2 pr-3">Kind</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3 text-right">Paid</th>
                    <th className="py-2 pr-3 text-right">Balance</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rowKey} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-2">
                        <Checkbox
                          checked={Boolean(selected[row.rowKey])}
                          onCheckedChange={(checked) => {
                            setSelected((prev) => {
                              const next = { ...prev };
                              if (checked) next[row.rowKey] = row;
                              else delete next[row.rowKey];
                              return next;
                            });
                          }}
                          aria-label={`Select ${row.partyName}`}
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-medium">{row.partyName}</td>
                      <td className="py-2.5 pr-3">{row.displayNo || "—"}</td>
                      <td className="py-2.5 pr-3">{row.audience === "APPLICANT" ? "Applicant" : "Member"}</td>
                      <td className="py-2.5 pr-3">{row.membershipType || "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{formatKes(row.amountPaid)}</td>
                      <td className={cn("py-2.5 pr-3 text-right tabular-nums", row.balance > 0 ? "font-medium text-amber-800" : "")}>
                        {formatKes(row.balance)}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                aria-label={`View statement for ${row.partyName}`}
                                onClick={() => setViewRow(row)}
                              >
                                <Eye className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View</TooltipContent>
                          </Tooltip>
                          {canDelete ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-destructive hover:text-destructive"
                                  aria-label={`Delete issued statements for ${row.partyName}`}
                                  onClick={() => setDeleteRow(row)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <ListPagination
                page={page}
                pageSize={pageSize}
                totalCount={pageData.totalCount}
                totalPages={pageData.totalPages}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </>
        )}
      </section>

      <Dialog open={Boolean(viewRow)} onOpenChange={(open) => !open && setViewRow(null)}>
        <DialogContent className="flex h-[min(92vh,56rem)] w-[min(96vw,80rem)] max-w-[80rem] flex-col gap-4 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              Official statement · {viewRow?.partyName}
            </DialogTitle>
          </DialogHeader>
          {statement.isLoading ? (
            <PageBodyLoading label="Loading statement…" minHeightClassName="min-h-[18rem]" />
          ) : statement.isError ? (
            <p className="text-sm text-destructive">{extractErrorMessage(statement.error)}</p>
          ) : (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <iframe title="Statement preview" className="h-full min-h-[22rem] w-full rounded-xl border border-border bg-white" srcDoc={previewHtml} />
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                <p className="text-sm text-muted-foreground">
                  {viewRow?.audience === "APPLICANT" ? "Applicant" : "Member"} · {viewRow?.displayNo || "—"}
                  <br />
                  Closing {formatKes(statement.data?.closingBalance ?? 0)}
                </p>
                {visibleLines.length > 0 || canAdjust ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ledger</p>
                    {visibleLines.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No ledger lines in this period.</p>
                    ) : (
                      visibleLines.map((line, index) => {
                        const transactionId = (line as StatementLine).transactionId;
                        return (
                        <div key={`${transactionId ?? index}`} className="rounded-md border border-slate-200 p-2 text-xs">
                          <p className="font-medium">{line.fee || "Entry"} · {formatKes(Math.abs(line.amount))}</p>
                          <p className="text-muted-foreground">{statementKindLabel(line)} · {line.status || "—"} · {line.receipt || "No receipt"}</p>
                          {canAdjust && transactionId && canAdjustLine(line) ? (
                            <div className="mt-1 flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setAdjustLine({
                                    id: transactionId,
                                    kind: "refund",
                                    label: `${line.fee || "Payment"} ${formatKes(line.amount)}`,
                                  })
                                }
                              >
                                Credit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setAdjustLine({
                                    id: transactionId,
                                    kind: "reverse",
                                    label: `${line.fee || "Payment"} ${formatKes(line.amount)}`,
                                  })
                                }
                              >
                                Debit
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setViewRow(null)}>
              Close
            </Button>
            <Button
              type="button"
              disabled={!previewHtml}
              onClick={() => previewHtml && printHtmlDocument(previewHtml)}
            >
              <Printer className="size-4" />
              Print stamped statement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(adjustLine)} onOpenChange={(open) => !open && !adjust.isPending && setAdjustLine(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adjustLine?.kind === "refund" ? "Post credit (refund)" : "Post debit (reversal)"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{adjustLine?.label}</p>
          <Label htmlFor="statement-adjust-reason">Reason</Label>
          <Input
            id="statement-adjust-reason"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            placeholder="Why is this ledger entry being adjusted?"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdjustLine(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!adjustReason.trim() || adjust.isPending} onClick={() => adjust.mutate()}>
              {adjust.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={canDelete && Boolean(deleteRow)} onOpenChange={(open) => !open && !removeStatement.isPending && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete issued statement?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow
                ? `This removes issued statement notices for ${deleteRow.partyName}. It does not delete the member or applicant record, and it does not change the ledger.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeStatement.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeStatement.isPending || !deleteRow}
              onClick={(e) => {
                e.preventDefault();
                if (deleteRow) removeStatement.mutate(deleteRow);
              }}
            >
              {removeStatement.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
    </TooltipProvider>
  );
}
