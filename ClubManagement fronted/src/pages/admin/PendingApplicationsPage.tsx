import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  Download,
  FileUp,
  Loader2,
  Lock,
  Pencil,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { ManagerStagePanel, type ManagerReadiness, type PaymentRow } from "@/components/admin/ManagerStagePanel";
import { DashboardKpiRow } from "@/components/admin/ModuleStatsDashboard";
import { RejectApplicationDialog } from "@/components/admin/RejectApplicationDialog";
import { ListPagination } from "@/components/common/ListPagination";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageDataGate } from "@/components/layout/PageLoading";
import { ADMIN_OVERVIEW_QUERY_KEY, fetchAdminOverview } from "@/services/admin/dashboardData";
import { applicantQueueKpis } from "@/services/admin/moduleDashboard";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  downloadApplicationImportTemplate,
  downloadApplicationsExcel,
  parseApplicationImportFile,
  printApplications,
} from "@/utils/applicationDeskExport";

const MANAGER_MISSING_FILTERS = [
  { id: "any", label: "Any" },
  { id: "payment", label: "Awaiting payment" },
  { id: "details", label: "Member details incomplete" },
  { id: "complete", label: "Ready to authorize" },
] as const;

type MissingFilter = (typeof MANAGER_MISSING_FILTERS)[number]["id"];

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
  amount: number | null | undefined;
  receiptNumber: string | null | undefined;
  paymentDate: string | null | undefined;
  lines: PaymentLineView[];
};

function toPaymentLineView(payment: PaymentRow): PaymentLineView {
  const source = payment as unknown as Record<string, unknown>;
  const amountValue =
    typeof source["amount"] === "number"
      ? source["amount"]
      : Number(source["amount"] ?? source["paidAmount"] ?? 0);

  return {
    feeCode:
      typeof source["feeCode"] === "string"
        ? source["feeCode"]
        : typeof source["paymentTypeCode"] === "string"
          ? source["paymentTypeCode"]
          : null,
    feeLabel:
      typeof source["feeLabel"] === "string"
        ? source["feeLabel"]
        : typeof source["paymentTypeName"] === "string"
          ? source["paymentTypeName"]
          : typeof source["feeName"] === "string"
            ? source["feeName"]
            : "Fee",
    amount: Number.isFinite(amountValue) ? amountValue : 0,
    receiptNumber:
      typeof source["receiptNumber"] === "string"
        ? source["receiptNumber"]
        : typeof source["receiptNo"] === "string"
          ? source["receiptNo"]
          : typeof source["referenceNumber"] === "string"
            ? source["referenceNumber"]
            : null,
    paymentDate:
      typeof source["paymentDate"] === "string"
        ? source["paymentDate"]
        : typeof source["receivedAt"] === "string"
          ? source["receivedAt"]
          : typeof source["createdAt"] === "string"
            ? source["createdAt"]
            : null,
    received:
      typeof source["received"] === "boolean"
        ? source["received"]
        : typeof source["isPaid"] === "boolean"
          ? source["isPaid"]
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
            receiptNumber: row.paymentReceiptNumber ?? null,
            paymentDate: row.paymentDate ?? null,
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
  const amountValue =
    liveLines.length > 0
      ? liveLines.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0)
      : Number(row.paymentAmount ?? 0);
  const receiptNumber =
    liveLines.find((line) => line.receiptNumber?.trim())?.receiptNumber ?? row.paymentReceiptNumber;
  const paymentDate = liveLines.find((line) => line.paymentDate)?.paymentDate ?? row.paymentDate;
  const status =
    liveLines.length > 0
      ? received
        ? amountValue > 0 && !isPaymentOk(row)
          ? "Partially paid"
          : "Paid"
        : row.paymentStatus?.trim() || "Pending"
      : row.paymentStatus?.trim() || "Pending";
  const tone =
    liveLines.length > 0
      ? received
        ? amountValue > 0 && !isPaymentOk(row)
          ? "amber"
          : "green"
        : "slate"
      : paymentTone(row);

  return {
    tone,
    status,
    received,
    amount: amountValue,
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
      : "Track applicants through screening.";

  return (
    <PageFrame width="lg" className="max-w-[1400px]">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      {/* <PageHeader
        title={title}
        description={description}
      /> */}
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
  const [selected, setSelected] = useState<Record<number, ApplicationRow>>({});
  const [exportBusy, setExportBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Pending view shows the queue table; history view shows the previously
  // authorized list. Auto-verification panel only appears in pending view.
  const { data, isLoading } = useQuery({
    queryKey: [
      "applications",
      manager ? (showHistoryOnly ? "manager-history" : "manager-queue") : "all",
      page,
      pageSize,
      search,
      dateFrom,
      dateTo,
    ],
    queryFn: () => {
      const params = pagedQuery({
        page,
        pageSize,
        search: search.trim() || undefined,
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
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
  const showQueueStats = !authorize && !manager;
  const overview = useQuery({
    queryKey: ADMIN_OVERVIEW_QUERY_KEY,
    queryFn: fetchAdminOverview,
    enabled: isAuthenticated() && showQueueStats,
  });

  const classOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of pageData.items) {
      if (row.membershipTypeName) names.add(row.membershipTypeName);
    }
    return [...names].sort();
  }, [pageData.items]);

  const matchesDeskFilters = (row: ApplicationRow) => {
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
    if (!manager && (row.statusCode === "Draft" || row.statusCode === "Withdrawn")) return false;
    if (classes.length > 0 && !classes.includes(row.membershipTypeName ?? "")) return false;
    if (manager) {
      if (missing === "payment" && isPaymentOk(row)) return false;
      if (missing === "details" && isMemberDetailsOk(row)) return false;
      if (missing === "complete" && !isReadyToAuthorize(row)) return false;
    }
    const applied = dayStamp(row.appliedAt);
    if (dateFrom && (!applied || applied < dateFrom)) return false;
    if (dateTo && (!applied || applied > dateTo)) return false;
    const query = search.trim().toLowerCase();
    if (query) {
      const haystack = `${applicantDisplayName(row)} ${applicationReference(row)}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  };

  const filtered = useMemo(
    () => pageData.items.filter(matchesDeskFilters),
    // matchesDeskFilters closes over the current filter state used below.
    [authorize, classes, dateFrom, dateTo, manager, missing, pageData.items, search, showHistoryOnly],
  );

  const rows = filtered;
  const showDeskTools = !manager;
  const selectedRows = Object.values(selected);
  const selectedCount = selectedRows.length;
  const allOnPageSelected = rows.length > 0 && rows.every((row) => Boolean(selected[row.applicationId]));
  const someOnPageSelected = rows.some((row) => Boolean(selected[row.applicationId]));

  async function fetchAllMatchingApplications() {
    const collected: ApplicationRow[] = [];
    let pageNum = 1;
    let totalPages = 1;
    do {
      const params = pagedQuery({
        page: pageNum,
        pageSize: 100,
        search: search.trim() || undefined,
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
      });
      const path = showHistoryOnly
        ? `/api/applications/manager-history?${params}`
        : manager
          ? `/api/applications/manager-queue?${params}`
          : `/api/applications?${params}`;
      const result = await apiRequest<PagedResult<ApplicationRow>>(path);
      collected.push(...result.items);
      totalPages = Math.max(1, result.totalPages || 1);
      pageNum += 1;
    } while (pageNum <= totalPages);
    return collected.filter(matchesDeskFilters);
  }

  function printRows(list: ApplicationRow[], title: string) {
    if (list.length === 0) {
      toast.error("Nothing to print.");
      return;
    }
    const ok = printApplications(title, list);
    if (!ok) toast.error("Could not open the print dialog. Try again.");
  }

  function exportRows(list: ApplicationRow[], filename: string) {
    if (list.length === 0) {
      toast.error("Nothing to export.");
      return;
    }
    downloadApplicationsExcel(filename, list);
    toast.success(`Downloaded ${list.length} application(s).`);
  }

  async function handlePrint() {
    try {
      setExportBusy(true);
      if (selectedCount > 0) {
        printRows(selectedRows, `Applications · selected (${selectedCount})`);
        return;
      }
      const all = await fetchAllMatchingApplications();
      printRows(all, "Pending applications");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleDownloadExcel() {
    try {
      setExportBusy(true);
      if (selectedCount > 0) {
        exportRows(selectedRows, `applications-selected-${selectedCount}.csv`);
        return;
      }
      const all = await fetchAllMatchingApplications();
      exportRows(all, "pending-applications.csv");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleSelectAllMatching() {
    try {
      setExportBusy(true);
      const all = await fetchAllMatchingApplications();
      const next: Record<number, ApplicationRow> = {};
      for (const row of all) next[row.applicationId] = row;
      setSelected(next);
      toast.success(`Selected ${all.length} application(s).`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleImportFile(file: File) {
    if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
      toast.error("Save the workbook as CSV in Excel, then import that file.");
      return;
    }
    try {
      setExportBusy(true);
      const text = await file.text();
      const incoming = parseApplicationImportFile(text);
      if (incoming.length === 0) {
        toast.error("No applicant rows found. Use the template (FirstName, LastName, Email, Mobile, MembershipClass).");
        return;
      }
      let created = 0;
      const failures: string[] = [];
      for (const row of incoming) {
        try {
          const profile = await apiRequest<{ profileId: number }>("/api/profiles", {
            method: "POST",
            body: JSON.stringify({
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email || undefined,
              mobile: row.mobile || undefined,
            }),
          });
          await apiRequest("/api/applications", {
            method: "POST",
            body: JSON.stringify({
              applicantProfileId: profile.profileId,
              formDataJson: JSON.stringify({
                personal: {
                  firstName: row.firstName,
                  lastName: row.lastName,
                  email: row.email,
                  mobile: row.mobile,
                },
                membership: { membershipType: row.membershipClass || "Full Membership" },
              }),
              completedSteps: ["personal"],
            }),
          });
          created += 1;
        } catch (err) {
          failures.push(`${row.firstName} ${row.lastName}: ${extractErrorMessage(err)}`);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_QUERY_KEY });
      if (created) toast.success(`Imported ${created} application(s).`);
      if (failures.length) toast.error(failures.slice(0, 3).join(" · "));
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setExportBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

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
  const paymentsReady = Boolean(verifyingReadiness.data?.paymentsReady);
  const canAuthorizeFromChecklist =
    Boolean(verifyingReadiness.data) &&
    (verifyingRow?.statusCode === "Endorsement" ||
      verifyingRow?.statusCode === "EndorsementReview") &&
    paymentsReady &&
    Boolean(verifyingReadiness.data?.canProceedToInterview || (
      licenseOk &&
      verifyingReadiness.data?.endorsementsComplete &&
      verifyingReadiness.data?.paymentsReady &&
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
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_QUERY_KEY });
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
  const missingLabel =
    MANAGER_MISSING_FILTERS.find((item) => item.id === missing)?.label ?? "Any";
  const showExtraColumns = manager;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4">
      {showQueueStats ? (
        <DashboardKpiRow kpis={applicantQueueKpis(overview.data, pageData.totalCount)} />
      ) : null}
      <div
        className={cn(
          "grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-3",
          manager ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3",
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

        {manager ? (
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
                {MANAGER_MISSING_FILTERS.map((option) => (
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
        ) : (
          <div className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
            Date range
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Input
                type="date"
                aria-label="From date"
                className="h-9 min-w-[9.5rem] text-sm [color-scheme:light]"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                aria-label="To date"
                className="h-9 min-w-[9.5rem] text-sm [color-scheme:light]"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}  
              />
            </div>
          </div>
        )}

        <div className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          Search
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              placeholder="Search by applicant name"
              className="h-9 min-w-0 pl-9"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {showDeskTools ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exportBusy}
            onClick={() => importInputRef.current?.click()}
          >
            {exportBusy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            Import Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exportBusy || pageData.totalCount === 0}
            onClick={() => void handleSelectAllMatching()}
          >
            Select all
          </Button>
          {selectedCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected({})}>
              Clear ({selectedCount})
            </Button>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportBusy}
              onClick={() => void handlePrint()}
            >
              {exportBusy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              {selectedCount > 0 ? `Print (${selectedCount})` : "Print"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportBusy}
              onClick={() => void handleDownloadExcel()}
            >
              {exportBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {selectedCount > 0 ? `Download Excel (${selectedCount})` : "Download Excel"}
            </Button>
          </div>
        </div>
      ) : null}

      <PageDataGate loading={isLoading} label="Loading applications…" minHeightClassName="min-h-[22rem]">
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className={cn("w-full text-sm", showExtraColumns ? "min-w-[980px]" : "min-w-[720px]")}>
          <thead className="bg-secondary/40 text-left text-muted-foreground">
            <tr>
              {showDeskTools ? (
                <th className="w-10 px-3 py-3">
                  <Checkbox
                    checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                    onCheckedChange={(value) => {
                      const checked = value === true;
                      setSelected((prev) => {
                        const next = { ...prev };
                        for (const row of rows) {
                          if (checked) next[row.applicationId] = row;
                          else delete next[row.applicationId];
                        }
                        return next;
                      });
                    }}
                    aria-label="Select all on this page"
                  />
                </th>
              ) : null}
              {(showExtraColumns
                ? ["Applicant", "Class", "Status", "Payment", "Sponsors", "Actions"]
                : ["Applicant", "Class", "Status", "Actions"]
              ).map((heading) => (
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
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={(showExtraColumns ? 6 : 4) + (showDeskTools ? 1 : 0)}>
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
                      selected[row.applicationId] && "bg-primary/5",
                    )}
                  >
                    {showDeskTools ? (
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={Boolean(selected[row.applicationId])}
                          onCheckedChange={(value) => {
                            const checked = value === true;
                            setSelected((prev) => {
                              if (checked) return { ...prev, [row.applicationId]: row };
                              const next = { ...prev };
                              delete next[row.applicationId];
                              return next;
                            });
                          }}
                          aria-label={`Select ${name}`}
                        />
                      </td>
                    ) : null}
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
                    {showExtraColumns ? (
                      <>
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
                      </>
                    ) : null}
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
                          onPrint={() =>
                            printRows([row], `Application · ${applicantDisplayName(row)}`)
                          }
                          onExport={() =>
                            exportRows(
                              [row],
                              `${applicationReference(row).toLowerCase()}.csv`,
                            )
                          }
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
                          onPrint={() =>
                            printRows([row], `Application · ${applicantDisplayName(row)}`)
                          }
                          onExport={() =>
                            exportRows(
                              [row],
                              `${applicationReference(row).toLowerCase()}.csv`,
                            )
                          }
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
      </PageDataGate>

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
                  detail={verifyDetail.data ?? null}
                  membershipTypeName={verifyingRow.membershipTypeName ?? null}
                  endorsements={verifyDetail.data?.endorsements ?? null}
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
                    : !paymentsReady
                      ? "Entrance and annual fees must be paid or cheque-uploaded before authorizing."
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
        applicantLabel={rejectTarget ? applicantDisplayName(rejectTarget) : ""}
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
    </TooltipProvider>
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
  onPrint,
  onExport,
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
  onPrint?: () => void;
  onExport?: () => void;
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
            Review
          </Link>
        </Button>
      )}
      {manager ? null : (
      <DropdownMenu>
        {/* <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={!processable || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Process
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger> */}
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
      {onPrint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="outline" className="size-8" onClick={onPrint}>
              <Printer className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Print</TooltipContent>
        </Tooltip>
      ) : null}
      {onExport ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="outline" className="size-8" onClick={onExport}>
              <Download className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download Excel</TooltipContent>
        </Tooltip>
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

function AuthorizeActions({
  row,
  busy,
  canIssue,
  canAdvance,
  sponsorsBlocking,
  onIssue,
  onRevoke,
  onAdvance,
  onPrint,
  onExport,
}: {
  row: ApplicationRow;
  busy: boolean;
  canIssue: boolean;
  canAdvance: boolean;
  sponsorsBlocking?: boolean;
  onIssue: () => void;
  onRevoke: () => void;
  onAdvance: () => void;
  onPrint?: () => void;
  onExport?: () => void;
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
      {onPrint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onPrint}>
              <Printer className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Print</TooltipContent>
        </Tooltip>
      ) : null}
      {onExport ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onExport}>
              <Download className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download Excel</TooltipContent>
        </Tooltip>
      ) : null}
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
              disabled={busy || !canAdvance || !!sponsorsBlocking}
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
