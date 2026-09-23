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
  ShieldCheck,
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
  buildInvoiceHtmlWithEmbeddedLogo,
  downloadExcelCsv,
  printHtmlReport,
  rowsToTableHtml,
  type InvoiceDocument,
} from "@/utils/financeExport";
import type { InvoiceSetup } from "@/utils/invoiceSetup";

type FeeType = "JOINING" | "ANNUAL" | "ACCOMMODATION" | "CORKAGE" | "CUSTOM";
type DocumentKind = "INVOICE" | "RECEIPT";

const FEE_TYPES: { id: FeeType; label: string }[] = [
  { id: "JOINING", label: "Joining" },
  { id: "ANNUAL", label: "Annual" },
  { id: "ACCOMMODATION", label: "Accommodation" },
  { id: "CORKAGE", label: "Corkage" },
  { id: "CUSTOM", label: "Custom charges" },
];

type QueueRow = {
  rowKey: string;
  feeType: string;
  audience: string;
  accountId?: number | null;
  applicationId?: number | null;
  chargeId?: number | null;
  subscriptionId: number;
  displayNo: string;
  partyName: string;
  membershipNo?: string;
  memberName?: string;
  membershipType?: string | null;
  membershipTypeCode?: string | null;
  amountDue: number;
  amountPaid: number;
  arrearsAmount: number;
  email?: string | null;
  invoiceNo?: string | null;
  invoiceEmailSent?: boolean;
};

type BulkSubmitResult = {
  submitted: number;
  skipped?: number;
  pendingApproval?: number;
};

type InvoiceRunStats = {
  partiesWithFee: number;
  prepared: number;
  notPrepared: number;
  totalAmount: number;
  membersInArrears?: number;
  membersReceived?: number;
  membersNotReceived?: number;
  totalArrears?: number;
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
  { header: "Party", value: (row: RosterRow) => partyName(row) },
  { header: "No.", value: (row: RosterRow) => partyNo(row) },
  { header: "Audience", value: (row: RosterRow) => audienceLabel(row.audience) },
  { header: "Category", value: (row: RosterRow) => categoryLabel(row) },
  { header: "Email", value: (row: RosterRow) => row.email ?? "" },
  { header: "Amount due", value: (row: RosterRow) => row.amountDue },
  { header: "Arrears", value: (row: RosterRow) => row.arrearsAmount },
  { header: "Document no.", value: (row: RosterRow) => row.invoiceNo ?? "" },
];

function partyName(row: QueueRow) {
  return row.partyName?.trim() || row.memberName?.trim() || "—";
}

function partyNo(row: QueueRow) {
  return row.displayNo?.trim() || row.membershipNo?.trim() || "—";
}

function rowKeyOf(row: QueueRow) {
  return (
    row.rowKey ||
    `${row.audience || "MEMBER"}:${row.accountId ?? 0}:${row.applicationId ?? 0}:${row.chargeId ?? 0}`
  );
}

function audienceLabel(audience?: string | null) {
  const value = (audience ?? "MEMBER").toUpperCase();
  if (value === "APPLICANT") return "Applicant";
  if (value === "GUEST") return "Guest";
  return "Member";
}

function feeTypeLabel(feeType: FeeType) {
  return FEE_TYPES.find((item) => item.id === feeType)?.label ?? feeType;
}

async function fetchAllQueueRows(params: {
  year: number;
  search?: string;
  membershipType?: string;
  feeType: FeeType;
  kind: DocumentKind;
}) {
  const items: QueueRow[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (items.length < total) {
    const batch = await apiRequest<PagedResult<QueueRow>>(
      `/api/finance/billing/queue?${pagedQuery({
        year: params.year,
        search: params.search,
        membershipType: params.membershipType,
        feeType: params.feeType,
        kind: params.kind,
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
  return row.membershipType?.trim() || row.membershipTypeCode?.trim() || audienceLabel(row.audience);
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
  const fee = (row.feeType || "ANNUAL").toUpperCase();
  return {
    invoiceId: 0,
    invoiceNo: row.invoiceNo?.trim() || `INV-${year}-${partyNo(row)}`,
    accountId: row.accountId ?? 0,
    year,
    memberName: partyName(row),
    membershipNo: partyNo(row),
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
    lines: [
      {
        description: `${feeTypeLabel(fee as FeeType)} fee`,
        period: String(year),
        charges: row.amountDue,
        credits: row.amountPaid,
        total: row.arrearsAmount,
      },
    ],
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
  const [feeType, setFeeType] = useState<FeeType>("ANNUAL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<Record<string, QueueRow>>({});
  const [sending, setSending] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [exporting, setExporting] = useState<"print" | "download" | null>(null);

  const yearNum = Number(year) || currentYear;
  const selectedRows = Object.values(selected);
  const selectedCount = selectedRows.length;
  const feeLabel = feeTypeLabel(feeType);

  const queue = useQuery({
    queryKey: ["billing-queue", "INVOICE", feeType, yearNum, appliedSearch, membershipType, page, pageSize],
    queryFn: () =>
      apiRequest<PagedResult<QueueRow>>(
        `/api/finance/billing/queue?${pagedQuery({
          year: yearNum,
          search: appliedSearch || undefined,
          membershipType: membershipType || undefined,
          feeType,
          kind: "INVOICE",
          page,
          pageSize,
        })}`,
      ),
  });
  const stats = useQuery({
    queryKey: ["billing-stats", "INVOICE", feeType, yearNum, membershipType],
    queryFn: () =>
      apiRequest<InvoiceRunStats>(
        `/api/finance/billing/stats?${pagedQuery({
          year: yearNum,
          membershipType: membershipType || undefined,
          feeType,
          kind: "INVOICE",
        })}`,
      ),
  });
  const pageData = queue.data ?? emptyPage<QueueRow>(page, pageSize);
  const rows = pageData.items;
  const runStats = stats.data;
  const partiesWithFee = runStats?.partiesWithFee ?? runStats?.membersInArrears ?? 0;
  const preparedCount = runStats?.prepared ?? runStats?.membersReceived ?? 0;
  const notPreparedCount = runStats?.notPrepared ?? runStats?.membersNotReceived ?? 0;
  const totalAmount = runStats?.totalAmount ?? runStats?.totalArrears ?? 0;

  const pageIds = rows.map((r) => rowKeyOf(r));
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
      current.membershipNos.push(partyNo(row) || "—");
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
  const missingEmail = selectedRows.filter((row) => !row.email?.trim()).length;
  const previewRow = selectedRows[Math.min(previewIndex, Math.max(selectedCount - 1, 0))];
  const previewHtml = useMemo(() => {
    if (!previewRow) return "";
    return buildInvoiceHtml(queueRowToInvoice(previewRow, yearNum, brand, invoiceSetup.data));
  }, [previewRow, yearNum, brand, invoiceSetup.data]);

  function applyFilters() {
    setAppliedSearch(search.trim());
    setPage(1);
  }

  function toggleRow(row: QueueRow, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      const key = rowKeyOf(row);
      if (checked) next[key] = row;
      else delete next[key];
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        const key = rowKeyOf(row);
        if (checked) next[key] = row;
        else delete next[key];
      }
      return next;
    });
  }

  function openGenerateDialog() {
    if (selectedCount === 0) {
      toast.error("Select one or more invoices first.");
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
        feeType,
        kind: "INVOICE",
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(membershipType ? { membershipType } : {}),
      });
      const next: Record<string, QueueRow> = {};
      for (const row of all) next[rowKeyOf(row)] = row;
      setSelected(next);
      toast.success(`${all.length} waiting invoice(s) selected.`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSelectingAll(false);
    }
  }

  async function exportRoster(kind: "waiting" | "prepared" | "all", mode: "print" | "download") {
    try {
      setExporting(mode);
      const rows = await fetchAllQueueRows({
        year: yearNum,
        feeType,
        kind: "INVOICE",
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(membershipType ? { membershipType } : {}),
      });
      const exportRows = rows.map((row) => ({ ...row, invoiceReceived: false }));
      if (exportRows.length === 0) {
        toast.error("No parties in that list for the current filters.");
        return;
      }
      const label = `${kind === "waiting" ? "not submitted" : kind} ${feeLabel.toLowerCase()} invoices`;
      if (mode === "download") {
        downloadExcelCsv(`invoices-${feeType}-${kind}-${yearNum}.csv`, ROSTER_EXPORT_COLS, exportRows);
        toast.success(`Downloaded ${exportRows.length} ${label}.`);
      } else {
        const ok = printHtmlReport(
          `${label} · ${yearNum}`,
          rowsToTableHtml(ROSTER_EXPORT_COLS, exportRows),
          "Aero Club billing",
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
      toast.error("Select one or more invoices first.");
      return;
    }
    try {
      setSending(true);
      const items = await Promise.all(
        selectedRows.map(async (row) => {
          const invoice = queueRowToInvoice(row, yearNum, brand, invoiceSetup.data);
          const html = sendEmail
            ? await buildInvoiceHtmlWithEmbeddedLogo(invoice)
            : buildInvoiceHtml(invoice);
          return {
            rowKey: rowKeyOf(row),
            accountId: row.accountId ?? undefined,
            applicationId: row.applicationId ?? undefined,
            chargeId: row.chargeId ?? undefined,
            documentHtml: html,
          };
        }),
      );
      const result = await apiRequest<BulkSubmitResult>("/api/finance/billing/submit", {
        method: "POST",
        body: JSON.stringify({
          kind: "INVOICE",
          feeType,
          year: yearNum,
          emailAfterApproval: sendEmail,
          items,
        }),
      });
      const submitted = result.submitted ?? 0;
      if (submitted === 0) {
        toast.error("No invoices were submitted for approval.");
      } else {
        toast.success(
          `${submitted} invoice(s) sent to the General Manager for approval` +
            (result.pendingApproval ? ` · ${result.pendingApproval} waiting in the approval queue.` : "."),
        );
      }

      setSelected({});
      setDeliveryOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["billing-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-pending-count"] }),
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
      <div className="flex flex-wrap gap-2">
        {FEE_TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFeeType(item.id);
              setPage(1);
              setSelected({});
            }}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              feeType === item.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-200 bg-white text-slate-700 hover:border-primary/40",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`${feeLabel} with balance`}
          value={stats.isLoading ? "—" : partiesWithFee}
          hint={`Outstanding ${feeLabel.toLowerCase()} for ${yearNum}`}
          icon={Users}
          loading={stats.isLoading}
        />
        <StatCard
          label="Submit for approval"
          value={stats.isLoading ? "—" : preparedCount}
          icon={MailCheck}
          loading={stats.isLoading}
        />
        <StatCard
          label="Waiting to generate"
          value={stats.isLoading ? "—" : notPreparedCount}
          icon={Inbox}
          loading={stats.isLoading}
        />
        <StatCard
          label="Total Membership Revenue"
          value={stats.isLoading ? "—" : formatKes(totalAmount)}
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
              <h2 className="text-base font-semibold">
                Members with Revenue
              </h2>
              <p className="text-sm text-muted-foreground">
                {pageData.totalCount} waiting for an invoice · {yearNum}
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
            <PageBodyLoading label={`Loading ${feeLabel.toLowerCase()} queue…`} minHeightClassName="min-h-[14rem]" />
          ) : rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-muted-foreground">
              No members or applicants are waiting for a {feeLabel.toLowerCase()} invoice in {yearNum}.
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
                      <th className="py-2 pr-3 font-medium">Name</th>
                      <th className="py-2 pr-3 font-medium">No.</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 text-right font-medium">Amount due</th>
                      <th className="py-2 text-right font-medium">Arrears</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const key = rowKeyOf(row);
                      const checked = Boolean(selected[key]);
                      const hasEmail = Boolean(row.email?.trim());
                      return (
                        <tr
                          key={key}
                          className={cn(
                            "border-b border-slate-100 last:border-0",
                            checked ? "bg-primary/5" : "hover:bg-muted/40",
                          )}
                        >
                          <td className="py-2.5 pr-2 align-top">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleRow(row, value === true)}
                              aria-label={`Select ${partyName(row)}`}
                            />
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            <p className="font-medium text-slate-900">{partyName(row)}</p>
                            <p className="text-xs text-muted-foreground">{audienceLabel(row.audience)}</p>
                            {!hasEmail ? (
                              <p className="text-xs text-amber-700">No email on file</p>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-3 align-top font-medium">{partyNo(row)}</td>
                          <td className="py-2.5 pr-3 align-top">{categoryLabel(row)}</td>
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
                  {missingEmail} selected invoice(s) have no email. They can still go to the GM for approval.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" disabled={sending || selectedCount === 0} onClick={openGenerateDialog}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  Send{selectedCount > 0 ? ` (${selectedCount})` : ""}
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
            <DialogTitle>Submit {feeLabel.toLowerCase()} invoices for GM approval</DialogTitle>
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
                    <span className="font-medium">{partyName(previewRow)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {partyNo(previewRow)} · {formatKes(previewRow.arrearsAmount)}
                    </span>
                  </p>
                  <div className="invoice-preview-frame min-h-[22rem] flex-1 rounded-xl border border-border bg-white">
                    <iframe
                      title={`Preview for ${partyName(previewRow)}`}
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
                    Off by default. If enabled, the recipient is emailed only after the General Manager approves.
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
              {sendEmail ? "Submit and email after approval" : "Submit for GM approval"}
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
