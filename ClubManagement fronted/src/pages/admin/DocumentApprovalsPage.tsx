import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Download, FileText, Loader2, Printer, X } from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
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
import { Textarea } from "@/components/ui/textarea";
import { canApproveBillingDocuments, readUser } from "@/lib/auth";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

type DocumentKind = "INVOICE";
type ApprovalStatus = "PENDING_GM" | "APPROVED" | "REJECTED" | "PUBLISHED";

type ApprovalRow = {
  billingDocumentId: number;
  documentNo: string;
  kind: DocumentKind;
  feeType: string;
  audience: string;
  partyName: string;
  partyNo?: string | null;
  email?: string | null;
  amount: number;
  amountPaid: number;
  balance: number;
  status: ApprovalStatus;
  emailAfterApproval: boolean;
  submittedAt: string;
  submittedBy?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  publishedAt?: string | null;
  sentAt?: string | null;
  year?: number | null;
  documentHtml?: string | null;
};

type PendingCounts = { invoices: number; statements: number };

type BulkApproveError = { billingDocumentId: number; documentNo?: string | null; message: string };
type BulkApproveResult = {
  requested: number;
  approved: number;
  failed: number;
  errors: BulkApproveError[];
};

function statusLabel(status: string) {
  if (status === "PENDING_GM") return "Waiting";
  if (status === "APPROVED") return "Approved";
  if (status === "PUBLISHED") return "Issued";
  if (status === "REJECTED") return "Returned";
  return status;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildCsv(rows: ApprovalRow[]) {
  const headers = [
    "Document No.",
    "Member name",
    "Membership no.",
    "Amount",
    "Amount paid",
    "Balance",
    "Status",
    "Submitted at",
    "Submitted by",
  ];
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.documentNo,
        row.partyName,
        row.partyNo || "",
        row.amount.toFixed(2),
        row.amountPaid.toFixed(2),
        row.balance.toFixed(2),
        statusLabel(row.status),
        row.submittedAt ? new Date(row.submittedAt).toISOString() : "",
        row.submittedBy || "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }
  return lines.join("\n");
}

function openPrintView(rows: ApprovalRow[], title: string) {
  const win = window.open("", "_blank", "width=1024,height=768");
  if (!win) {
    toast.error("Your browser blocked the print window. Allow pop-ups and try again.");
    return;
  }
  const rowsHtml = rows
    .map(
      (row) => `
        <tr>
          <td>${row.documentNo}</td>
          <td>${row.partyName}</td>
          <td>${row.partyNo || "—"}</td>
          <td class="num">${formatKes(row.amount)}</td>
          <td class="num">${formatKes(row.amountPaid)}</td>
          <td class="num">${formatKes(row.balance)}</td>
          <td>${statusLabel(row.status)}</td>
        </tr>`,
    )
    .join("");

  win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #1f2430; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p.meta { color: #6b7280; font-size: 12px; margin: 0 0 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
      th { text-transform: uppercase; letter-spacing: 0.03em; color: #6b7280; font-size: 10px; }
      td.num, th.num { text-align: right; }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p class="meta">Generated ${new Date().toLocaleString()} · ${rows.length} document${rows.length === 1 ? "" : "s"}</p>
    <table>
      <thead>
        <tr>
          <th>Document No.</th>
          <th>Member name</th>
          <th>Membership no.</th>
          <th class="num">Amount</th>
          <th class="num">Paid</th>
          <th class="num">Balance</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </body>
</html>`);
  win.document.close();
  win.focus();
  win.onload = () => win.print();
  // Some browsers fire onload before write settles; fall back to a short timeout too.
  setTimeout(() => win.print(), 300);
}

export function DocumentApprovalsPage() {
  const user = readUser();
  const canDecide = canApproveBillingDocuments(user);
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DocumentKind>("INVOICE");
  const [status, setStatus] = useState<ApprovalStatus>("PENDING_GM");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [returnRow, setReturnRow] = useState<ApprovalRow | null>(null);
  const [returnNotes, setReturnNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState<"print" | "download" | null>(null);

  const counts = useQuery({
    queryKey: ["billing-pending-count"],
    queryFn: () => apiRequest<PendingCounts>("/api/finance/billing/pending-count"),
  });
  const list = useQuery({
    queryKey: ["billing-approvals", kind, status, appliedSearch, page, pageSize],
    queryFn: () =>
      apiRequest<PagedResult<ApprovalRow>>(
        `/api/finance/billing/approvals?${pagedQuery({
          kind,
          status,
          search: appliedSearch || undefined,
          page,
          pageSize,
        })}`,
      ),
  });

  const pageData = list.data ?? emptyPage<ApprovalRow>(page, pageSize);
  const rows = pageData.items;

  // Selection only makes sense while looking at rows that can actually be approved.
  const selectableIds = useMemo(
    () => rows.filter((r) => r.status === "PENDING_GM" && canDecide).map((r) => r.billingDocumentId),
    [rows, canDecide],
  );
  const allSelectedOnPage = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const someSelectedOnPage = selectableIds.some((id) => selectedIds.has(id));

  // Reset selection whenever the underlying list changes shape (filters, page, etc.).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [kind, status, appliedSearch, page, pageSize]);

  function toggleRow(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllOnPage(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const approve = useMutation({
    mutationFn: (row: ApprovalRow) =>
      apiRequest<ApprovalRow>(`/api/finance/billing/${row.billingDocumentId}/approve`, {
        method: "POST",
        body: JSON.stringify({ sendEmail: row.emailAfterApproval }),
      }),
    onSuccess: async () => {
      toast.success("Document approved. The recipient can now see it.");
      await invalidate();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const reject = useMutation({
    mutationFn: (row: ApprovalRow) =>
      apiRequest<ApprovalRow>(`/api/finance/billing/${row.billingDocumentId}/reject`, {
        method: "POST",
        body: JSON.stringify({ notes: returnNotes.trim() }),
      }),
    onSuccess: async () => {
      toast.success("Returned to Finance with your note.");
      setReturnRow(null);
      setReturnNotes("");
      await invalidate();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const bulkApprove = useMutation({
    mutationFn: (ids: number[]) =>
      apiRequest<BulkApproveResult>("/api/finance/billing/bulk-approve", {
        method: "POST",
        body: JSON.stringify({ billingDocumentIds: ids }),
      }),
    onSuccess: async (result) => {
      if (result.failed === 0) {
        toast.success(
          `Approved ${result.approved} document${result.approved === 1 ? "" : "s"}. Recipients can now see them.`,
        );
      } else if (result.approved === 0) {
        toast.error(`Could not approve the selected documents. ${result.errors[0]?.message ?? ""}`.trim());
      } else {
        toast.warning(
          `Approved ${result.approved} of ${result.requested} documents. ${result.failed} could not be approved — check they're still waiting for review.`,
        );
      }
      setSelectedIds(new Set());
      await invalidate();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["billing-approvals"] }),
      queryClient.invalidateQueries({ queryKey: ["billing-pending-count"] }),
      queryClient.invalidateQueries({ queryKey: ["billing-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] }),
    ]);
  }

  /** Pulls every row matching the current filters (not just the current page) for print/export. */
  async function fetchAllFilteredRows(): Promise<ApprovalRow[]> {
    const result = await apiRequest<PagedResult<ApprovalRow>>(
      `/api/finance/billing/approvals?${pagedQuery({
        kind,
        status,
        search: appliedSearch || undefined,
        page: 1,
        pageSize: 5000,
      })}`,
    );
    return result.items;
  }

  async function handlePrint() {
    setIsExporting("print");
    try {
      const all = await fetchAllFilteredRows();
      if (all.length === 0) {
        toast.info("There's nothing to print for this view.");
        return;
      }
      openPrintView(all, `${kind === "INVOICE" ? "Invoices" : "Statements"} — ${statusLabel(status)}`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setIsExporting(null);
    }
  }

  async function handleDownload() {
    setIsExporting("download");
    try {
      const all = await fetchAllFilteredRows();
      if (all.length === 0) {
        toast.info("There's nothing to download for this view.");
        return;
      }
      const csv = buildCsv(all);
      const filename = `billing-${kind.toLowerCase()}-${status.toLowerCase()}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      downloadTextFile(filename, csv, "text/csv;charset=utf-8;");
      toast.success(`Downloaded ${all.length} document${all.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setIsExporting(null);
    }
  }

  const invoiceCount = counts.data?.invoices ?? 0;
  const statementCount = counts.data?.statements ?? 0;
  const pendingTotal = invoiceCount + statementCount;
  const busyId = approve.isPending ? approve.variables?.billingDocumentId : reject.isPending ? returnRow?.billingDocumentId : null;
  const selectedCount = selectedIds.size;

  return (
    <PageFrame width="lg">
      <PageHeader
        title=""
        description="Review invoices and statements Finance prepared. Approve to release them to the member or applicant, or return them with a note."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isExporting !== null}
              onClick={handlePrint}
            >
              {isExporting === "print" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Printer className="size-4" />
              )}
              Print
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isExporting !== null}
              onClick={handleDownload}
            >
              {isExporting === "download" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/finance/invoices">
                <FileText className="size-4" />
                Finance invoices
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Waiting for you</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{pendingTotal}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending invoices</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{invoiceCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["INVOICE"] as DocumentKind[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setKind(item);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium",
                kind === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-slate-200 bg-white text-slate-700 hover:border-primary/40",
              )}
            >
              {item === "INVOICE" ? "Invoices" : null}
              {item === "INVOICE" && invoiceCount > 0 ? ` (${invoiceCount})` : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["PENDING_GM", "APPROVED", "PUBLISHED", "REJECTED"] as ApprovalStatus[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setStatus(item);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                status === item
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-200 bg-white text-slate-600",
              )}
            >
              {statusLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid min-w-[14rem] flex-1 gap-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <Input
            className="bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAppliedSearch(search.trim());
                setPage(1);
              }
            }}
            placeholder="Name, membership no., document no."
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAppliedSearch(search.trim());
            setPage(1);
          }}
        >
          Search
        </Button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {list.isLoading ? (
          <PageBodyLoading label="Loading documents waiting for approval…" minHeightClassName="min-h-[16rem]" />
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 px-3 py-10 text-center text-sm text-muted-foreground">
            {status === "PENDING_GM"
              ? `No ${kind === "INVOICE" ? "invoices" : "statements"} are waiting for approval.`
              : `No ${statusLabel(status).toLowerCase()} ${kind === "INVOICE" ? "invoices" : "statements"} found.`}
          </p>
        ) : (
          <>
            {selectedCount > 0 ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <CheckCheck className="size-4" />
                  {selectedCount} selected
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={bulkApprove.isPending}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={bulkApprove.isPending}
                    onClick={() => bulkApprove.mutate(Array.from(selectedIds))}
                  >
                    {bulkApprove.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Bulk Approve ({selectedCount})
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
                    {canDecide && status === "PENDING_GM" ? (
                      <th className="w-[6%] py-2 pr-2">
                        <Checkbox
                          checked={allSelectedOnPage ? true : someSelectedOnPage ? "indeterminate" : false}
                          disabled={selectableIds.length === 0}
                          onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
                          aria-label="Select all rows on this page"
                        />
                      </th>
                    ) : null}
                    <th className={cn("py-2 pr-3 font-medium", canDecide && status === "PENDING_GM" ? "w-[28%]" : "w-[32%]")}>
                      Member name
                    </th>
                    <th className="w-[22%] py-2 pr-3 font-medium">Membership no.</th>
                    <th className="w-[22%] py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="w-[24%] py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowBusy = busyId === row.billingDocumentId;
                    const canSelectRow = row.status === "PENDING_GM" && canDecide;
                    return (
                      <tr key={row.billingDocumentId} className="border-b border-slate-100 last:border-0 hover:bg-muted/40">
                        {canDecide && status === "PENDING_GM" ? (
                          <td className="py-3 pr-2 align-middle">
                            {canSelectRow ? (
                              <Checkbox
                                checked={selectedIds.has(row.billingDocumentId)}
                                onCheckedChange={(checked) => toggleRow(row.billingDocumentId, checked === true)}
                                disabled={bulkApprove.isPending}
                                aria-label={`Select ${row.partyName}`}
                              />
                            ) : null}
                          </td>
                        ) : null}
                        <td className="py-3 pr-3 align-middle">
                          <p className="font-medium text-slate-900">{row.partyName}</p>
                        </td>
                        <td className="py-3 pr-3 align-middle font-medium">{row.partyNo || "—"}</td>
                        <td className="py-3 pr-3 align-middle text-right tabular-nums font-semibold">
                          {formatKes(row.amount)}
                        </td>
                        <td className="py-3 align-middle">
                          {row.status === "PENDING_GM" && canDecide ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={Boolean(busyId) || bulkApprove.isPending}
                                onClick={() => approve.mutate(row)}
                              >
                                {rowBusy && approve.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={Boolean(busyId) || bulkApprove.isPending}
                                onClick={() => {
                                  setReturnRow(row);
                                  setReturnNotes("");
                                }}
                              >
                                <X className="size-4" />
                                Return
                              </Button>
                            </div>
                          ) : (
                            <p className="text-right text-sm text-muted-foreground">{statusLabel(row.status)}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

      <Dialog open={Boolean(returnRow)} onOpenChange={(open) => !open && !reject.isPending && setReturnRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to Finance</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add a short note so Finance knows what to correct
            {returnRow ? ` for ${returnRow.partyName}.` : "."}
          </p>
          <Textarea
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
            placeholder="Reason for returning this document"
            rows={4}
          />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={reject.isPending} onClick={() => setReturnRow(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reject.isPending || !returnNotes.trim() || !returnRow}
              onClick={() => returnRow && reject.mutate(returnRow)}
            >
              {reject.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Return document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}