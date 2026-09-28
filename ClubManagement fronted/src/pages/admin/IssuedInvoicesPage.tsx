import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { useLookup } from "@/services/membership/lookups";
import { useInvoiceSetup } from "@/services/finance/invoiceSetup";
import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";
import { buildInvoiceHtml, printHtmlDocument, type InvoiceDocument } from "@/utils/financeExport";
import { formatDate, formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

type IssuedInvoice = {
  invoiceId: number;
  invoiceNo: string;
  accountId: number;
  memberName: string;
  membershipNo?: string | null;
  membershipType?: string | null;
  year: number;
  dueDate: string;
  amount: number;
  credited: number;
  balance: number;
  status: string;
  issuedAt: string;
};

type CreditNote = {
  creditNoteId: number;
  creditNoteNo: string;
  invoiceId: number;
  invoiceNo: string;
  accountId: number;
  memberName: string;
  membershipNo?: string | null;
  amount: number;
  reason: string;
  issuedAt: string;
  status: string;
};

type IssuedDetail = {
  invoice: InvoiceDocument;
  amount: number;
  credited: number;
  balance: number;
  dueDate: string;
  creditNotes: CreditNote[];
};

function creditNoteDate(value?: string | null) {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return formatDate(value);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function creditNoteHtml(note: CreditNote) {
  const reason = note.reason.trim();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(note.creditNoteNo)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1e2a5a;background:#f7f7f8;padding:32px;">
  <h1 style="font-size:28px;font-weight:700;margin:0 0 18px;">CREDIT NOTE</h1>
  <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
    <tr>
      <td style="width:50%;padding:6px 16px 6px 0;border-right:1px solid #d9dde3;border-bottom:1px solid #d9dde3;">Credit Note No: <strong>${escapeHtml(note.creditNoteNo)}</strong></td>
      <td style="padding:6px 0 6px 16px;border-bottom:1px solid #d9dde3;">Member Name: <strong>${escapeHtml(note.memberName)}</strong></td>
    </tr>
    <tr>
      <td style="padding:6px 16px 6px 0;border-right:1px solid #d9dde3;">Date: <strong>${escapeHtml(creditNoteDate(note.issuedAt))}</strong></td>
      <td style="padding:6px 0 6px 16px;">Membership No: <strong>${escapeHtml(note.membershipNo || "—")}</strong></td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr style="background:#e8eaee;">
      <th style="text-align:left;padding:10px 12px;">Description</th>
      <th style="text-align:right;padding:10px 12px;">Amount</th>
    </tr></thead>
    <tbody>
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">Reversal of invoice ${escapeHtml(note.invoiceNo)}${reason ? ` — ${escapeHtml(reason)}` : ""}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatKes(note.amount)}</td>
      </tr>
      <tr>
        <td style="padding:12px;text-align:right;font-weight:700;">Total Amount</td>
        <td style="padding:12px;text-align:right;font-weight:700;">${formatKes(note.amount)}</td>
      </tr>
    </tbody>
  </table>
</body></html>`;
}

function CreditNoteDocument({
  note,
  onOpenInvoice,
}: {
  note: CreditNote;
  onOpenInvoice?: (invoiceId: number) => void;
}) {
  const reason = note.reason.trim();
  return (
    <article className="bg-[#f7f7f8] p-6 text-sm text-[#1e2a5a]">
      <h3 className="text-2xl font-bold tracking-tight">CREDIT NOTE</h3>
      <div className="mt-4 grid border-b border-slate-300 sm:grid-cols-2">
        <div className="space-y-2 border-slate-300 py-2 pr-4 sm:border-r">
          <p>Credit Note No: <span className="font-bold">{note.creditNoteNo}</span></p>
          <p>Date: <span className="font-bold">{creditNoteDate(note.issuedAt)}</span></p>
        </div>
        <div className="space-y-2 py-2 sm:pl-4">
          <p>Member Name: <span className="font-bold">{note.memberName}</span></p>
          <p>Membership No: <span className="font-bold">{note.membershipNo || "—"}</span></p>
        </div>
      </div>
      <table className="mt-5 w-full border-collapse text-left">
        <thead>
          <tr className="bg-[#e8eaee]">
            <th className="px-3 py-2.5 font-semibold">Description</th>
            <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="px-3 py-3">
              Reversal of invoice{" "}
              {onOpenInvoice ? (
                <button
                  type="button"
                  className="font-medium text-sky-700 underline"
                  onClick={() => onOpenInvoice(note.invoiceId)}
                >
                  {note.invoiceNo}
                </button>
              ) : (
                <span className="font-medium text-sky-700 underline">{note.invoiceNo}</span>
              )}
              {reason ? <span> — {reason}</span> : null}
            </td>
            <td className="px-3 py-3 text-right tabular-nums">{formatKes(note.amount)}</td>
          </tr>
          <tr>
            <td className="px-3 py-3 text-right font-bold">Total Amount</td>
            <td className="px-3 py-3 text-right font-bold tabular-nums">{formatKes(note.amount)}</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}

function dateOnly(value?: string | null) {
  return (value ?? "").slice(0, 10);
}

function statusLabel(status: string) {
  const key = status.toUpperCase();
  if (key === "CREDITED") return "Credited";
  if (key === "PARTIAL") return "Partial";
  if (key === "PAID") return "Paid";
  if (key === "ISSUED") return "Issued";
  return status;
}

export function IssuedInvoicesPage() {
  const tenant = useCurrentTenant();
  const brand = tenantDocumentBrand(tenant.data);
  const setup = useInvoiceSetup();
  const membershipTypes = useLookup("membership-types");
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [desk, setDesk] = useState<"invoices" | "credits">("invoices");
  const [year, setYear] = useState(String(currentYear));
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [membershipType, setMembershipType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [viewId, setViewId] = useState<number | null>(null);
  const [viewNote, setViewNote] = useState<CreditNote | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDue, setEditDue] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  const yearNum = Number(year) || currentYear;
  const query = pagedQuery({
    page,
    pageSize,
    year: yearNum,
    search: appliedSearch || undefined,
    membershipType: membershipType || undefined,
  });

  const invoices = useQuery({
    queryKey: ["issued-invoices", yearNum, appliedSearch, membershipType, page, pageSize],
    queryFn: () => apiRequest<PagedResult<IssuedInvoice>>(`/api/finance/invoices/issued?${query}`),
    enabled: desk === "invoices",
  });
  const credits = useQuery({
    queryKey: ["invoice-credit-notes", yearNum, appliedSearch, membershipType, page, pageSize],
    queryFn: () => apiRequest<PagedResult<CreditNote>>(`/api/finance/invoices/credit-notes?${query}`),
    enabled: desk === "credits",
  });
  const detail = useQuery({
    queryKey: ["issued-invoice", viewId],
    enabled: viewId != null,
    queryFn: () => apiRequest<IssuedDetail>(`/api/finance/invoices/issued/${viewId}`),
  });

  useEffect(() => {
    if (!detail.data) return;
    setEditAmount(String(detail.data.amount));
    setEditDue(dateOnly(detail.data.dueDate));
    setCreditAmount(String(detail.data.balance));
    setCreditReason("");
  }, [detail.data]);

  const invoicePage = invoices.data ?? emptyPage<IssuedInvoice>(page, pageSize);
  const creditPage = credits.data ?? emptyPage<CreditNote>(page, pageSize);

  const previewHtml = useMemo(() => {
    if (!detail.data) return "";
    const doc: InvoiceDocument = {
      ...detail.data.invoice,
      ...brand,
      amount: detail.data.amount,
      balance: detail.data.balance,
      dueDate: detail.data.dueDate,
      setup: setup.data,
    };
    return buildInvoiceHtml(doc);
  }, [detail.data, brand, setup.data]);

  function refreshLists() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["issued-invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["invoice-credit-notes"] }),
      queryClient.invalidateQueries({ queryKey: ["issued-invoice", viewId] }),
    ]);
  }

  const saveInvoice = useMutation({
    mutationFn: async () => {
      const amount = Number(editAmount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid amount.");
      if (!editDue) throw new Error("Choose a due date.");
      return apiRequest<IssuedDetail>(`/api/finance/invoices/issued/${viewId}`, {
        method: "PUT",
        body: JSON.stringify({ amount, dueDate: editDue }),
      });
    },
    onSuccess: async () => {
      toast.success("Invoice updated.");
      await refreshLists();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const issueCredit = useMutation({
    mutationFn: async () => {
      const amount = Number(creditAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a credit amount.");
      if (!creditReason.trim()) throw new Error("Add a reason for the credit note.");
      return apiRequest<IssuedDetail>(`/api/finance/invoices/issued/${viewId}/credit-note`, {
        method: "POST",
        body: JSON.stringify({ amount, reason: creditReason.trim() }),
      });
    },
    onSuccess: async (next) => {
      toast.success("Credit note issued. This invoice is reversed by that amount.");
      setCreditReason("");
      setCreditAmount(String(next.balance));
      await refreshLists();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  function applyFilters() {
    setAppliedSearch(search.trim());
    setPage(1);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <PageFrame width="lg">

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
                placeholder="Name, membership no., invoice no."
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

        <Tabs
          value={desk}
          onValueChange={(value) => {
            setDesk(value === "credits" ? "credits" : "invoices");
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="invoices">Generated invoices</TabsTrigger>
            <TabsTrigger value="credits">Credit notes</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="mt-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm text-muted-foreground">{invoicePage.totalCount} issued invoices · {yearNum}</p>
              {invoices.isLoading ? (
                <PageBodyLoading label="Loading invoices…" minHeightClassName="min-h-[14rem]" />
              ) : invoicePage.items.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-muted-foreground">
                  No generated invoices match these filters.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[52rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3">Invoice</th>
                          <th className="py-2 pr-3">Member</th>
                          <th className="py-2 pr-3">No.</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Due</th>
                          <th className="py-2 pr-3 text-right">Amount</th>
                          <th className="py-2 pr-3 text-right">Credited</th>
                          <th className="py-2 pr-3 text-right">Balance</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoicePage.items.map((row) => (
                          <tr key={row.invoiceId} className="border-b border-slate-100 last:border-0">
                            <td className="py-2.5 pr-3 font-medium">{row.invoiceNo}</td>
                            <td className="py-2.5 pr-3">{row.memberName}</td>
                            <td className="py-2.5 pr-3">{row.membershipNo || "—"}</td>
                            <td className="py-2.5 pr-3">{row.membershipType || "—"}</td>
                            <td className="py-2.5 pr-3">{dateOnly(row.dueDate)}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{formatKes(row.amount)}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{formatKes(row.credited)}</td>
                            <td className={cn("py-2.5 pr-3 text-right tabular-nums", row.balance > 0 ? "font-medium text-amber-800" : "")}>
                              {formatKes(row.balance)}
                            </td>
                            <td className="py-2.5 pr-3">{statusLabel(row.status)}</td>
                            <td className="py-2.5 text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    aria-label={`View invoice ${row.invoiceNo}`}
                                    onClick={() => setViewId(row.invoiceId)}
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View</TooltipContent>
                              </Tooltip>
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
                      totalCount={invoicePage.totalCount}
                      totalPages={invoicePage.totalPages}
                      onPageChange={setPage}
                      onPageSizeChange={setPageSize}
                    />
                  </div>
                </>
              )}
            </section>
          </TabsContent>

          <TabsContent value="credits" className="mt-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm text-muted-foreground">
                {creditPage.totalCount} credit notes · {yearNum}. A credit note reverses that invoice by the amount issued.
              </p>
              {credits.isLoading ? (
                <PageBodyLoading label="Loading credit notes…" minHeightClassName="min-h-[14rem]" />
              ) : creditPage.items.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-muted-foreground">
                  No credit notes have been issued for this filter.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3">Credit note no.</th>
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Member name</th>
                          <th className="py-2 pr-3">Membership no.</th>
                          <th className="py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditPage.items.map((row) => (
                          <tr key={row.creditNoteId} className="border-b border-slate-100 last:border-0">
                            <td className="py-2.5 pr-3 font-medium">{row.creditNoteNo}</td>
                            <td className="py-2.5 pr-3">{formatDate(row.issuedAt)}</td>
                            <td className="py-2.5 pr-3">{row.memberName}</td>
                            <td className="py-2.5 pr-3">{row.membershipNo || "—"}</td>
                            <td className="py-2.5 text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    aria-label={`View credit note ${row.creditNoteNo}`}
                                    onClick={() => setViewNote(row)}
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View</TooltipContent>
                              </Tooltip>
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
                      totalCount={creditPage.totalCount}
                      totalPages={creditPage.totalPages}
                      onPageChange={setPage}
                      onPageSizeChange={setPageSize}
                    />
                  </div>
                </>
              )}
            </section>
          </TabsContent>
        </Tabs>

        <Dialog open={viewId != null} onOpenChange={(open) => !open && setViewId(null)}>
          <DialogContent className="flex h-[min(92vh,56rem)] w-[min(96vw,80rem)] max-w-[80rem] flex-col gap-4 overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>
                Invoice {detail.data?.invoice.invoiceNo ?? ""} · {detail.data?.invoice.memberName ?? ""}
              </DialogTitle>
            </DialogHeader>
            {detail.isLoading ? (
              <PageBodyLoading label="Loading invoice…" minHeightClassName="min-h-[18rem]" />
            ) : detail.isError ? (
              <p className="text-sm text-destructive">{extractErrorMessage(detail.error)}</p>
            ) : detail.data ? (
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <iframe title="Invoice preview" className="h-full min-h-[22rem] w-full rounded-xl border border-border bg-white" srcDoc={previewHtml} />
                <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                  <p className="text-sm text-muted-foreground">
                    {detail.data.invoice.membershipNo || "—"} · {statusLabel(detail.data.invoice.status)}
                    <br />
                    Open balance {formatKes(detail.data.balance)} · credited {formatKes(detail.data.credited)}
                  </p>
                  <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edit invoice</p>
                    <label className="grid gap-1 text-sm">
                      <span className="text-muted-foreground">Amount</span>
                      <Input className="bg-white" inputMode="decimal" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-muted-foreground">Due date</span>
                      <Input className="bg-white" type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
                    </label>
                    <Button type="button" size="sm" disabled={saveInvoice.isPending} onClick={() => saveInvoice.mutate()}>
                      {saveInvoice.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                      Save invoice
                    </Button>
                  </div>
                  <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credit note</p>
                    <p className="text-xs text-muted-foreground">
                      A full credit note reverses this invoice. If it was not paid, a joiner becomes Cancelled or Void and a renewal becomes Pending payment. Portal login and future bookings are suspended. Money already paid stays as a credit until it is refunded.
                    </p>
                    <label className="grid gap-1 text-sm">
                      <Label htmlFor="credit-amount">Amount</Label>
                      <Input
                        id="credit-amount"
                        className="bg-white"
                        inputMode="decimal"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        disabled={detail.data.balance <= 0}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label htmlFor="credit-reason">Reason</Label>
                      <Textarea
                        id="credit-reason"
                        value={creditReason}
                        onChange={(e) => setCreditReason(e.target.value)}
                        rows={3}
                        placeholder="Why is this invoice being reversed?"
                        disabled={detail.data.balance <= 0}
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={issueCredit.isPending || detail.data.balance <= 0}
                      onClick={() => issueCredit.mutate()}
                    >
                      {issueCredit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                      Generate credit note
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credit notes on this invoice</p>
                    {detail.data.creditNotes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None issued yet.</p>
                    ) : (
                      detail.data.creditNotes.map((note) => (
                        <CreditNoteDocument
                          key={note.creditNoteId}
                          note={note}
                          onOpenInvoice={(invoiceId) => setViewId(invoiceId)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" onClick={() => setViewId(null)}>
                Close
              </Button>
              <Button type="button" disabled={!previewHtml} onClick={() => previewHtml && printHtmlDocument(previewHtml)}>
                Print invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={viewNote != null} onOpenChange={(open) => !open && setViewNote(null)}>
          <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>Credit note {viewNote?.creditNoteNo}</DialogTitle>
            </DialogHeader>
            {viewNote ? (
              <CreditNoteDocument
                note={viewNote}
                onOpenInvoice={(invoiceId) => {
                  setViewNote(null);
                  setViewId(invoiceId);
                }}
              />
            ) : null}
            <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setViewNote(null)}>
                Close
              </Button>
              <Button
                type="button"
                disabled={!viewNote}
                onClick={() => viewNote && printHtmlDocument(creditNoteHtml(viewNote))}
              >
                Print credit note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageFrame>
    </TooltipProvider>
  );
}
