import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  LayoutDashboard,
  Loader2,
  Mail,
  MailCheck,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";

import { ListPagination } from "@/components/common/ListPagination";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { useLookup } from "@/services/membership/lookups";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";
import { buildInvoiceHtml, type InvoiceDocument } from "@/utils/financeExport";

type QueueRow = {
  accountId: number;
  subscriptionId: number;
  membershipNo: string;
  memberName: string;
  membershipType?: string | null;
  membershipTypeCode?: string | null;
  amountDue: number;
  amountPaid: number;
  arrearsAmount: number;
  email?: string | null;
  invoiceNo?: string | null;
  invoiceEmailSent: boolean;
};

type BulkInvoiceResult = {
  issued: number;
  year: number;
  emailed?: number;
  published?: number;
  skippedNoEmail?: number;
};

type InvoiceRunStats = {
  membersInArrears: number;
  membersReceived: number;
  membersNotReceived: number;
  totalArrears: number;
};

type CategorySummary = {
  category: string;
  count: number;
  membershipNos: string[];
  amountDue: number;
  arrears: number;
};

type DeliveryMode = "both" | "email" | "dashboard";

const DELIVERY_OPTIONS: {
  value: DeliveryMode;
  title: string;
  description: string;
}[] = [
  {
    value: "both",
    title: "Email and member dashboard",
    description: "Send the invoice by email and publish it on the member Payment page.",
  },
  {
    value: "email",
    title: "Email only",
    description: "Email the invoice. It will not appear on the member dashboard.",
  },
  {
    value: "dashboard",
    title: "Dashboard only",
    description: "Publish to the member dashboard. No email will be sent.",
  },
];

function categoryLabel(row: QueueRow) {
  return row.membershipType?.trim() || row.membershipTypeCode?.trim() || "Unspecified";
}

function deliveryFlags(mode: DeliveryMode) {
  return {
    sendEmail: mode === "both" || mode === "email",
    publishToMember: mode === "both" || mode === "dashboard",
  };
}

function invoiceDueDateIso(year: number) {
  return `${year}-02-28`;
}

function queueRowToInvoice(
  row: QueueRow,
  year: number,
  brand?: { clubName: string; clubLogo: string | null },
): InvoiceDocument {
  return {
    invoiceId: 0,
    invoiceNo: row.invoiceNo?.trim() || `INV-${year}-${String(row.accountId).padStart(6, "0")}`,
    accountId: row.accountId,
    year,
    memberName: row.memberName,
    membershipNo: row.membershipNo,
    membershipType: row.membershipType,
    amount: row.amountDue,
    amountPaid: row.amountPaid,
    balance: row.arrearsAmount,
    dueDate: invoiceDueDateIso(year),
    issuedAt: new Date().toISOString(),
    status: row.amountPaid > 0.01 ? "PARTIAL" : "ISSUED",
    emailSent: false,
    sentToEmail: row.email,
    clubName: brand?.clubName,
    clubLogo: brand?.clubLogo,
  };
}

export function InvoiceRunPage() {
  const tenant = useCurrentTenant();
  const brand = tenantDocumentBrand(tenant.data);
  const currentYear = new Date().getFullYear();
  const queryClient = useQueryClient();
  const membershipTypes = useLookup("membership-types");
  const [year, setYear] = useState(String(currentYear));
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [membershipType, setMembershipType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<Record<number, QueueRow>>({});
  const [sending, setSending] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("both");
  const [previewIndex, setPreviewIndex] = useState(0);

  const yearNum = Number(year) || currentYear;
  const selectedRows = Object.values(selected);
  const selectedCount = selectedRows.length;
  const { sendEmail, publishToMember } = deliveryFlags(deliveryMode);

  const queue = useQuery({
    queryKey: ["invoice-queue", yearNum, appliedSearch, membershipType, page, pageSize],
    queryFn: () =>
      apiRequest<PagedResult<QueueRow>>(
        `/api/finance/invoices/queue?${pagedQuery({
          year: yearNum,
          search: appliedSearch || undefined,
          membershipType: membershipType || undefined,
          page,
          pageSize,
        })}`,
      ),
  });
  const stats = useQuery({
    queryKey: ["invoice-stats", yearNum, membershipType],
    queryFn: () =>
      apiRequest<InvoiceRunStats>(
        `/api/finance/invoices/stats?${pagedQuery({
          year: yearNum,
          membershipType: membershipType || undefined,
        })}`,
      ),
  });
  const pageData = queue.data ?? emptyPage<QueueRow>(page, pageSize);
  const rows = pageData.items;
  const runStats = stats.data;

  const pageIds = rows.map((r) => r.accountId);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected[id]);

  const categorySummary = useMemo(() => {
    const map = new Map<string, CategorySummary>();
    for (const row of selectedRows) {
      const category = categoryLabel(row);
      const current = map.get(category) ?? {
        category,
        count: 0,
        membershipNos: [],
        amountDue: 0,
        arrears: 0,
      };
      current.count += 1;
      current.membershipNos.push(row.membershipNo || "—");
      current.amountDue += row.amountDue;
      current.arrears += row.arrearsAmount;
      map.set(category, current);
    }
    return [...map.values()].sort((a, b) => b.arrears - a.arrears);
  }, [selectedRows]);

  const expectedArrears = selectedRows.reduce((sum, row) => sum + row.arrearsAmount, 0);
  const expectedDue = selectedRows.reduce((sum, row) => sum + row.amountDue, 0);
  const missingEmail = selectedRows.filter((row) => !row.email?.trim()).length;
  const previewRow = selectedRows[Math.min(previewIndex, Math.max(selectedCount - 1, 0))];
  const previewHtml = useMemo(
    () => (previewRow ? buildInvoiceHtml(queueRowToInvoice(previewRow, yearNum, brand)) : ""),
    [previewRow, yearNum, brand],
  );

  function applyFilters() {
    setAppliedSearch(search.trim());
    setPage(1);
  }

  function toggleRow(row: QueueRow, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[row.accountId] = row;
      else delete next[row.accountId];
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (checked) next[row.accountId] = row;
        else delete next[row.accountId];
      }
      return next;
    });
  }

  function openGenerateDialog() {
    if (selectedCount === 0) {
      toast.error("Select one or more members first.");
      return;
    }
    setDeliveryMode("both");
    setPreviewIndex(0);
    setDeliveryOpen(true);
  }

  async function selectAllInQueue() {
    try {
      setSelectingAll(true);
      const all = await apiRequest<PagedResult<QueueRow>>(
        `/api/finance/invoices/queue?${pagedQuery({
          year: yearNum,
          search: appliedSearch || undefined,
          membershipType: membershipType || undefined,
          page: 1,
          pageSize: Math.min(Math.max(pageData.totalCount, 1), 5000),
        })}`,
      );
      const next: Record<number, QueueRow> = {};
      for (const row of all.items) next[row.accountId] = row;
      setSelected(next);
      toast.success(`${all.items.length} member(s) waiting for an invoice selected.`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSelectingAll(false);
    }
  }

  async function sendSelected() {
    if (selectedCount === 0) {
      toast.error("Select one or more members first.");
      return;
    }
    try {
      setSending(true);
      const accountIds = selectedRows.map((row) => row.accountId);
      const result = await apiRequest<BulkInvoiceResult>("/api/finance/invoices/bulk", {
        method: "POST",
        body: JSON.stringify({
          year: yearNum,
          sendEmail,
          publishToMember,
          accountIds,
        }),
      });
      const issued = result.issued ?? 0;
      const emailed = result.emailed ?? 0;
      const published = result.published ?? 0;
      const skipped = result.skippedNoEmail ?? 0;

      if (issued === 0) {
        toast.error("No invoices were generated.");
      } else if (sendEmail && publishToMember) {
        toast.success(
          skipped > 0
            ? `${issued} invoice(s) generated. ${emailed} emailed and ${published} published to dashboards. ${skipped} had no email.`
            : `${issued} invoice(s) emailed and published to member dashboards.`,
        );
      } else if (sendEmail) {
        if (emailed > 0 && skipped === 0) {
          toast.success(`${emailed} invoice(s) emailed. Those members have left this queue.`);
        } else if (emailed > 0) {
          toast.success(
            `${emailed} emailed. ${skipped} stay here because they have no email or the send failed.`,
          );
        } else {
          toast.error(
            skipped > 0
              ? "No invoices were emailed. Members without an email stay in the queue."
              : "No invoices were sent.",
          );
        }
      } else {
        toast.success(`${published} invoice(s) published to member dashboards.`);
      }

      setSelected({});
      setDeliveryOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoice-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["invoice-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["member-invoice-current"] }),
      ]);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <PageFrame width="lg">
      <PageHeader
        title=""
        description="Generate invoices for members with arrears and send them by email, to the member dashboard, or both."
        actions={
          <Button type="button" variant="outline" asChild>
            <Link to="/finance/desk">
              <Wallet className="size-4" />
              Finance desk
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Members with arrears"
          value={runStats?.membersInArrears ?? "—"}
          hint={`Outstanding balances for ${yearNum}`}
          icon={Users}
          loading={stats.isLoading}
        />
        <StatCard
          label="Received invoice"
          value={runStats?.membersReceived ?? "—"}
          hint="Emailed or published to dashboard"
          icon={MailCheck}
          loading={stats.isLoading}
        />
        <StatCard
          label="Not received invoice"
          value={runStats?.membersNotReceived ?? "—"}
          hint="Still waiting in this queue"
          icon={Inbox}
          loading={stats.isLoading}
        />
        <StatCard
          label="Total arrears"
          value={runStats ? formatKes(runStats.totalArrears) : "—"}
          hint="Amount outstanding for this year"
          icon={Banknote}
          loading={stats.isLoading}
        />
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
              setSelected({});
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
              placeholder="Name, membership no., email"
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
        <Button type="button" variant="outline" onClick={applyFilters}>
          Apply filters
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Members with arrears</h2>
              <p className="text-sm text-muted-foreground">
                {pageData.totalCount} waiting to receive an invoice · {yearNum}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectingAll || pageData.totalCount === 0}
                onClick={() => void selectAllInQueue()}
              >
                {selectingAll ? <Loader2 className="size-4 animate-spin" /> : null}
                Select All
              </Button>
              {selectedCount > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected({})}>
                  Clear selection
                </Button>
              ) : null}
            </div>
          </div>

          {queue.isLoading ? (
            <PageBodyLoading label="Loading members in arrears…" minHeightClassName="min-h-[14rem]" />
          ) : rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-muted-foreground">
              Everyone in this filter has already received an invoice, or there are no arrears for {yearNum}.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 py-2 pr-2">
                        <Checkbox
                          checked={allOnPageSelected}
                          onCheckedChange={(value) => togglePage(value === true)}
                          aria-label="Select all on this page"
                        />
                      </th>
                      <th className="py-2 pr-3 font-medium">Member</th>
                      <th className="py-2 pr-3 font-medium">Member no.</th>
                      <th className="py-2 pr-3 text-right font-medium">Amount due</th>
                      <th className="py-2 text-right font-medium">Arrears</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const checked = Boolean(selected[row.accountId]);
                      const hasEmail = Boolean(row.email?.trim());
                      return (
                        <tr
                          key={row.accountId}
                          className={cn(
                            "border-b border-slate-100 last:border-0",
                            checked ? "bg-primary/5" : "hover:bg-muted/40",
                          )}
                        >
                          <td className="py-2.5 pr-2 align-top">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleRow(row, value === true)}
                              aria-label={`Select ${row.memberName}`}
                            />
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            <p className="font-medium text-slate-900">{row.memberName}</p>
                            {!hasEmail ? (
                              <p className="text-xs text-amber-700">No email on file</p>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-3 align-top font-medium">{row.membershipNo || "—"}</td>
                          <td className="py-2.5 pr-3 align-top text-right tabular-nums">
                            {formatKes(row.amountDue)}
                          </td>
                          <td className="py-2.5 align-top text-right tabular-nums font-semibold text-slate-900">
                            {formatKes(row.arrearsAmount)}
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

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_auto] gap-3 bg-primary/5 p-4">
              <div>
                <h2 className="text-base font-semibold">Expected Amount</h2>
              </div>
              <div className="rounded-lg bg-primary px-4 py-3 text-right text-primary-foreground">
                <p className="text-2xl font-bold tabular-nums">{formatKes(expectedArrears)}</p>
              </div>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <p>
                Amount due on selection:{" "}
                <span className="font-semibold tabular-nums">{formatKes(expectedDue)}</span>
              </p>
              {missingEmail > 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                  {missingEmail} selected member(s) have no email. Choose dashboard only, or they stay in
                  this queue if you email.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" disabled={sending || selectedCount === 0} onClick={openGenerateDialog}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  Generate invoices{selectedCount > 0 ? ` (${selectedCount})` : ""}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">Summary by member category</h2>
            {categorySummary.length === 0 ? (
              <p className="text-sm text-muted-foreground">Select members to see category totals.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Category</th>
                      <th className="py-2 pr-3 font-medium">Members</th>
                      <th className="py-2 text-right font-medium">Arrears</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorySummary.map((row) => (
                      <tr key={row.category} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-3 align-top">
                          <p className="font-medium">{row.category}</p>
                        </td>
                        <td className="py-2.5 pr-3 align-top tabular-nums">{row.count}</td>
                        <td className="py-2.5 align-top text-right tabular-nums font-medium">
                          {formatKes(row.arrears)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="py-2.5 pr-3">Total</td>
                      <td className="py-2.5 pr-3 tabular-nums">{selectedCount}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatKes(expectedArrears)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      <Dialog open={deliveryOpen} onOpenChange={(open) => !sending && setDeliveryOpen(open)}>
        <DialogContent className="flex h-[min(92vh,56rem)] w-[min(96vw,80rem)] max-w-[80rem] flex-col gap-4 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Send invoices</DialogTitle>
            <DialogDescription>
              Review {selectedCount} selected invoice{selectedCount === 1 ? "" : "s"}, then choose where they
              should go.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="flex min-h-0 flex-col gap-3">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Invoice review</h3>
                </div>
                {selectedCount > 1 && previewRow ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      disabled={previewIndex <= 0}
                      onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                      aria-label="Previous invoice"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <p className="min-w-[7.5rem] text-center text-xs text-muted-foreground">
                      {previewIndex + 1} of {selectedCount}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      disabled={previewIndex >= selectedCount - 1}
                      onClick={() => setPreviewIndex((i) => Math.min(selectedCount - 1, i + 1))}
                      aria-label="Next invoice"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              {previewRow ? (
                <>
                  <p className="shrink-0 text-sm text-foreground">
                    <span className="font-medium">{previewRow.memberName}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {previewRow.membershipNo || "—"} · {formatKes(previewRow.arrearsAmount)}
                    </span>
                  </p>
                  <div className="invoice-preview-frame min-h-[22rem] flex-1 rounded-xl border border-border bg-white">
                    <iframe
                      title={`Invoice preview for ${previewRow.memberName}`}
                      srcDoc={previewHtml}
                      onLoad={(event) => {
                        const frame = event.currentTarget;
                        const doc = frame.contentDocument;
                        if (!doc?.documentElement) return;
                        const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 900);
                        frame.style.height = `${height + 24}px`;
                      }}
                    />
                  </div>
                </>
              ) : null}
            </section>

            <section className="flex min-h-0 flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Choose where they should go</h3>
              <RadioGroup
                value={deliveryMode}
                onValueChange={(value) => setDeliveryMode(value as DeliveryMode)}
                className="gap-2"
              >
                {DELIVERY_OPTIONS.map((option) => {
                  const selectedOption = deliveryMode === option.value;
                  return (
                    <label
                      key={option.value}
                      htmlFor={`invoice-delivery-${option.value}`}
                      onClick={() => setDeliveryMode(option.value)}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                        selectedOption
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-muted/50",
                      )}
                    >
                      <RadioGroupItem
                        id={`invoice-delivery-${option.value}`}
                        value={option.value}
                        className="mt-0.5"
                      />
                      <span className="grid gap-1">
                        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {option.value === "dashboard" ? (
                            <LayoutDashboard className="size-4 text-primary" />
                          ) : (
                            <Mail className="size-4 text-primary" />
                          )}
                          {option.title}
                        </span>
                        <span className="text-sm text-muted-foreground">{option.description}</span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
              {sendEmail && missingEmail > 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {missingEmail} selected member(s) have no email and will stay in this queue if you send by
                  email.
                </p>
              ) : null}
            </section>
          </div>

          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" disabled={sending} onClick={() => setDeliveryOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={sending} onClick={() => void sendSelected()}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : null}
              {deliveryMode === "email"
                ? "Send by email"
                : deliveryMode === "dashboard"
                  ? "Publish to dashboard"
                  : "Send to email and dashboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Users;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="rounded-md bg-primary/10 p-1.5 text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      {loading ? (
        <Loader2 className="mt-2 size-5 animate-spin text-muted-foreground" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
