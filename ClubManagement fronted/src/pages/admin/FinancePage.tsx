import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Banknote,
  Check,
  Download,
  Loader2,
  MoreHorizontal,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  ScrollText,
  Search,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { DirectSettlementModal } from "@/components/finance/DirectSettlementModal";
import { MembershipReceiptDialog } from "@/components/finance/MembershipReceipt";
import { MemberStatementDialog } from "@/components/finance/MemberStatementDialog";
import {
  PaymentProofBadge,
  PaymentProofSheet,
} from "@/components/finance/PaymentProofPreview";
import {
  VerifyIssueReceiptDrawer,
  type VerifyClearancePayload,
} from "@/components/finance/VerifyIssueReceiptDrawer";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hasAnyRole, readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { useLookup } from "@/services/membership/lookups";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import {
  downloadExcelCsv,
  printHtmlReport,
  rowsToTableHtml,
} from "@/utils/financeExport";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

type PaymentRow = {
  transactionId: number;
  receiptNumber?: string | null;
  memberName?: string | null;
  membershipNo?: string | null;
  membershipType?: string | null;
  membershipTypeCode?: string | null;
  method?: string | null;
  methodCode?: string | null;
  status?: string | null;
  statusCode?: string | null;
  amount: number;
  paymentDate?: string | null;
  mpesaCode?: string | null;
  chequeNo?: string | null;
  feeType?: string | null;
  feeTypeCode?: string | null;
  chequeBankName?: string | null;
  chequeBankCode?: string | null;
  chequeDate?: string | null;
  chequeFileName?: string | null;
  chequeFileUrl?: string | null;
  applicationId?: number | null;
  applicationNo?: string | null;
  submittedAt?: string | null;
  referenceNote?: string | null;
};

type SubRow = {
  subscriptionId: number;
  accountId: number;
  membershipNo: string;
  memberName: string;
  membershipType?: string | null;
  membershipTypeCode?: string | null;
  year: number;
  amountDue: number;
  amountPaid: number;
  arrearsAmount: number;
  status: string;
  accountStatus?: string | null;
  accountStatusCode?: string | null;
};

type DeskSummary = {
  pendingClearance: number;
  todaysCollections: number;
  unreceiptedPayments: number;
  membersInArrears: number;
};

type DeskTab = "pending" | "settled" | "arrears";

type RenewalRunResult = {
  year: number;
  asOf: string;
  subscriptionsGenerated: number;
  membersPosted: number;
  membersRemoved: number;
  totalUpdated: number;
  futureYearsCleared?: number;
  invoicesIssued?: number;
};

function methodKey(row: PaymentRow) {
  return `${row.methodCode ?? ""} ${row.method ?? ""}`.toUpperCase().replace(/[-\s]/g, "_");
}

function needsClearance(row: PaymentRow) {
  const key = methodKey(row);
  return (
    key.includes("CHEQUE")
    || key.includes("CARD")
    || key.includes("CREDIT")
    || key.includes("MPESA")
    || key.includes("BANK")
  );
}

function isPendingStatus(status?: string | null) {
  const s = (status ?? "").toUpperCase().replace(/[-\s]/g, "_");
  return s === "PENDING" || s === "INITIATED" || s === "UNCLEARED";
}

function isSettledStatus(status?: string | null) {
  const s = (status ?? "").toUpperCase().replace(/[-\s]/g, "_");
  return (
    s === "PAID"
    || s === "WAIVED"
    || s === "SETTLED"
    || s === "PARTIALLY_PAID"
    || s === "REFUNDED"
    || s === "REVERSED"
  );
}

function isReversibleStatus(status?: string | null) {
  const s = (status ?? "").toUpperCase().replace(/[-\s]/g, "_");
  return s === "PAID" || s === "WAIVED" || s === "PARTIALLY_PAID" || s === "SETTLED";
}

function isRefundableStatus(status?: string | null) {
  const s = (status ?? "").toUpperCase().replace(/[-\s]/g, "_");
  return s === "PAID" || s === "WAIVED" || s === "PARTIALLY_PAID" || s === "SETTLED";
}

function isReceiptViewableStatus(status?: string | null) {
  const s = (status ?? "").toUpperCase().replace(/[-\s]/g, "_");
  return s === "PAID" || s === "WAIVED" || s === "PARTIALLY_PAID" || s === "SETTLED" || s === "REFUNDED";
}

function formatDay(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 10);
}

function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return formatDay(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function payerLabel(row: PaymentRow) {
  const name = row.memberName || "—";
  if (row.membershipNo) return `${name} · ${row.membershipNo}`;
  if (row.applicationNo) return `${name} · ${row.applicationNo}`;
  if (row.applicationId) return `${name} · APP-${String(row.applicationId).padStart(4, "0")}`;
  return name;
}

function proofLabel(row: PaymentRow) {
  if (row.chequeFileName) return row.chequeFileName;
  if (row.mpesaCode) return row.mpesaCode;
  if (row.chequeNo) return `Cheque ${row.chequeNo}`;
  return "—";
}

const PAYMENT_EXPORT_COLS = [
  { header: "Date", value: (r: PaymentRow) => formatStamp(r.submittedAt || r.paymentDate) },
  { header: "Payer", value: (r: PaymentRow) => payerLabel(r) },
  { header: "Membership type", value: (r: PaymentRow) => (r.membershipNo ? r.membershipType || r.membershipTypeCode || "" : "") },
  { header: "Fee type", value: (r: PaymentRow) => r.feeType || r.feeTypeCode || "" },
  { header: "Method", value: (r: PaymentRow) => r.method || r.methodCode || "" },
  { header: "Reference", value: (r: PaymentRow) => proofLabel(r) },
  { header: "Receipt", value: (r: PaymentRow) => r.receiptNumber || "" },
  { header: "Amount (Ksh)", value: (r: PaymentRow) => r.amount },
  { header: "Status", value: (r: PaymentRow) => r.status || r.statusCode || "" },
];

const ARREARS_EXPORT_COLS = [
  { header: "Member", value: (r: SubRow) => `${r.membershipNo} · ${r.memberName}` },
  { header: "Membership type", value: (r: SubRow) => r.membershipType || r.membershipTypeCode || "" },
  { header: "Year", value: (r: SubRow) => r.year },
  { header: "Due (Ksh)", value: (r: SubRow) => r.amountDue },
  { header: "Paid (Ksh)", value: (r: SubRow) => r.amountPaid },
  { header: "Arrears (Ksh)", value: (r: SubRow) => r.arrearsAmount },
  { header: "Status", value: (r: SubRow) => r.status },
];

function setRecordEntry<T>(
  prev: Record<number, T>,
  id: number,
  row: T | undefined,
  checked: boolean,
): Record<number, T> {
  if (checked) {
    if (!row) return prev;
    return { ...prev, [id]: row };
  }
  if (!(id in prev)) return prev;
  const next = { ...prev };
  delete next[id];
  return next;
}

function setRecordPage<T>(
  prev: Record<number, T>,
  rows: T[],
  getId: (row: T) => number,
  checked: boolean,
): Record<number, T> {
  const next = { ...prev };
  if (checked) {
    for (const row of rows) next[getId(row)] = row;
  } else {
    for (const row of rows) delete next[getId(row)];
  }
  return next;
}

export function FinancePage() {
  const currentYear = new Date().getFullYear();
  const queryClient = useQueryClient();
  const user = readUser();
  const canRunPosting = hasAnyRole(user, ["GENERAL_MANAGER", "CHAIRMAN", "ADMIN"]);
  const canAdjustLedger = hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "TREASURER", "CHAIRMAN"]);
  const membershipTypes = useLookup("membership-types");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reviewRow, setReviewRow] = useState<PaymentRow | null>(null);
  const [rejectRow, setRejectRow] = useState<PaymentRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [refundRow, setRefundRow] = useState<PaymentRow | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [reverseRow, setReverseRow] = useState<PaymentRow | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [statementOpen, setStatementOpen] = useState(false);
  const [receiptTxId, setReceiptTxId] = useState<number | null>(null);
  const [desk, setDesk] = useState<DeskTab>("pending");
  const [year, setYear] = useState(String(currentYear));
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [feeTypeFilter, setFeeTypeFilter] = useState("");
  const [membershipTypeFilter, setMembershipTypeFilter] = useState("");
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedPayments, setSelectedPayments] = useState<Record<number, PaymentRow>>({});
  const [exportBusy, setExportBusy] = useState(false);
  const selectedPaymentIds = Object.values(selectedPayments).map((r) => r.transactionId);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [renewalBusy, setRenewalBusy] = useState(false);
  const [lastRenewal, setLastRenewal] = useState<RenewalRunResult | null>(null);
  const [renewalStep, setRenewalStep] = useState<0 | 1 | 2>(0);
  const [proofRow, setProofRow] = useState<PaymentRow | null>(null);

  const yearNum = Number(year) || currentYear;

  const summary = useQuery({
    queryKey: ["finance-summary", yearNum],
    queryFn: () => apiRequest<DeskSummary>(`/api/finance/summary?year=${yearNum}`),
  });

  const pending = useQuery({
    queryKey: [
      "payments",
      "pending-approval",
      appliedSearch,
      methodFilter,
      feeTypeFilter,
      membershipTypeFilter,
      paymentPage,
      paymentPageSize,
    ],
    queryFn: () =>
      apiRequest<PagedResult<PaymentRow>>(
        `/api/finance/payments?${pagedQuery({
          page: paymentPage,
          pageSize: paymentPageSize,
          status: "PENDING",
          search: appliedSearch || undefined,
          method: methodFilter || undefined,
          feeType: feeTypeFilter || undefined,
          membershipType: membershipTypeFilter || undefined,
        })}`,
      ),
    enabled: desk === "pending",
  });

  const settled = useQuery({
    queryKey: [
      "payments",
      "settled",
      yearNum,
      appliedSearch,
      methodFilter,
      feeTypeFilter,
      membershipTypeFilter,
      paymentPage,
      paymentPageSize,
    ],
    queryFn: () =>
      apiRequest<PagedResult<PaymentRow>>(
        `/api/finance/payments?${pagedQuery({
          page: paymentPage,
          pageSize: paymentPageSize,
          status: "SETTLED",
          year: yearNum,
          search: appliedSearch || undefined,
          method: methodFilter || undefined,
          feeType: feeTypeFilter || undefined,
          membershipType: membershipTypeFilter || undefined,
        })}`,
      ),
    enabled: desk === "settled",
  });

  const subs = useQuery({
    queryKey: ["subscriptions", "arrears", yearNum, appliedSearch, membershipTypeFilter, subPage, subPageSize],
    queryFn: () =>
      apiRequest<PagedResult<SubRow>>(
        `/api/finance/subscriptions?${pagedQuery({
          year: yearNum,
          page: subPage,
          pageSize: subPageSize,
          search: appliedSearch || undefined,
          arrearsOnly: true,
          membershipType: membershipTypeFilter || undefined,
        })}`,
      ),
    enabled: desk === "arrears",
  });

  const pendingPageData = pending.data ?? emptyPage<PaymentRow>(paymentPage, paymentPageSize);
  const settledPageData = settled.data ?? emptyPage<PaymentRow>(paymentPage, paymentPageSize);
  const subPageData = subs.data ?? emptyPage<SubRow>(subPage, subPageSize);

  const pendingRows = useMemo(
    () => pendingPageData.items.filter((row) => needsClearance(row) && isPendingStatus(row.status ?? row.statusCode)),
    [pendingPageData.items],
  );

  async function refreshDesk() {
    await Promise.all([
      summary.refetch(),
      pending.refetch(),
      settled.refetch(),
      subs.refetch(),
      queryClient.invalidateQueries({ queryKey: ["application-payments"] }),
      queryClient.invalidateQueries({ queryKey: ["applications"] }),
      queryClient.invalidateQueries({ queryKey: ["manager-readiness"] }),
      queryClient.invalidateQueries({ queryKey: ["member-subscription"] }),
      queryClient.invalidateQueries({ queryKey: ["member-payments"] }),
      queryClient.invalidateQueries({ queryKey: ["member-invoice-current"] }),
    ]);
  }

  const approve = useMutation({
    mutationFn: (payload: VerifyClearancePayload) =>
      apiRequest<PaymentRow>(`/api/finance/payments/${payload.transactionId}/approve`, {
        method: "POST",
        body: JSON.stringify({
          receiptNumber: payload.receiptNumber.trim() || undefined,
          chequeNo: payload.chequeNo.trim() || undefined,
          chequeBankName: payload.chequeBankName.trim() || undefined,
          chequeBankCode: payload.chequeBankCode.trim() || undefined,
          mpesaCode: payload.mpesaCode.trim() || undefined,
          amountCleared: payload.amountCleared,
        }),
      }),
    onMutate: ({ transactionId }) => setBusyId(transactionId),
    onSuccess: async (row) => {
      toast.success(`Cleared ${row.receiptNumber ?? "payment"} and marked as paid.`);
      setReviewRow(null);
      setReceiptTxId(row.transactionId);
      await refreshDesk();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
    onSettled: () => setBusyId(null),
  });

  const reject = useMutation({
    mutationFn: ({ transactionId, reason }: { transactionId: number; reason: string }) =>
      apiRequest<PaymentRow>(`/api/finance/payments/${transactionId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onMutate: ({ transactionId }) => setBusyId(transactionId),
    onSuccess: async () => {
      toast.success("Submission rejected. The unpaid invoice is open again; no cash was issued.");
      setReviewRow(null);
      setRejectRow(null);
      setRejectReason("");
      await refreshDesk();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
    onSettled: () => setBusyId(null),
  });

  const refund = useMutation({
    mutationFn: ({ transactionId, reason }: { transactionId: number; reason: string }) =>
      apiRequest<PaymentRow>(`/api/finance/payments/${transactionId}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onMutate: ({ transactionId }) => setBusyId(transactionId),
    onSuccess: async () => {
      toast.success("Payment refunded. Ledger and clearance queues were updated.");
      setRefundRow(null);
      setRefundReason("");
      setReviewRow(null);
      await refreshDesk();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
    onSettled: () => setBusyId(null),
  });

  const reverse = useMutation({
    mutationFn: ({ transactionId, reason }: { transactionId: number; reason: string }) =>
      apiRequest<PaymentRow>(`/api/finance/payments/${transactionId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onMutate: ({ transactionId }) => setBusyId(transactionId),
    onSuccess: async () => {
      toast.success("Payment reversed on the books. The original stays on Settled bills.");
      setReverseRow(null);
      setReverseReason("");
      await refreshDesk();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
    onSettled: () => setBusyId(null),
  });

  async function runAnnualRenewal() {
    try {
      setRenewalBusy(true);
      const result = await apiRequest<RenewalRunResult>(`/api/finance/posting/${yearNum}`, { method: "POST" });
      setLastRenewal(result);
      const parts = [
        `${result.subscriptionsGenerated} subscription(s) generated`,
        result.futureYearsCleared
          ? `${result.futureYearsCleared} later-year demo row(s) cleared`
          : null,
        result.membersPosted > 0 ? `${result.membersPosted} posted` : null,
        result.membersRemoved > 0 ? `${result.membersRemoved} unpaid (still active)` : null,
        result.invoicesIssued ? `${result.invoicesIssued} invoice(s) issued` : null,
      ].filter(Boolean);
      toast.success(`Annual renewal for ${result.year}: ${parts.join(" · ") || "no changes"}.`);
      if ((result.futureYearsCleared ?? 0) > 0) {
        toast.message(`Member Payment cards return to ${result.year} (unpaid later years removed).`);
      } else if (result.year > currentYear) {
        toast.message(`Member Payment will show ${result.year} dues after refresh.`);
      }
      setDesk("arrears");
      await refreshDesk();
      void queryClient.invalidateQueries({ queryKey: ["member-subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["member-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["member-payments"] });
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setRenewalBusy(false);
    }
  }

  function applyFilters() {
    setAppliedSearch(search.trim());
    setPaymentPage(1);
    setSubPage(1);
    setSelectedPayments({});
  }

  useEffect(() => {
    setSelectedPayments({});
  }, [desk, membershipTypeFilter, methodFilter, feeTypeFilter, yearNum]);

  async function fetchAllPaymentsForExport(status: "PENDING" | "SETTLED") {
    const result = await apiRequest<PagedResult<PaymentRow>>(
      `/api/finance/payments?${pagedQuery({
        page: 1,
        pageSize: 5000,
        status,
        year: status === "SETTLED" ? yearNum : undefined,
        search: appliedSearch || undefined,
        method: methodFilter || undefined,
        feeType: feeTypeFilter || undefined,
        membershipType: membershipTypeFilter || undefined,
      })}`,
    );
    if (status === "PENDING") {
      return result.items.filter((row) => needsClearance(row) && isPendingStatus(row.status ?? row.statusCode));
    }
    return result.items;
  }

  async function fetchAllArrearsForExport() {
    const result = await apiRequest<PagedResult<SubRow>>(
      `/api/finance/subscriptions?${pagedQuery({
        year: yearNum,
        page: 1,
        pageSize: 5000,
        search: appliedSearch || undefined,
        arrearsOnly: true,
        membershipType: membershipTypeFilter || undefined,
      })}`,
    );
    return result.items;
  }

  function printPaymentRows(rows: PaymentRow[], title: string) {
    if (rows.length === 0) {
      toast.error("Nothing to print.");
      return;
    }
    const ok = printHtmlReport(title, rowsToTableHtml(PAYMENT_EXPORT_COLS, rows));
    if (!ok) toast.error("Could not open the print dialog. Try again.");
  }

  function printArrearsRows(rows: SubRow[], title: string) {
    if (rows.length === 0) {
      toast.error("Nothing to print.");
      return;
    }
    const ok = printHtmlReport(title, rowsToTableHtml(ARREARS_EXPORT_COLS, rows));
    if (!ok) toast.error("Could not open the print dialog. Try again.");
  }

  async function handlePrintBulk() {
    try {
      setExportBusy(true);
      if (desk === "arrears") {
        const all = await fetchAllArrearsForExport();
        printArrearsRows(all, `Arrears & subscriptions · ${yearNum}`);
        return;
      }
      const all = await fetchAllPaymentsForExport(desk === "pending" ? "PENDING" : "SETTLED");
      printPaymentRows(all, `Finance ${desk} · filtered`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleDownloadExcel() {
    try {
      setExportBusy(true);
      if (desk === "arrears") {
        const rows = await fetchAllArrearsForExport();
        if (rows.length === 0) {
          toast.error("No arrears rows to export.");
          return;
        }
        downloadExcelCsv(`finance-arrears-${yearNum}.csv`, ARREARS_EXPORT_COLS, rows);
        toast.success(`Downloaded ${rows.length} arrears row(s).`);
        return;
      }
      const rows = await fetchAllPaymentsForExport(desk === "pending" ? "PENDING" : "SETTLED");
      if (rows.length === 0) {
        toast.error("No payments to export.");
        return;
      }
      downloadExcelCsv(`finance-${desk}-${yearNum}.csv`, PAYMENT_EXPORT_COLS, rows);
      toast.success(`Downloaded ${rows.length} payment row(s).`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }

  const tabs: { id: DeskTab; label: string; hint?: string }[] = [
    {
      id: "pending",
      label: "Pending clearance",
      hint: String(summary.data?.pendingClearance ?? pendingPageData.totalCount ?? "…"),
    },
    { id: "settled", label: "Settled bills" },
    {
      id: "arrears",
      label: "Arrears & subscriptions",
      hint: String(summary.data?.membersInArrears ?? "…"),
    },
  ];

  const busy = approve.isPending || reject.isPending || refund.isPending || reverse.isPending;

  return (
    <TooltipProvider delayDuration={200}>
    <PageFrame width="lg" className="space-y-5 bg-[#F8FAFC] p-4 sm:p-5 -mx-4 sm:-mx-6 lg:-mx-8 sm:px-6 lg:px-8">
      <PageHeader
        title=""
        description="Verify payments, issue official membership receipts, and track arrears."
        actions={
          canRunPosting ? (
            <Button
              type="button"
              variant="outline"
              className="border-amber-300 text-amber-900 hover:bg-amber-50"
              disabled={renewalBusy}
              onClick={() => setRenewalStep(1)}
            >
              {renewalBusy ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
              Run annual renewal · {yearNum}
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending clearance"
          value={summary.data?.pendingClearance ?? "—"}
        />
        <StatCard
          label="Today's collections"
          value={summary.data ? formatKes(summary.data.todaysCollections) : "—"}
        />
        <StatCard
          label="Unreceipted payments"
          value={summary.data?.unreceiptedPayments ?? "—"}
        />
        <StatCard
          label="Members in arrears"
          value={summary.data?.membersInArrears ?? "—"}
          hint={`Outstanding annual fees · ${yearNum}`}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setDesk(tab.id);
                setPaymentPage(1);
                setSubPage(1);
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                desk === tab.id
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              {tab.label}
              {tab.hint ? <span className="ml-1.5 opacity-80">({tab.hint})</span> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Year</span>
            <Input
              type="number"
              className="w-28 bg-white"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setPaymentPage(1);
                setSubPage(1);
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
                placeholder="Name, membership no, APP-, receipt…"
              />
            </div>
          </label>
          {desk !== "arrears" ? (
            <>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Method</span>
                <select
                  className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                  value={methodFilter}
                  onChange={(e) => {
                    setMethodFilter(e.target.value);
                    setPaymentPage(1);
                  }}
                >
                  <option value="">All</option>
                  <option value="CASH">Cash</option>
                  <option value="MPESA">M-Pesa</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CARD">Card / credit</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Fee type</span>
                <select
                  className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                  value={feeTypeFilter}
                  onChange={(e) => {
                    setFeeTypeFilter(e.target.value);
                    setPaymentPage(1);
                  }}
                >
                  <option value="">All</option>
                  <option value="JOINING">Joining / entrance fee</option>
                  <option value="ANNUAL">Annual subscription</option>
                </select>
              </label>
            </>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Membership type</span>
            <select
              className="h-9 min-w-[10rem] rounded-md border border-input bg-white px-3 text-sm"
              value={membershipTypeFilter}
              onChange={(e) => {
                setMembershipTypeFilter(e.target.value);
                setPaymentPage(1);
                setSubPage(1);
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
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportBusy}
              onClick={() => void handlePrintBulk()}
            >
              {exportBusy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              Print all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportBusy}
              onClick={() => void handleDownloadExcel()}
            >
              {exportBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStatementOpen(true)}
            >
              <ScrollText className="size-4" />
              Print statement
            </Button>
          </div>
        </div>
      </section>

      {desk === "pending" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {pending.isLoading ? (
            <PageBodyLoading label="Loading pending payments…" minHeightClassName="min-h-[14rem]" />
          ) : pendingRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cheque or transfer payments waiting for clearance. Uploaded application cheques sync here automatically.
            </p>
          ) : (
            <>
              <PendingClearanceTable
                rows={pendingRows}
                busyId={busyId}
                busy={busy}
                selectedIds={selectedPaymentIds}
                onToggleSelect={(id, checked) => {
                  const row = pendingRows.find((r) => r.transactionId === id);
                  setSelectedPayments((prev) => setRecordEntry(prev, id, row, checked));
                }}
                onToggleSelectAll={(checked) => {
                  setSelectedPayments((prev) =>
                    setRecordPage(prev, pendingRows, (r) => r.transactionId, checked),
                  );
                }}
                onVerify={(row) => setReviewRow(row)}
                onReject={(row) => {
                  setRejectRow(row);
                  setRejectReason("");
                }}
                onViewProof={(row) => setProofRow(row)}
                onPrint={(row) => printPaymentRows([row], `Payment · ${payerLabel(row)}`)}
              />
              <div className="mt-3">
                <ListPagination
                  page={paymentPage}
                  pageSize={paymentPageSize}
                  totalCount={pendingPageData.totalCount}
                  totalPages={pendingPageData.totalPages}
                  onPageChange={setPaymentPage}
                  onPageSizeChange={setPaymentPageSize}
                />
              </div>
            </>
          )}
        </section>
      ) : null}

      {desk === "settled" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {settled.isLoading ? (
            <PageBodyLoading label="Loading settled payments…" minHeightClassName="min-h-[14rem]" />
          ) : settledPageData.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settled payments match these filters.</p>
          ) : (
            <>
              <SettledTable
                rows={settledPageData.items}
                busyId={busyId}
                selectedIds={selectedPaymentIds}
                onToggleSelect={(id, checked) => {
                  const row = settledPageData.items.find((r) => r.transactionId === id);
                  setSelectedPayments((prev) => setRecordEntry(prev, id, row, checked));
                }}
                onToggleSelectAll={(checked) => {
                  setSelectedPayments((prev) =>
                    setRecordPage(prev, settledPageData.items, (r) => r.transactionId, checked),
                  );
                }}
                onViewProof={(row) => setProofRow(row)}
                onViewReceipt={(row) => setReceiptTxId(row.transactionId)}
                onRefund={(row) => {
                  setRefundRow(row);
                  setRefundReason("");
                }}
                onReverse={(row) => {
                  setReverseRow(row);
                  setReverseReason("");
                }}
                canAdjustLedger={canAdjustLedger}
                onIssueReceipt={async (row) => {
                  try {
                    setBusyId(row.transactionId);
                    const issued = await apiRequest<PaymentRow>(`/api/finance/payments/${row.transactionId}/receipt`, {
                      method: "POST",
                    });
                    toast.success(`Receipt ${issued.receiptNumber ?? ""} ready.`);
                    setReceiptTxId(issued.transactionId);
                    await refreshDesk();
                  } catch (err) {
                    toast.error(extractErrorMessage(err));
                  } finally {
                    setBusyId(null);
                  }
                }}
                onPrint={(row) => printPaymentRows([row], `Payment · ${payerLabel(row)}`)}
              />
              <div className="mt-3">
                <ListPagination
                  page={paymentPage}
                  pageSize={paymentPageSize}
                  totalCount={settledPageData.totalCount}
                  totalPages={settledPageData.totalPages}
                  onPageChange={setPaymentPage}
                  onPageSizeChange={setPaymentPageSize}
                />
              </div>
            </>
          )}
        </section>
      ) : null}

      {desk === "arrears" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setSettlementOpen(true)}
              >
                <Plus className="size-4" />
                Quick Payment Settlement
              </Button>
            </div>
          </div>
          {subs.isLoading ? (
            <PageBodyLoading label="Loading arrears…" minHeightClassName="min-h-[14rem]" />
          ) : subPageData.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members currently in arrears for this year.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-2">Member</th>
                      <th className="p-2">Membership type</th>
                      <th className="p-2">Due</th>
                      <th className="p-2">Paid</th>
                      <th className="p-2">Arrears</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subPageData.items.map((row) => (
                      <tr key={row.subscriptionId} className="border-t border-border">
                        <td className="p-2">
                          {row.membershipNo} · {row.memberName}
                        </td>
                        <td className="p-2">{row.membershipNo ? (row.membershipType || row.membershipTypeCode || "—") : "—"}</td>
                        <td className="p-2">{formatKes(row.amountDue)}</td>
                        <td className="p-2">{formatKes(row.amountPaid)}</td>
                        <td className={cn("p-2", row.arrearsAmount > 0 ? "font-medium text-amber-800" : "")}>
                          {formatKes(row.arrearsAmount)}
                        </td>
                        <td className="p-2">{row.accountStatus || row.status}</td>
                        <td className="p-2 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              printArrearsRows(
                                [row],
                                `Arrears · ${row.membershipNo} · ${row.memberName}`,
                              )
                            }
                          >
                            Print
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <ListPagination
                  page={subPage}
                  pageSize={subPageSize}
                  totalCount={subPageData.totalCount}
                  totalPages={subPageData.totalPages}
                  onPageChange={setSubPage}
                  onPageSizeChange={setSubPageSize}
                />
              </div>
            </>
          )}
        </section>
      ) : null}

      <VerifyIssueReceiptDrawer
        row={reviewRow}
        busy={busy}
        approving={Boolean(reviewRow && busyId === reviewRow.transactionId && approve.isPending)}
        rejecting={Boolean(reviewRow && busyId === reviewRow.transactionId && reject.isPending)}
        onClose={() => setReviewRow(null)}
        onApprove={(payload) => approve.mutate(payload)}
        onReject={(payload) => reject.mutate(payload)}
      />

      <PaymentProofSheet
        open={proofRow != null}
        url={proofRow?.chequeFileUrl}
        fileName={proofRow?.chequeFileName || proofLabel(proofRow ?? ({} as PaymentRow))}
        title={proofRow ? payerLabel(proofRow) : undefined}
        onClose={() => setProofRow(null)}
      />

      <AlertDialog
        open={renewalStep > 0}
        onOpenChange={(open) => {
          if (!open && !renewalBusy) setRenewalStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {renewalStep === 2 ? `Confirm renewal · ${yearNum}` : `Run annual renewal for ${yearNum}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {renewalStep === 2
                ? `Last check: generate ${yearNum} annual subscriptions now? This is the second confirmation.`
                : `This posts ${yearNum} subscription dues for every active member. Unpaid members stay on the register; Finance cannot undo this from the desk without a later reversal. Continue only if the fee schedule is correct.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {renewalStep === 2 ? (
              <Button type="button" variant="outline" onClick={() => setRenewalStep(1)}>
                Back
              </Button>
            ) : (
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            )}
            {renewalStep === 1 ? (
              <Button
                type="button"
                className="border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                onClick={() => setRenewalStep(2)}
              >
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                className="border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                disabled={renewalBusy}
                onClick={() => {
                  setRenewalStep(0);
                  void runAnnualRenewal();
                }}
              >
                {renewalBusy ? "Running…" : `Run renewal · ${yearNum}`}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rejectRow != null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectRow(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject / reverse this uncleared submission?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejectRow
                ? `This voids the payment of ${formatKes(rejectRow.amount)} (${rejectRow.feeType || rejectRow.feeTypeCode || "fee"}) for ${payerLabel(rejectRow)} without issuing cash and reopens the unpaid invoice.`
                : "This voids the payment without issuing cash and reopens the unpaid invoice."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="finance-reject-reason">Reason</Label>
            <Textarea
              id="finance-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this submission being rejected?"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!rejectReason.trim() || reject.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!rejectRow || !rejectReason.trim()) return;
                reject.mutate({
                  transactionId: rejectRow.transactionId,
                  reason: rejectReason.trim(),
                });
              }}
            >
              {reject.isPending ? "Rejecting…" : "Reject submission"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={refundRow != null}
        onOpenChange={(open) => {
          if (!open) {
            setRefundRow(null);
            setRefundReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {refundRow
                ? `This marks the receipt for ${formatKes(refundRow.amount)} (${refundRow.feeType || refundRow.feeTypeCode || "fee"}) for ${payerLabel(refundRow)} as Refunded, posts a credit note (negative payment), and keeps the invoice Paid. The member does not go back into arrears.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="finance-refund-reason">Reason</Label>
            <Textarea
              id="finance-refund-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Why is this payment being refunded?"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!refundReason.trim() || refund.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!refundRow || !refundReason.trim()) return;
                refund.mutate({
                  transactionId: refundRow.transactionId,
                  reason: refundReason.trim(),
                });
              }}
            >
              {refund.isPending ? "Refunding…" : "Confirm refund"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={reverseRow != null}
        onOpenChange={(open) => {
          if (!open) {
            setReverseRow(null);
            setReverseReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {reverseRow
                ? `This voids the receipt for ${formatKes(reverseRow.amount)} (${reverseRow.feeType || reverseRow.feeTypeCode || "fee"}) for ${payerLabel(reverseRow)}, reopens the unpaid invoice, zeros revenue, and reapplies arrears. Money is not returned. It stays on Settled as Reversed.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="finance-reverse-reason">Reason</Label>
            <Textarea
              id="finance-reverse-reason"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Why is this payment being reversed?"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reverseReason.trim() || reverse.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!reverseRow || !reverseReason.trim()) return;
                reverse.mutate({
                  transactionId: reverseRow.transactionId,
                  reason: reverseReason.trim(),
                });
              }}
            >
              {reverse.isPending ? "Reversing…" : "Confirm reversal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberStatementDialog
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        mode="staff"
        year={yearNum}
      />

      <MembershipReceiptDialog
        open={receiptTxId != null}
        transactionId={receiptTxId}
        onClose={() => setReceiptTxId(null)}
      />

      <DirectSettlementModal
        open={settlementOpen}
        year={yearNum}
        seed={null}
        allowSearch
        onClose={() => setSettlementOpen(false)}
        onSettled={() => {
          void refreshDesk();
        }}
      />
    </PageFrame>
    </TooltipProvider>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function IconAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  busy,
  variant = "ghost",
  className,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "ghost" | "outline" | "destructive" | "default";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={variant}
          className={cn("size-8 shrink-0", className)}
          disabled={disabled || busy}
          aria-label={label}
          onClick={onClick}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function PendingClearanceTable({
  rows,
  busyId,
  busy,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onVerify,
  onReject,
  onViewProof,
  onPrint,
}: {
  rows: PaymentRow[];
  busyId: number | null;
  busy: boolean;
  selectedIds: number[];
  onToggleSelect: (id: number, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onVerify: (row: PaymentRow) => void;
  onReject: (row: PaymentRow) => void;
  onViewProof: (row: PaymentRow) => void;
  onPrint: (row: PaymentRow) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.transactionId));
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[1080px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-10 p-2">
              <input
                type="checkbox"
                aria-label="Select all pending"
                checked={allSelected}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
              />
            </th>
            <th className="p-2">Date submitted</th>
            <th className="p-2">Payer details</th>
            <th className="p-2">Membership type</th>
            <th className="p-2">Fee type</th>
            <th className="p-2">Payment method</th>
            <th className="p-2">Proof</th>
            <th className="p-2">Amount (Ksh)</th>
            <th className="p-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.transactionId} className="border-t border-slate-200 hover:bg-slate-50">
              <td className="p-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${payerLabel(row)}`}
                  checked={selectedIds.includes(row.transactionId)}
                  onChange={(e) => onToggleSelect(row.transactionId, e.target.checked)}
                />
              </td>
              <td className="p-2">{formatStamp(row.submittedAt || row.paymentDate)}</td>
              <td className="p-2">{payerLabel(row)}</td>
              <td className="p-2">{row.membershipNo ? (row.membershipType || row.membershipTypeCode || "—") : "—"}</td>
              <td className="p-2">{row.feeType || row.feeTypeCode || "—"}</td>
              <td className="p-2">{row.method || row.methodCode || "—"}</td>
              <td className="p-2">
                <PaymentProofBadge
                  url={row.chequeFileUrl}
                  fileName={row.chequeFileName}
                  fallback={proofLabel(row)}
                  onView={() => onViewProof(row)}
                />
              </td>
              <td className="p-2">{formatKes(row.amount)}</td>
              <td className="p-2 text-right">
                <div className="flex flex-row items-center justify-end gap-1">
                  <IconAction
                    label="Verify & Issue Receipt"
                    icon={Check}
                    variant="default"
                    disabled={busy}
                    busy={busyId === row.transactionId}
                    onClick={() => onVerify(row)}
                  />
                  <IconAction
                    label="Reject / Reverse Submission"
                    icon={Ban}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => onReject(row)}
                  />
                  <IconAction label="Print" icon={Printer} onClick={() => onPrint(row)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettledTable({
  rows,
  busyId,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onViewProof,
  onViewReceipt,
  onIssueReceipt,
  onRefund,
  onReverse,
  canAdjustLedger,
  onPrint,
}: {
  rows: PaymentRow[];
  busyId: number | null;
  selectedIds: number[];
  onToggleSelect: (id: number, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onViewProof: (row: PaymentRow) => void;
  onViewReceipt: (row: PaymentRow) => void;
  onIssueReceipt: (row: PaymentRow) => void;
  onRefund: (row: PaymentRow) => void;
  onReverse: (row: PaymentRow) => void;
  canAdjustLedger: boolean;
  onPrint: (row: PaymentRow) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.transactionId));
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-10 p-2">
              <input
                type="checkbox"
                aria-label="Select all settled"
                checked={allSelected}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
              />
            </th>
            <th className="p-2">Date</th>
            <th className="p-2">Payer</th>
            <th className="p-2">Membership type</th>
            <th className="p-2">Method</th>
            <th className="p-2">Fee</th>
            <th className="p-2">Receipt</th>
            <th className="p-2">Amount</th>
            <th className="p-2">Proof</th>
            <th className="p-2">Status</th>
            <th className="p-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasReceipt = Boolean(row.receiptNumber?.trim());
            const viewReceipt = hasReceipt && isReceiptViewableStatus(row.status ?? row.statusCode);
            const reversedOrRefunded =
              `${row.statusCode ?? row.status ?? ""}`.toUpperCase().includes("REVERSE")
              || `${row.statusCode ?? row.status ?? ""}`.toUpperCase().includes("REFUND");
            const canRefund = canAdjustLedger && isRefundableStatus(row.status ?? row.statusCode);
            const canReverse = canAdjustLedger && isReversibleStatus(row.status ?? row.statusCode);
            return (
              <tr key={row.transactionId} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="p-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${payerLabel(row)}`}
                    checked={selectedIds.includes(row.transactionId)}
                    onChange={(e) => onToggleSelect(row.transactionId, e.target.checked)}
                  />
                </td>
                <td className="p-2">{formatDay(row.paymentDate)}</td>
                <td className="p-2">{payerLabel(row)}</td>
                <td className="p-2">{row.membershipNo ? (row.membershipType || row.membershipTypeCode || "—") : "—"}</td>
                <td className="p-2">{row.method || "—"}</td>
                <td className="p-2">{row.feeType || row.feeTypeCode || "—"}</td>
                <td className="p-2 font-medium">{row.receiptNumber || "—"}</td>
                <td className="p-2">{formatKes(row.amount)}</td>
                <td className="p-2">
                  <PaymentProofBadge
                    url={row.chequeFileUrl}
                    fileName={row.chequeFileName}
                    fallback={proofLabel(row)}
                    onView={() => onViewProof(row)}
                  />
                </td>
                <td className="p-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      isSettledStatus(row.status ?? row.statusCode)
                        && !`${row.statusCode ?? row.status ?? ""}`.toUpperCase().includes("PARTIAL")
                        && !reversedOrRefunded
                        ? "bg-emerald-100 text-emerald-900"
                        : `${row.statusCode ?? row.status ?? ""}`.toUpperCase().includes("PARTIAL")
                          ? "bg-sky-100 text-sky-900"
                          : `${row.statusCode ?? row.status ?? ""}`.toUpperCase().includes("REFUND")
                            ? "bg-violet-100 text-violet-900"
                            : `${row.statusCode ?? row.status ?? ""}`.toUpperCase().includes("REVERSE")
                              ? "bg-slate-200 text-slate-800"
                              : "bg-muted text-foreground",
                    )}
                  >
                    {row.status ?? row.statusCode ?? "—"}
                  </span>
                </td>
                <td className="p-2 text-right">
                  <div className="flex flex-row items-center justify-end gap-1">
                    {viewReceipt ? (
                      <IconAction label="View receipt" icon={Receipt} onClick={() => onViewReceipt(row)} />
                    ) : !reversedOrRefunded ? (
                      <IconAction
                        label="Issue receipt"
                        icon={Receipt}
                        variant="outline"
                        busy={busyId === row.transactionId}
                        onClick={() => onIssueReceipt(row)}
                      />
                    ) : null}
                    <IconAction label="Print" icon={Printer} onClick={() => onPrint(row)} />
                    {canRefund || canReverse ? (
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 shrink-0"
                                aria-label="Manage"
                                disabled={busyId === row.transactionId}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="top">Manage</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
                          {canRefund ? (
                            <DropdownMenuItem
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              onSelect={() => onRefund(row)}
                            >
                              <Banknote className="size-4" />
                              Issue Refund
                            </DropdownMenuItem>
                          ) : null}
                          {canReverse ? (
                            <DropdownMenuItem onSelect={() => onReverse(row)}>
                              <RotateCcw className="size-4" />
                              Reverse Receipt
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
