import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Inbox,
  Loader2,
  Mail,
  MailCheck,
  Printer,
  Search,
  SlidersHorizontal,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { useLookup } from "@/services/membership/lookups";
import { useInvoiceSetup } from "@/services/finance/invoiceSetup";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";
import {
  buildInvoiceHtml,
  buildInvoiceHtmlForEmail,
  downloadExcelCsv,
  printHtmlReport,
  rowsToTableHtml,
  type InvoiceDocument,
} from "@/utils/financeExport";
import type { InvoiceSetup } from "@/utils/invoiceSetup";

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

type RosterRow = QueueRow & { invoiceReceived: boolean };

type CategorySummary = {
  category: string;
  count: number;
  membershipNos: string[];
  amountDue: number;
  arrears: number;
};

const QUEUE_FETCH_SIZE = 5000;

const ROSTER_EXPORT_COLS = [
  { header: "Member", value: (row: RosterRow) => row.memberName },
  { header: "Member no.", value: (row: RosterRow) => row.membershipNo },
  { header: "Category", value: (row: RosterRow) => categoryLabel(row) },
  { header: "Email", value: (row: RosterRow) => row.email ?? "" },
  { header: "Amount due", value: (row: RosterRow) => row.amountDue },
  { header: "Arrears", value: (row: RosterRow) => row.arrearsAmount },
  { header: "Invoice no.", value: (row: RosterRow) => row.invoiceNo ?? "" },
  { header: "Invoice status", value: (row: RosterRow) => (row.invoiceReceived ? "Prepared" : "Not prepared") },
];

async function fetchAllQueueRows(params: {
  year: number;
  search?: string;
  membershipType?: string;
}) {
  const items: QueueRow[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (items.length < total) {
    const batch = await apiRequest<PagedResult<QueueRow>>(
      `/api/finance/invoices/queue?${pagedQuery({
        year: params.year,
        search: params.search,
        membershipType: params.membershipType,
        page,
        pageSize: QUEUE_FETCH_SIZE,
      })}`,
    );
    total = batch.totalCount;
    items.push(...batch.items);
    if (batch.items.length === 0) break;
    page += 1;
  }
  return items;
}

async function fetchRosterRows(params: {
  year: number;
  search?: string;
  membershipType?: string;
  received?: boolean;
}) {
  const items: RosterRow[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (items.length < total) {
    const batch = await apiRequest<PagedResult<RosterRow>>(
      `/api/finance/invoices/roster?${pagedQuery({
        year: params.year,
        search: params.search,
        membershipType: params.membershipType,
        received: params.received,
        page,
        pageSize: QUEUE_FETCH_SIZE,
      })}`,
    );
    total = batch.totalCount;
    items.push(...batch.items);
    if (batch.items.length === 0) break;
    page += 1;
  }
  return items;
}

function categoryLabel(row: QueueRow) {
  return row.membershipType?.trim() || row.membershipTypeCode?.trim() || "Unspecified";
}

function invoiceDueDateIso(year: number) {
  return `${year}-02-28`;
}

function queueRowToInvoice(
  row: QueueRow,
  year: number,
  brand?: { clubName: string; clubLogo: string | null },
  setup?: InvoiceSetup | undefined,
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
    setup,
  };
}

export function InvoiceRunPage() {
  const tenant = useCurrentTenant();
  const brand = tenantDocumentBrand(tenant.data);
  const currentYear = new Date().getFullYear();
  const queryClient = useQueryClient();
  const membershipTypes = useLookup("membership-types");
  const invoiceSetup = useInvoiceSetup();
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
  const [sendEmail, setSendEmail] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [exporting, setExporting] = useState<"print" | "download" | null>(null);

  const yearNum = Number(year) || currentYear;
  const selectedRows = Object.values(selected);
  const selectedCount = selectedRows.length;
  const publishToMember = true;

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
    const types = membershipTypes.data ?? [];
    for (const type of types) {
      map.set(type.name, {
        category: type.name,
        count: 0,
        membershipNos: [],
        amountDue: 0,
        arrears: 0,
      });
    }
    for (const row of selectedRows) {
      const byName = row.membershipType?.trim();
      const byCode = types.find((type) => type.code === row.membershipTypeCode?.trim())?.name;
      const category = byName || byCode || categoryLabel(row);
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
    const ordered = types.map((type) => map.get(type.name)).filter((row): row is CategorySummary => Boolean(row));
    for (const row of map.values()) {
      if (!ordered.some((item) => item.category === row.category)) ordered.push(row);
    }
    return ordered;
  }, [membershipTypes.data, selectedRows]);

  const expectedArrears = selectedRows.reduce((sum, row) => sum + row.arrearsAmount, 0);
  const expectedDue = selectedRows.reduce((sum, row) => sum + row.amountDue, 0);
  const missingEmail = selectedRows.filter((row) => !row.email?.trim()).length;
  const previewRow = selectedRows[Math.min(previewIndex, Math.max(selectedCount - 1, 0))];
  const previewHtml = useMemo(
    () =>
      previewRow
        ? buildInvoiceHtml(queueRowToInvoice(previewRow, yearNum, brand, invoiceSetup.data))
        : "",
    [previewRow, yearNum, brand, invoiceSetup.data],
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
    setSendEmail(false);
    setPreviewIndex(0);
    setDeliveryOpen(true);
  }

  async function selectAllInQueue() {
    try {
      setSelectingAll(true);
      const all = await fetchAllQueueRows({
        year: yearNum,
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(membershipType ? { membershipType } : {}),
      });
      const next: Record<number, QueueRow> = {};
      for (const row of all) next[row.accountId] = row;
      setSelected(next);
      toast.success(`${all.length} member(s) waiting for an invoice selected.`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSelectingAll(false);
    }
  }

  async function exportRoster(kind: "waiting" | "prepared" | "all", mode: "print" | "download") {
    try {
      setExporting(mode);
      const received = kind === "waiting" ? false : kind === "prepared" ? true : undefined;
      const rows = await fetchRosterRows({
        year: yearNum,
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(membershipType ? { membershipType } : {}),
        ...(received !== undefined ? { received } : {}),
      });
      if (rows.length === 0) {
        toast.error("No members in that list for the current filters.");
        return;
      }
      const label =
        kind === "waiting"
          ? "invoices not prepared"
          : kind === "prepared"
            ? "invoices prepared"
            : "members with membership revenue";
      if (mode === "download") {
        downloadExcelCsv(`invoices-${kind}-${yearNum}.csv`, ROSTER_EXPORT_COLS, rows);
        toast.success(`Downloaded ${rows.length} ${label}.`);
      } else {
        const ok = printHtmlReport(
          `${label} · ${yearNum}`,
          rowsToTableHtml(ROSTER_EXPORT_COLS, rows),
          "Aero Club Invoices",
        );
        if (!ok) toast.error("Could not open the print dialog. Try again.");
      }
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setExporting(null);
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
      const invoiceHtmlByAccountId: Record<string, string> = {};
      if (sendEmail) {
        await Promise.all(
          selectedRows.map(async (row) => {
            invoiceHtmlByAccountId[String(row.accountId)] = await buildInvoiceHtmlForEmail(
              queueRowToInvoice(row, yearNum, brand, invoiceSetup.data),
            );
          }),
        );
      }
      const result = await apiRequest<BulkInvoiceResult>("/api/finance/invoices/bulk", {
        method: "POST",
        body: JSON.stringify({
          year: yearNum,
          sendEmail,
          publishToMember,
          accountIds,
          invoiceHtmlByAccountId: sendEmail ? invoiceHtmlByAccountId : undefined,
        }),
      });
      const issued = result.issued ?? 0;
      const emailed = result.emailed ?? 0;
      const published = result.published ?? 0;
      const skipped = result.skippedNoEmail ?? 0;

      if (issued === 0) {
        toast.error("No invoices were generated.");
      } else if (sendEmail) {
        toast.success(
          skipped > 0
            ? `${issued} invoice(s) generated. ${emailed} emailed and ${published} published to dashboards. ${skipped} had no email.`
            : `${issued} invoice(s) emailed and published to member dashboards.`,
        );
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
        description="Generate invoices for members with arrears."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/finance/invoices/setup">
                <SlidersHorizontal className="size-4" />
                Payment setup
              </Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/finance/desk">
                <Wallet className="size-4" />
                Finance desk
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Members with revenue"
          value={runStats?.membersInArrears ?? "—"}
          hint={`Outstanding balances for ${yearNum}`}
          icon={Users}
          loading={stats.isLoading}
        />
        <StatCard
          label="Invoices prepared"
          value={runStats?.membersReceived ?? "—"}
          icon={MailCheck}
          loading={stats.isLoading}
        />
        <StatCard
          label="Invoices not prepared"
          value={runStats?.membersNotReceived ?? "—"}
          icon={Inbox}
          loading={stats.isLoading}
        />
        <StatCard
          label="Total Memeber Revenue"
          value={runStats ? formatKes(runStats.totalArrears) : "—"}
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
              <h2 className="text-base font-semibold">Members with Membership Revenue</h2>
              <p className="text-sm text-muted-foreground">
                {pageData.totalCount} waiting to receive an invoice · {yearNum}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={Boolean(exporting)}>
                    {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Print / download
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => void exportRoster("waiting", "print")}>
                    <Printer className="size-4" />
                    Print not prepared
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void exportRoster("waiting", "download")}>
                    <Download className="size-4" />
                    Download not prepared
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void exportRoster("prepared", "print")}>
                    <Printer className="size-4" />
                    Print invoices prepared
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void exportRoster("prepared", "download")}>
                    <Download className="size-4" />
                    Download invoices prepared
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void exportRoster("all", "print")}>
                    <Printer className="size-4" />
                    Print all with revenue
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void exportRoster("all", "download")}>
                    <Download className="size-4" />
                    Download all with revenue
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              {missingEmail > 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                  {missingEmail} selected member(s) have no email. They will still publish to the dashboard.
                  Enable email only for members who have an address.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" disabled={sending || selectedCount === 0} onClick={openGenerateDialog}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  Invoices{selectedCount > 0 ? ` (${selectedCount})` : ""}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">Summary by member category</h2>
            {categorySummary.length === 0 ? (
              <p className="text-sm text-muted-foreground">Membership categories will appear here.</p>
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
              <h3 className="text-sm font-semibold text-foreground">Email (optional)</h3>
              <label
                htmlFor="invoice-send-email"
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                  sendEmail
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/50",
                )}
              >
                <Checkbox
                  id="invoice-send-email"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked === true)}
                  className="mt-0.5"
                />
                <span className="grid gap-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Mail className="size-4 text-primary" />
                    Also send by email
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Off by default. Enable this to email the invoice as well as publishing it.
                  </span>
                </span>
              </label>
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
              {sendEmail ? "Send to email and dashboard" : "Publish to dashboard"}
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
