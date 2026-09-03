import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Lock,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { ManagerStagePanel, pickApplicationCheques, type ManagerReadiness, type PaymentRow } from "@/components/admin/ManagerStagePanel";
import { RejectApplicationDialog } from "@/components/admin/RejectApplicationDialog";
import { ListPagination } from "@/components/common/ListPagination";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { ApplicantReview, parseApplicationDraft } from "@/components/panels/ApplicantReview";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  applicantDisplayName,
  applicationProgress,
  applicationReference,
  applicationStage,
  canStartReview,
  formatMembershipDate,
  isReviewStatus,
  nextApplicationStage,
  type ApplicationDetailAdmin,
  type ApplicationRow,
} from "@/services/admin/membershipDesk";
import { isAuthenticated } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { cn } from "@/utils/cn";

const MISSING_FILTERS = [
  { id: "any", label: "Any" },
  { id: "incomplete", label: "Incomplete sections" },
  { id: "payment", label: "Missing payment" },
  { id: "sponsor", label: "Missing sponsor" },
  { id: "complete", label: "All pre-requisites met" },
] as const;

const MANAGER_MISSING_FILTERS = [
  { id: "any", label: "Any" },
  { id: "payment", label: "Awaiting payment" },
  { id: "details", label: "Member details incomplete" },
  { id: "complete", label: "Ready to authorize" },
] as const;

type MissingFilter =
  | (typeof MISSING_FILTERS)[number]["id"]
  | (typeof MANAGER_MISSING_FILTERS)[number]["id"];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function dayStamp(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function isSectionsComplete(row: ApplicationRow) {
  const { done, total } = applicationProgress(row);
  return total > 0 && done >= total;
}

function isPaymentOk(row: ApplicationRow) {
  const code = (row.paymentStatusCode ?? row.paymentStatus ?? "")
    .toLowerCase()
    .replace(/[\s-]/g, "_");
  return code === "paid" || code === "waived";
}

function paymentTone(row: ApplicationRow): "green" | "amber" | "slate" | "rose" {
  const code = (row.paymentStatusCode ?? row.paymentStatus ?? "")
    .toLowerCase()
    .replace(/[\s-]/g, "_");
  if (code === "paid" || code === "waived") return "green";
  if (code === "partially_paid" || code === "overdue") return "amber";
  return "slate";
}

type PaymentLineView = NonNullable<ApplicationRow["paymentLines"]>[number];

type PaymentView = {
  tone: "green" | "amber" | "slate" | "rose";
  status: string;
  received: boolean;
  amount?: number | null;
  receiptNumber?: string | null;
  paymentDate?: string | null;
  lines: PaymentLineView[];
};

function toPaymentLineView(payment: PaymentRow): PaymentLineView {
  const source = payment as unknown as Record<string, unknown>;
  const amountValue =
    typeof source.amount === "number"
      ? source.amount
      : Number(source.amount ?? source.paidAmount ?? 0);

  return {
    feeCode:
      typeof source.feeCode === "string"
        ? source.feeCode
        : typeof source.paymentTypeCode === "string"
          ? source.paymentTypeCode
          : null,
    feeLabel:
      typeof source.feeLabel === "string"
        ? source.feeLabel
        : typeof source.paymentTypeName === "string"
          ? source.paymentTypeName
          : typeof source.feeName === "string"
            ? source.feeName
            : "Fee",
    amount: Number.isFinite(amountValue) ? amountValue : 0,
    receiptNumber:
      typeof source.receiptNumber === "string"
        ? source.receiptNumber
        : typeof source.receiptNo === "string"
          ? source.receiptNo
          : typeof source.referenceNumber === "string"
            ? source.referenceNumber
            : null,
    paymentDate:
      typeof source.paymentDate === "string"
        ? source.paymentDate
        : typeof source.receivedAt === "string"
          ? source.receivedAt
          : typeof source.createdAt === "string"
            ? source.createdAt
            : null,
    received:
      typeof source.received === "boolean"
        ? source.received
        : typeof source.isPaid === "boolean"
          ? source.isPaid
          : true,
  } satisfies PaymentLineView;
}

function mergePaymentView(row: ApplicationRow, livePayments: PaymentRow[]): PaymentView {
  const liveLines = livePayments
    .map(toPaymentLineView)
    .filter((line) => line.received !== false);
  const fallbackLines =
    row.paymentLines && row.paymentLines.length > 0
      ? row.paymentLines
      : ([
          {
            feeLabel: "Entrance / joining",
            amount: 0,
            receiptNumber: row.paymentReceiptNumber,
            paymentDate: row.paymentDate,
            received: isPaymentOk(row),
          },
          {
            feeLabel: "Annual subscription",
            amount: 0,
            receiptNumber: null,
            paymentDate: null,
            received: isPaymentOk(row),
          },
        ] satisfies PaymentLineView[]);

  const lines = liveLines.length > 0 ? liveLines : fallbackLines;
  const received =
    liveLines.length > 0 ? liveLines.some((line) => line.received !== false) : isPaymentOk(row);
  const amount =
    liveLines.length > 0
      ? liveLines.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0)
      : row.paymentAmount;
  const receiptNumber =
    liveLines.find((line) => line.receiptNumber?.trim())?.receiptNumber ?? row.paymentReceiptNumber;
  const paymentDate = liveLines.find((line) => line.paymentDate)?.paymentDate ?? row.paymentDate;
  const status =
    liveLines.length > 0
      ? received
        ? amount > 0 && !isPaymentOk(row)
          ? "Partially paid"
          : "Paid"
        : row.paymentStatus?.trim() || "Pending"
      : row.paymentStatus?.trim() || "Pending";
  const tone =
    liveLines.length > 0 ? (received ? (amount > 0 && !isPaymentOk(row) ? "amber" : "green") : "slate") : paymentTone(row);

  return {
    tone,
    status,
    received,
    amount,
    receiptNumber,
    paymentDate,
    lines,
  };
}

function isSponsorOk(row: ApplicationRow) {
  const code = (row.sponsorStatusCode ?? row.sponsorStatus ?? "").toLowerCase();
  return (
    code === "complete" || (row.endorsementsCompleted ?? 0) >= (row.endorsementsRequired ?? 2)
  );
}

/** Endorsement stage cannot advance until proposer + seconder have both endorsed. */
function needsCompleteSponsors(statusCode?: string | null) {
  return statusCode === "Endorsement" || statusCode === "EndorsementReview";
}

function canReviewApplication(row: ApplicationRow) {
  if (!canStartReview(row.statusCode)) return false;
  if (row.statusCode === "Endorsement" && !isSponsorOk(row)) return false;
  if (row.statusCode === "Endorsement" && row.stageAPaymentsReady === false) return false;
  return true;
}

function canAuthorizeApplication(row: ApplicationRow) {
  if (nextApplicationStage(row.statusCode) == null) return false;
  if (canStartReview(row.statusCode)) return false;
  if (!isReadyToAuthorize(row)) return false;
  if (row.canAuthorizeToInterview === false) return false;
  return true;
}

function isMemberDetailsOk(row: ApplicationRow) {
  if (row.memberDetailsComplete === true) return true;
  if (row.memberDetailsComplete === false) return false;
  return isSectionsComplete(row);
}

function isReadyToAuthorize(row: ApplicationRow) {
  return isSponsorOk(row) && isPaymentOk(row) && isMemberDetailsOk(row);
}

function canDeleteApplication(row: ApplicationRow) {
  return !isSponsorOk(row) && !isPaymentOk(row);
}

function formatKes(amount?: number | null) {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return Number(amount).toLocaleString("en-KE", { style: "currency", currency: "KES" });
}

function sponsorTone(row: ApplicationRow): "green" | "amber" | "slate" | "rose" {
  const code = (row.sponsorStatusCode ?? row.sponsorStatus ?? "").toLowerCase();
  if (code === "complete") return "green";
  if (code === "partial") return "amber";
  return "slate";
}

function statusTone(row: ApplicationRow): "green" | "amber" | "slate" | "rose" {
  const code = row.statusCode ?? "";
  if (code === "Approved") return "green";
  if (code === "Rejected" || code === "Withdrawn") return "rose";
  if (isReviewStatus(code)) return "amber";
  return "slate";
}

function SegmentProgress({ done, total }: { done: number; total: number }) {
  const segments = 4;
  const filled = Math.round((done / Math.max(total, 1)) * segments);
  return (
    <div className="flex gap-1">
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            index < filled ? "bg-primary" : "bg-slate-200",
          )}
        />
      ))}
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "green" | "amber" | "slate" | "rose";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "slate" && "border-slate-200 bg-slate-50 text-slate-700",
        tone === "rose" && "border-rose-200 bg-rose-50 text-rose-800",
      )}
    >
      {children}
    </span>
  );
}

type Section = "pending" | "history";

function resolveView(search: { view?: string; section?: string }): {
  authorize: boolean;
  manager: boolean;
  section: Section;
} {
  const authorize = search.view === "authorize";
  const manager = search.view === "manager";
  const section: Section =
    manager && search.section === "history" ? "history" : "pending";
  return { authorize, manager, section };
}

export function PendingApplicationsPage() {
  const search = useSearch({ strict: false }) as { view?: string; section?: string };
  const { authorize, manager, section } = resolveView(search);
  const showHistoryOnly = manager && section === "history";

  const title = manager
    ? showHistoryOnly
      ? "Authorized history"
      : "Pending review"
    : authorize
      ? "Authorized applications"
      : "Pending applications";

  const description = manager
    ? showHistoryOnly
      ? "Applicants already authorized to interview. Committee manage schedules the sitting after this step."
      : "Check sponsors, fees and member details, then authorize to interview."
    : authorize
      ? "View and manage applications that have completed screening and are ready for authorization or credentials."
      : "Track applicants through screening. Check pre-requisites, payment and sponsor status before processing.";

  return (
    <PageFrame width="lg">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title={title}
        description={description}
      />
      <PendingApplicationsPanel
        authorize={authorize}
        manager={manager}
        section={section}
      />
    </PageFrame>
  );
}

function PendingApplicationsPanel({
  authorize = false,
  manager = false,
  section = "pending",
}: {
  authorize?: boolean;
  manager?: boolean;
  section?: Section;
}) {
  const showHistoryOnly = manager && section === "history";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<string[]>([]);
  const [missing, setMissing] = useState<MissingFilter>("any");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [viewingFullDetails, setViewingFullDetails] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ApplicationRow | null>(null);

  // Pending view shows the queue table; history view shows the previously
  // authorized list. Auto-verification panel only appears in pending view.
  const { data, isLoading } = useQuery({
    queryKey: [
      "applications",
      manager ? (showHistoryOnly ? "manager-history" : "manager-queue") : "all",
      page,
      pageSize,
      search,
    ],
    queryFn: () => {
      const params = pagedQuery({
        page,
        pageSize,
        search: search.trim() || undefined,
      });
      if (showHistoryOnly) {
        return apiRequest<PagedResult<ApplicationRow>>(`/api/applications/manager-history?${params}`);
      }
      if (manager) {
        return apiRequest<PagedResult<ApplicationRow>>(`/api/applications/manager-queue?${params}`);
      }
      return apiRequest<PagedResult<ApplicationRow>>(`/api/applications?${params}`);
    },
    enabled: isAuthenticated(),
  });

  const pageData = data ?? emptyPage<ApplicationRow>(page, pageSize);

  const classOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of pageData.items) {
      if (row.membershipTypeName) names.add(row.membershipTypeName);
    }
    return [...names].sort();
  }, [pageData.items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pageData.items.filter((row) => {
      if (showHistoryOnly) {
        // History list is already pre-filtered server-side.
      } else if (!manager && authorize) {
        if (!isReviewStatus(row.statusCode) && row.statusCode !== "Approved") return false;
      } else if (
        !manager &&
        !authorize &&
        (isReviewStatus(row.statusCode) || row.statusCode === "Approved")
      ) {
        return false;
      }
      if (
        !manager &&
        (row.statusCode === "Draft" || row.statusCode === "Withdrawn")
      ) {
        return false;
      }

      if (classes.length > 0 && !classes.includes(row.membershipTypeName ?? "")) return false;

      if (missing === "incomplete" && isSectionsComplete(row)) return false;
      if (missing === "payment" && isPaymentOk(row)) return false;
      if (missing === "sponsor" && isSponsorOk(row)) return false;
      if (missing === "details" && isMemberDetailsOk(row)) return false;
      if (missing === "complete" && !isReadyToAuthorize(row)) return false;

      const updated = dayStamp(row.updatedAt || row.appliedAt);
      if (dateFrom && updated && updated < dateFrom) return false;
      if (dateTo && updated && updated > dateTo) return false;

      if (query) {
        const haystack = `${applicantDisplayName(row)} ${applicationReference(row)}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [authorize, classes, dateFrom, dateTo, manager, missing, pageData.items, search, showHistoryOnly]);

  const rows = filtered;

  const paymentLookups = useQueries({
    queries: manager
      ? rows.map((row) => ({
          queryKey: ["application-payments", String(row.applicationId)],
          queryFn: () =>
            apiRequest<PaymentRow[]>(`/api/applications/${row.applicationId}/payments`),
          enabled: isAuthenticated(),
          staleTime: 30_000,
        }))
      : [],
  });

  const paymentsByApplicationId = useMemo(() => {
    const map = new Map<number, PaymentRow[]>();
    rows.forEach((row, index) => {
      map.set(row.applicationId, paymentLookups[index]?.data ?? []);
    });
    return map;
  }, [paymentLookups, rows]);

  // Stage A: manager opens a right-side panel per row. Do not auto-expand inline.
  useEffect(() => {
    if (!manager || showHistoryOnly) {
      setVerifyingId(null);
    }
  }, [manager, showHistoryOnly]);

  const [committeeNote, setCommitteeNote] = useState("");

  const verifyingRow =
    manager && !showHistoryOnly
      ? rows.find((r) => r.applicationId === verifyingId) ?? null
      : null;

  useEffect(() => {
    setCommitteeNote("");
    setViewingFullDetails(false);
  }, [verifyingId]);

  const verifyDetail = useQuery({
    queryKey: ["applications", "detail", verifyingRow?.applicationId],
    queryFn: () =>
      apiRequest<ApplicationDetailAdmin>(`/api/applications/${verifyingRow!.applicationId}`),
    enabled: verifyingRow != null,
  });

  const verifyingReadiness = useQuery({
    queryKey: ["manager-readiness", verifyingRow ? String(verifyingRow.applicationId) : null],
    queryFn: () =>
      apiRequest<ManagerReadiness>(
        `/api/applications/${verifyingRow!.applicationId}/manager-readiness`,
      ),
    enabled: verifyingRow != null,
  });

  const formHasLicenseCopy = (() => {
    try {
      const av = JSON.parse(verifyDetail.data?.formDataJson ?? "{}")?.aviation;
      return Boolean(av?.licenseFile?.fileName || av?.licenseFile?.url);
    } catch {
      return false;
    }
  })();
  const licenseOk =
    !verifyingReadiness.data?.pilotLicenseRequired ||
    Boolean(verifyingReadiness.data?.pilotLicenseUploaded) ||
    formHasLicenseCopy;
  const feeChequesOk = (() => {
    if (verifyingReadiness.data?.feeChequesUploaded) return true;
    const files = pickApplicationCheques(verifyDetail.data);
    return Boolean(files.annual && files.joining);
  })();
  const canAuthorizeFromChecklist =
    Boolean(verifyingReadiness.data) &&
    (verifyingRow?.statusCode === "Endorsement" ||
      verifyingRow?.statusCode === "EndorsementReview") &&
    feeChequesOk &&
    Boolean(verifyingReadiness.data?.canProceedToInterview || (
      licenseOk &&
      verifyingReadiness.data?.endorsementsComplete &&
      (verifyingReadiness.data?.paymentsReceived || feeChequesOk) &&
      verifyingReadiness.data?.memberDetailsComplete &&
      verifyingReadiness.data?.cvUploaded &&
      verifyingReadiness.data?.idPassportUploaded &&
      verifyingReadiness.data?.clubVisitsMet
    ));

  const review = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/applications/${applicationId}/review`, {
        method: "POST",
        body: JSON.stringify({ reason: "Admin opened the application for review" }),
      }),
    onSuccess: () => {
      toast.success("Application is now under review.");
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const authorizeToInterview = useMutation({
    mutationFn: async (row: ApplicationRow) => {
      if (row.statusCode === "Endorsement") {
        await apiRequest(`/api/applications/${row.applicationId}/review`, {
          method: "POST",
          body: JSON.stringify({ reason: "Manager completed Stage A verification" }),
        });
      }
      return apiRequest(`/api/applications/${row.applicationId}/advance`, {
        method: "POST",
        body: JSON.stringify({
          reason: committeeNote.trim()
            ? `Stage A — authorized to interview. Manager note: ${committeeNote.trim()}`
            : "Stage A — authorized to interview after manager verification",
        }),
      });
    },
    onSuccess: () => {
      toast.success(
        "Applicant authorized to interview. Schedule the sitting under Committee manage.",
      );
      setVerifyingId(null);
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["manager-readiness"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const authorizeStage = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/applications/${applicationId}/advance`, {
        method: "POST",
        body: JSON.stringify({ reason: "Authorized to the next stage after review" }),
      }),
    onSuccess: () => {
      toast.success(
        "Applicant authorized to interview. Schedule the sitting under Committee manage.",
      );
      setVerifyingId(null);
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const openChairmanElection = (applicationId: number) => {
    void navigate({
      to: "/members/$applicationId",
      params: { applicationId: String(applicationId) },
    });
  };

  const reject = useMutation({
    mutationFn: ({ applicationId, reason }: { applicationId: number; reason: string }) =>
      apiRequest(`/api/applications/${applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          statusCode: "Rejected",
          reason,
        }),
      }),
    onSuccess: () => {
      toast.success(authorize ? "Approval revoked." : "Application rejected.");
      setRejectTarget(null);
      setVerifyingId(null);
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const reopen = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/applications/${applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          statusCode: "Committee",
          reason: "Reopened after committee rejection for correction and re-processing",
        }),
      }),
    onSuccess: () => {
      toast.success(
        "Application reopened at Committee stage. You can edit and process again.",
      );
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/applications/${applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          statusCode: "Withdrawn",
          reason: "Deleted from applicant desk",
        }),
      }),
    onSuccess: () => {
      toast.success("Applicant record deleted.");
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const busy =
    authorizeStage.isPending ||
    authorizeToInterview.isPending ||
    reject.isPending ||
    review.isPending ||
    remove.isPending ||
    reopen.isPending;
  const classSummary =
    classes.length === 0
      ? "All classes"
      : classes.length <= 2
        ? classes.join(", ")
        : `${classes.length} classes`;
  const missingOptions = manager ? MANAGER_MISSING_FILTERS : MISSING_FILTERS;
  const missingLabel =
    missingOptions.find((item) => item.id === missing)?.label ?? "Any";

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-3",
          manager ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4",
        )}
      >
        <div className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          Membership class
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full min-w-0 justify-between font-normal text-foreground"
              >
                <span className="truncate">{classSummary}</span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {classOptions.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No classes yet
                </div>
              ) : (
                classOptions.map((name) => (
                  <DropdownMenuCheckboxItem
                    key={name}
                    checked={classes.includes(name)}
                    onCheckedChange={() => {
                      setPage(1);
                      setClasses((current) =>
                        current.includes(name)
                          ? current.filter((item) => item !== name)
                          : [...current, name],
                      );
                    }}
                  >
                    {name}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          Missing requirements
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full min-w-0 justify-between font-normal text-foreground"
              >
                <span className="truncate">{missingLabel}</span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {missingOptions.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={missing === option.id}
                  onCheckedChange={() => {
                    setMissing(option.id);
                    setPage(1);
                  }}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {!manager ? (
          <div className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
            Date range
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Input
                type="date"
                className="h-9 min-w-0"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                className="h-9 min-w-0"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          Search
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              placeholder="Search by applicant name or app #"
              className="h-9 min-w-0 pl-9"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-secondary/40 text-left text-muted-foreground">
            <tr>
              {[
                "Applicant",
                "Class",
                "Status",
                "Payment",
                "Sponsors",
                "Actions",
              ].map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                  Loading applications…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                  {manager ? (
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {showHistoryOnly
                          ? "No applications in Authorized history yet."
                          : "No applications in Stage A right now."}
                      </p>
                      <p>
                        {showHistoryOnly
                          ? "After you authorize someone from Stage A to interview, they appear here. Committee manage assigns them to a sitting."
                          : "Apps appear here after both proposer and seconder submit. If fees are unpaid, the applicant is notified first; once fees clear, they appear for verification."}
                      </p>
                    </div>
                  ) : (
                    "No applications match these filters."
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const name = applicantDisplayName(row);
                const mark = initials(name);
                const livePayments = paymentsByApplicationId.get(row.applicationId) ?? [];
                const paymentView = mergePaymentView(row, livePayments);
                const canDelete = canDeleteApplication(row) && !paymentView.received;
                const sectionsOk = isSectionsComplete(row);
                const processable = sectionsOk && row.statusCode !== "Rejected";
                const expanded =
                  manager && !showHistoryOnly && verifyingId === row.applicationId;

                return (
                  <tr
                    key={row.applicationId}
                    className={cn(
                      "border-t border-border align-middle",
                      expanded && "bg-primary/5",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                          {mark || <UserRound className="size-4" />}
                        </div>
                        <div>
                          <p className="font-medium leading-tight text-foreground">
                            {name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {applicationReference(row)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {row.membershipTypeName || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-[180px] space-y-1.5">
                        <StatusBadge tone={statusTone(row)}>
                          {applicationStage(row)}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PaymentCell view={paymentView} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-[120px] space-y-1">
                        <StatusBadge tone={sponsorTone(row)}>
                          {row.sponsorStatus?.trim() || "Pending"}
                        </StatusBadge>
                        {isSponsorOk(row) && row.sponsorCompletedAt ? (
                          <p className="text-xs text-muted-foreground">
                            {formatMembershipDate(row.sponsorCompletedAt)}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {(row.endorsementsCompleted ?? 0)}/
                            {row.endorsementsRequired ?? 2} endorsements
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {authorize ? (
                        <AuthorizeActions
                          row={row}
                          busy={busy}
                          onIssue={() => openChairmanElection(row.applicationId)}
                          onRevoke={() => {
                            if (
                              window.confirm(
                                `Revoke approval for ${applicationReference(row)}? The applicant will be rejected.`,
                              )
                            ) {
                              setRejectTarget(row);
                            }
                          }}
                          onAdvance={() => authorizeStage.mutate(row.applicationId)}
                          canIssue={
                            processable &&
                            (row.statusCode === "Waitlist" ||
                              row.statusCode === "ElectionReview" ||
                              row.statusCode === "Committee" ||
                              row.statusCode === "CommitteeReview" ||
                              row.statusCode === "Approved")
                          }
                          canAdvance={processable && canAuthorizeApplication(row)}
                          sponsorsBlocking={
                            needsCompleteSponsors(row.statusCode) && !isSponsorOk(row)
                          }
                        />
                      ) : showHistoryOnly ? (
                        <HistoryActions
                          row={row}
                          busy={busy}
                          canDelete={canDeleteApplication(row)}
                          onReopen={() => {
                            if (
                              window.confirm(
                                `Reopen ${applicationReference(row)} after rejection? It will return to Committee for re-processing.`,
                              )
                            ) {
                              reopen.mutate(row.applicationId);
                            }
                          }}
                          onDelete={() => {
                            if (
                              window.confirm(
                                `Delete application ${applicationReference(row)}?`,
                              )
                            ) {
                              remove.mutate(row.applicationId);
                            }
                          }}
                        />
                      ) : (
                        <PendingActions
                          row={row}
                          busy={busy}
                          processable={processable}
                          manager={manager}
                          verifying={expanded}
                          canDelete={canDeleteApplication(row)}
                          onVerifyToggle={() =>
                            setVerifyingId((id) =>
                              id === row.applicationId ? null : row.applicationId,
                            )
                          }
                          onReview={() => review.mutate(row.applicationId)}
                          onAuthorize={() => authorizeStage.mutate(row.applicationId)}
                          onElect={() => openChairmanElection(row.applicationId)}
                          onReject={() => setRejectTarget(row)}
                          onDelete={() => {
                            if (
                              window.confirm(
                                `Delete application ${applicationReference(row)}?`,
                              )
                            ) {
                              remove.mutate(row.applicationId);
                            }
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ListPagination
        page={page}
        pageSize={pageSize}
        totalCount={pageData.totalCount}
        totalPages={pageData.totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {verifyingRow ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setViewingFullDetails(false);
              setVerifyingId(null);
            }
          }}
        >
          <SheetContent
            side="right"
            className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-7xl"
          >
            <SheetHeader className="border-b border-border px-6 py-4 pr-12 text-left">
              <SheetTitle>
                {viewingFullDetails
                  ? `Application details: ${applicantDisplayName(verifyingRow)}`
                  : `Manager Review: ${applicantDisplayName(verifyingRow)}`}
              </SheetTitle>
              <SheetDescription>
                Application ID: {applicationReference(verifyingRow)}
                {verifyingRow.membershipTypeName
                  ? ` | ${verifyingRow.membershipTypeName} Application`
                  : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {viewingFullDetails ? (
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="-ml-2 text-muted-foreground"
                    onClick={() => setViewingFullDetails(false)}
                  >
                    <ChevronLeft className="size-4" />
                    Back to manager review
                  </Button>
                  {verifyDetail.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading application details…</p>
                  ) : verifyDetail.data ? (
                    <ApplicantReview
                      applicationId={String(verifyingRow.applicationId)}
                      draft={parseApplicationDraft(verifyDetail.data.formDataJson)}
                      documents={verifyDetail.data.documents ?? []}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {verifyDetail.error
                        ? extractErrorMessage(verifyDetail.error)
                        : "Applicant record was not found."}
                    </p>
                  )}
                </div>
              ) : (
                <ManagerStagePanel
                  applicationId={String(verifyingRow.applicationId)}
                  detail={verifyDetail.data}
                  membershipTypeName={verifyingRow.membershipTypeName}
                  endorsements={verifyDetail.data?.endorsements}
                  committeeNote={committeeNote}
                  onCommitteeNoteChange={setCommitteeNote}
                  onViewFull={() => setViewingFullDetails(true)}
                />
              )}
            </div>
            <SheetFooter className="sticky bottom-0 gap-3 border-t border-border bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
              <p className="text-xs font-medium text-muted-foreground">
                Stage 3 of 4: Manager Review ({applicationStage(verifyingRow)})
              </p>
              <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setVerifyingId(null)}>
                Close
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setRejectTarget(verifyingRow)}
              >
                Reject
              </Button>
              <Button
                type="button"
                disabled={busy || !canAuthorizeFromChecklist}
                title={
                  canAuthorizeFromChecklist
                    ? undefined
                    : !feeChequesOk
                      ? "Upload annual subscription and joining / entrance fee cheques before authorizing."
                    : verifyingReadiness.data?.pilotLicenseRequired && !licenseOk
                      ? "Pilot licence copy is missing. Send a document request before authorizing."
                      : verifyingReadiness.data?.pendingItems?.length
                        ? `Pending: ${verifyingReadiness.data.pendingItems.join("; ")}`
                        : "Complete the verification checklist first"
                }
                onClick={() => authorizeToInterview.mutate(verifyingRow)}
              >
                {authorizeToInterview.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Authorize to interview
              </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : null}

      <RejectApplicationDialog
        open={Boolean(rejectTarget)}
        applicantLabel={rejectTarget ? applicantDisplayName(rejectTarget) : undefined}
        pending={reject.isPending}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        onConfirm={(reason) => {
          if (!rejectTarget) return;
          reject.mutate({ applicationId: rejectTarget.applicationId, reason });
        }}
      />
    </div>
  );
}

function PaymentCell({ view }: { view: PaymentView }) {
  return (
    <div className="min-w-[220px] space-y-1.5">
      <StatusBadge tone={view.tone}>{view.status}</StatusBadge>
    </div>
  );
}

function HistoryActions({
  row,
  busy,
  onReopen,
  onDelete,
  canDelete,
}: {
  row: ApplicationRow;
  busy: boolean;
  onReopen: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const rejected = row.statusCode === "Rejected";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button asChild size="sm" variant="outline">
        <Link
          to="/members/$applicationId"
          params={{ applicationId: String(row.applicationId) }}
          search={{ view: "manager", section: "history" }}
        >
          Review
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link
          to="/members/$applicationId"
          params={{ applicationId: String(row.applicationId) }}
          search={{ view: "manager", section: "history" }}
        >
          View
        </Link>
      </Button>
      {rejected ? (
        <Button type="button" size="sm" disabled={busy} onClick={onReopen}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
          Reopen
        </Button>
      ) : null}
      <Button
        size="icon"
        variant="ghost"
        className="size-8 text-destructive"
        title={canDelete ? "Delete" : "Locked after sponsors signed or fees received"}
        disabled={busy || !canDelete}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function PendingActions({
  row,
  busy,
  processable,
  manager = false,
  verifying = false,
  canDelete = true,
  onVerifyToggle,
  onReview,
  onAuthorize,
  onElect,
  onReject,
  onDelete,
}: {
  row: ApplicationRow;
  busy: boolean;
  processable: boolean;
  manager?: boolean;
  verifying?: boolean;
  canDelete?: boolean;
  onVerifyToggle?: () => void;
  onReview: () => void;
  onAuthorize: () => void;
  onElect: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const paymentBlocking =
    row.statusCode === "Endorsement" && row.stageAPaymentsReady === false;
  const gateBlocking = !isReadyToAuthorize(row);
  const interviewBlocking =
    row.statusCode === "EndorsementReview" &&
    (row.canAuthorizeToInterview === false || gateBlocking);
  const managerSearch = { view: "manager" as const, section: "pending" as const };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {manager ? (
        <Button
          type="button"
          size="sm"
          variant={verifying ? "default" : "outline"}
          onClick={onVerifyToggle}
        >
          {verifying ? "Hide panel" : "Show panel"}
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link
            to="/members/$applicationId"
            params={{ applicationId: String(row.applicationId) }}
          >
            View details
          </Link>
        </Button>
      )}
      {manager ? null : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={!processable || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Process
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canStartReview(row.statusCode) ? (
            <DropdownMenuItem
              disabled={busy || !canReviewApplication(row)}
              onClick={onReview}
              title={
                paymentBlocking
                  ? "Applicant must pay entrance and annual fees first"
                  : row.statusCode === "Endorsement" && !isSponsorOk(row)
                    ? "Proposer and seconder must both endorse first"
                    : undefined
              }
            >
              {row.statusCode === "Endorsement" ? "Open manager review" : "Start review"}
              {paymentBlocking
                ? " (awaiting payment)"
                : row.statusCode === "Endorsement" && !isSponsorOk(row)
                  ? " (awaiting sponsors)"
                  : ""}
            </DropdownMenuItem>
          ) : null}
          {nextApplicationStage(row.statusCode) && !canStartReview(row.statusCode) ? (
            <DropdownMenuItem
              disabled={busy || !canAuthorizeApplication(row)}
              onClick={onAuthorize}
              title={
                interviewBlocking
                  ? "Need sponsors, fees received and complete member details"
                  : undefined
              }
            >
              {row.statusCode === "EndorsementReview"
                ? "Authorize to interview"
                : "Authorize next stage"}
              {interviewBlocking ? " (not ready)" : ""}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={
              busy ||
              !(
                row.statusCode === "Waitlist" ||
                row.statusCode === "ElectionReview" ||
                row.statusCode === "Committee" ||
                row.statusCode === "CommitteeReview"
              )
            }
            onClick={onElect}
          >
            Elect to membership
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={busy}
            className="text-destructive focus:text-destructive"
            onClick={onReject}
          >
            Reject
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      )}
      <Button asChild size="icon" variant="outline" className="size-8" title={manager ? "View details" : "Edit"}>
        <Link
          to="/members/$applicationId"
          params={{ applicationId: String(row.applicationId) }}
          search={manager ? managerSearch : { edit: true }}
        >
          {manager ? <UserRound className="size-4" /> : <Pencil className="size-4" />}
        </Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 text-destructive"
        title={canDelete ? "Delete" : "Locked after sponsors signed or fees received"}
        disabled={busy || !canDelete}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function AuthorizeActions({
  row,
  busy,
  canIssue,
  canAdvance,
  sponsorsBlocking,
  onIssue,
  onRevoke,
  onAdvance,
}: {
  row: ApplicationRow;
  busy: boolean;
  canIssue: boolean;
  canAdvance: boolean;
  sponsorsBlocking?: boolean;
  onIssue: () => void;
  onRevoke: () => void;
  onAdvance: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        disabled={!canIssue || busy}
        title="Chairman election — membership number, date elected, type"
        onClick={onIssue}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
      </Button>
      <Button asChild size="icon" variant="ghost" className="size-8" title="Edit record">
        <Link
          to="/members/$applicationId"
          params={{ applicationId: String(row.applicationId) }}
          search={{ edit: true }}
        >
          <Pencil className="size-4" />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={busy}
            title="Revoke / authorize"
          >
            <Lock className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canAdvance || sponsorsBlocking ? (
            <DropdownMenuItem
              disabled={busy || !canAdvance || sponsorsBlocking}
              onClick={onAdvance}
              title={
                sponsorsBlocking
                  ? "Proposer and seconder must both endorse first"
                  : undefined
              }
            >
              Authorize next stage
              {sponsorsBlocking ? " (awaiting sponsors)" : ""}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={busy}
            className="text-destructive focus:text-destructive"
            onClick={onRevoke}
          >
            Revoke approval
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
