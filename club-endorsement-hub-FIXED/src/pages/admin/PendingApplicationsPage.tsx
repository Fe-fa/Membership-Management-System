import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { ManagerVerifyWizard } from "@/components/admin/ManagerVerifyWizard";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applicantDisplayName,
  applicationProgress,
  applicationReference,
  applicationStage,
  canStartReview,
  formatMembershipDate,
  isReviewStatus,
  nextApplicationStage,
  type ApplicationRow,
} from "@/services/admin/membershipDesk";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { isAuthenticated } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

type AssignCommitteeOption = {
  committeeId: number;
  committeeName: string;
  termStart?: string | null;
  termEnd?: string | null;
  scheduledMeetings: Array<{
    committeeMeetingId: number;
    meetingName?: string | null;
    meetingDate: string;
    meetingTime?: string | null;
    meetingTypeName: string;
  }>;
};

const PAGE_SIZE = 8;

const MISSING_FILTERS = [
  { id: "any", label: "Any" },
  { id: "incomplete", label: "Incomplete sections" },
  { id: "payment", label: "Missing payment" },
  { id: "sponsor", label: "Missing sponsor" },
  { id: "complete", label: "All pre-requisites met" },
] as const;

type MissingFilter = (typeof MISSING_FILTERS)[number]["id"];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function dayStamp(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function rowCommitteeNameMatch(committeeName: string, meetingName?: string | null) {
  if (!meetingName) return false;
  return committeeName.trim().toLowerCase() === meetingName.trim().toLowerCase();
}

function isSectionsComplete(row: ApplicationRow) {
  const { done, total } = applicationProgress(row);
  return total > 0 && done >= total;
}

function isPaymentOk(row: ApplicationRow) {
  const code = (row.paymentStatusCode ?? row.paymentStatus ?? "").toLowerCase().replace(/[\s-]/g, "_");
  return code === "paid" || code === "waived";
}

function paymentTone(row: ApplicationRow): "green" | "amber" | "slate" | "rose" {
  const code = (row.paymentStatusCode ?? row.paymentStatus ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (code === "paid" || code === "waived") return "green";
  if (code === "partially_paid" || code === "overdue") return "amber";
  return "slate";
}

function isSponsorOk(row: ApplicationRow) {
  const code = (row.sponsorStatusCode ?? row.sponsorStatus ?? "").toLowerCase();
  return code === "complete" || (row.endorsementsCompleted ?? 0) >= (row.endorsementsRequired ?? 2);
}

/** Endorsement stage cannot advance until proposer + seconder have both endorsed. */
function needsCompleteSponsors(statusCode?: string | null) {
  return statusCode === "Endorsement" || statusCode === "EndorsementReview";
}

function canReviewApplication(row: ApplicationRow) {
  if (!canStartReview(row.statusCode)) return false;
  if (row.statusCode === "Endorsement" && !isSponsorOk(row)) return false;
  // Stage A: need fees before opening manager review.
  if (row.statusCode === "Endorsement" && row.stageAPaymentsReady === false) return false;
  return true;
}

function canAuthorizeApplication(row: ApplicationRow) {
  if (nextApplicationStage(row.statusCode) == null) return false;
  if (canStartReview(row.statusCode)) return false;
  if (row.statusCode === "EndorsementReview" && !isSponsorOk(row)) return false;
  if (row.statusCode === "EndorsementReview" && row.canAuthorizeToInterview === false) return false;
  return true;
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

export function PendingApplicationsPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const authorize = search.view === "authorize";
  const manager = search.view === "manager";
  return (
    <PageFrame width="lg">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title={
          manager
            ? "Notification"
            : authorize
              ? "Authorized Applications"
              : "Pending Applications"
        }
        description={
          manager
            ? "Review applications in the Stage A queue, authorize to interview, then assign each to an existing committee (or an already scheduled sitting)."
            : authorize
              ? "View and manage applications that have completed screening and are ready for authorization or credentials."
              : "Track applicants through screening. Check pre-requisites, payment and sponsor status before processing."
        }
      />
      <PendingApplicationsPanel authorize={authorize} manager={manager} />
    </PageFrame>
  );
}

function PendingApplicationsPanel({
  authorize = false,
  manager = false,
}: {
  authorize?: boolean;
  manager?: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<string[]>([]);
  const [missing, setMissing] = useState<MissingFilter>("any");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [assignRow, setAssignRow] = useState<ApplicationRow | null>(null);
  const [meetingForm, setMeetingForm] = useState({
    committeeId: "",
    committeeMeetingId: "new",
    meetingDate: "",
    meetingTime: "10:00",
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["applications", manager ? "manager-queue" : "all"],
    queryFn: () =>
      apiRequest<ApplicationRow[]>(manager ? "/api/applications/manager-queue" : "/api/applications"),
    enabled: isAuthenticated(),
  });

  // Apps the manager already authorized out of Stage A (interview and beyond).
  const stageHistory = useQuery({
    queryKey: ["applications", "stage-a-history"],
    queryFn: () => apiRequest<ApplicationRow[]>("/api/applications/manager-history"),
    enabled: isAuthenticated() && manager,
  });

  const assignCommittees = useQuery({
    queryKey: ["committees", "active-for-assign"],
    queryFn: () => apiRequest<AssignCommitteeOption[]>("/api/committees/active"),
    enabled: isAuthenticated() && manager && Boolean(assignRow),
  });

  const selectedCommittee = useMemo(
    () =>
      (assignCommittees.data ?? []).find((c) => String(c.committeeId) === meetingForm.committeeId) ??
      null,
    [assignCommittees.data, meetingForm.committeeId],
  );

  const selectedExistingMeeting = useMemo(() => {
    if (!selectedCommittee || meetingForm.committeeMeetingId === "new") return null;
    return (
      selectedCommittee.scheduledMeetings.find(
        (m) => String(m.committeeMeetingId) === meetingForm.committeeMeetingId,
      ) ?? null
    );
  }, [selectedCommittee, meetingForm.committeeMeetingId]);

  useEffect(() => {
    if (!assignRow || meetingForm.committeeId) return;
    const committees = assignCommittees.data ?? [];
    if (committees.length === 0) return;
    const matchByName = committees.find(
      (c) =>
        rowCommitteeNameMatch(c.committeeName, assignRow.committeeMeetingName),
    );
    const first = matchByName ?? committees[0];
    setMeetingForm((f) => ({
      ...f,
      committeeId: String(first.committeeId),
    }));
  }, [assignRow, assignCommittees.data, meetingForm.committeeId]);

  const classOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of data) {
      if (row.membershipTypeName) names.add(row.membershipTypeName);
    }
    return [...names].sort();
  }, [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.filter((row) => {
      if (manager) {
        // Queue already filtered to endorsed Endorsement / EndorsementReview.
      } else if (authorize) {
        if (!isReviewStatus(row.statusCode) && row.statusCode !== "Approved") return false;
      } else if (isReviewStatus(row.statusCode) || row.statusCode === "Approved") {
        return false;
      }
      if (!manager && (row.statusCode === "Draft" || row.statusCode === "Withdrawn")) return false;

      if (classes.length > 0 && !classes.includes(row.membershipTypeName ?? "")) return false;

      if (missing === "incomplete" && isSectionsComplete(row)) return false;
      if (missing === "payment" && isPaymentOk(row)) return false;
      if (missing === "sponsor" && isSponsorOk(row)) return false;
      if (missing === "complete" && !(isSectionsComplete(row) && isPaymentOk(row) && isSponsorOk(row))) {
        return false;
      }

      const updated = dayStamp(row.updatedAt || row.appliedAt);
      if (dateFrom && updated && updated < dateFrom) return false;
      if (dateTo && updated && updated > dateTo) return false;

      if (query) {
        const haystack = `${applicantDisplayName(row)} ${applicationReference(row)}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [authorize, classes, data, dateFrom, dateTo, missing, manager, search]);

  const authorizedHistory = useMemo(() => {
    if (!manager) return [];
    const query = search.trim().toLowerCase();
    return (stageHistory.data ?? [])
      .filter((row) => {
        if (classes.length > 0 && !classes.includes(row.membershipTypeName ?? "")) return false;
        const updated = dayStamp(row.updatedAt || row.appliedAt);
        if (dateFrom && updated && updated < dateFrom) return false;
        if (dateTo && updated && updated > dateTo) return false;
        if (query) {
          const haystack = `${applicantDisplayName(row)} ${applicationReference(row)}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      });
  }, [classes, dateFrom, dateTo, manager, search, stageHistory.data]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Stage A: open the verify panel automatically so managers see the step flow without hunting for it.
  const rowIdsKey = rows.map((r) => r.applicationId).join(",");
  useEffect(() => {
    if (!manager) {
      setVerifyingId(null);
      return;
    }
    if (!rowIdsKey) {
      setVerifyingId(null);
      return;
    }
    const ids = rowIdsKey.split(",").map(Number);
    setVerifyingId((current) => {
      if (current != null && ids.includes(current)) return current;
      return ids[0] ?? null;
    });
  }, [manager, rowIdsKey]);

  const verifyingRow = manager ? rows.find((r) => r.applicationId === verifyingId) ?? null : null;

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

  const authorizeStage = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/applications/${applicationId}/advance`, {
        method: "POST",
        body: JSON.stringify({ reason: "Authorized to the next stage after review" }),
      }),
    onSuccess: () => {
      toast.success("Applicant authorized to the next stage.");
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["applications", "stage-a-history"] });
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
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/applications/${applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          statusCode: "Rejected",
          reason: authorize ? "Approval revoked from authorize desk" : "Rejected from pending applications desk",
        }),
      }),
    onSuccess: () => {
      toast.success(authorize ? "Approval revoked." : "Application rejected.");
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
      toast.success("Application reopened at Committee stage. You can edit and process again.");
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["applications", "stage-a-history"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const assignMeeting = useMutation({
    mutationFn: () => {
      if (!assignRow) throw new Error("No application selected.");
      if (!meetingForm.committeeId) throw new Error("Select a committee.");
      const body =
        meetingForm.committeeMeetingId !== "new"
          ? {
              committeeId: Number(meetingForm.committeeId),
              committeeMeetingId: Number(meetingForm.committeeMeetingId),
            }
          : {
              committeeId: Number(meetingForm.committeeId),
              meetingDate: meetingForm.meetingDate,
              meetingTime: meetingForm.meetingTime,
            };
      return apiRequest<{
        committeeMeetingName?: string;
        committeeMeetingDate?: string;
        committeeMeetingTime?: string;
      }>(`/api/applications/${assignRow.applicationId}/assign-meeting`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (result) => {
      toast.success(
        `Assigned to “${result.committeeMeetingName ?? selectedCommittee?.committeeName ?? "committee"}” on ${result.committeeMeetingDate ?? meetingForm.meetingDate} at ${result.committeeMeetingTime ?? meetingForm.meetingTime}. Applicant notified.`,
      );
      setAssignRow(null);
      void queryClient.invalidateQueries({ queryKey: ["applications", "stage-a-history"] });
      void queryClient.invalidateQueries({ queryKey: ["committees", "active-for-assign"] });
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
      void queryClient.invalidateQueries({ queryKey: ["applications", "stage-a-history"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const busy =
    authorizeStage.isPending ||
    reject.isPending ||
    review.isPending ||
    remove.isPending ||
    reopen.isPending ||
    assignMeeting.isPending;
  const classSummary =
    classes.length === 0 ? "All classes" : classes.length <= 2 ? classes.join(", ") : `${classes.length} classes`;
  const missingLabel = MISSING_FILTERS.find((item) => item.id === missing)?.label ?? "Any";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          Membership Class
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 w-full min-w-0 justify-between font-normal text-foreground">
                <span className="truncate">{classSummary}</span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {classOptions.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No classes yet</div>
              ) : (
                classOptions.map((name) => (
                  <DropdownMenuCheckboxItem
                    key={name}
                    checked={classes.includes(name)}
                    onCheckedChange={() => {
                      setPage(1);
                      setClasses((current) =>
                        current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
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
          Missing Requirements
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 w-full min-w-0 justify-between font-normal text-foreground">
                <span className="truncate">{missingLabel}</span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {MISSING_FILTERS.map((option) => (
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

        <div className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
          Search
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              placeholder="Search by applicant name or app"
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
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-secondary/40 text-left text-muted-foreground">
            <tr>
              {[
                "Applicant",
                "Class",
                "Application status",
                "Payment Status",
                "Sponsor Status",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
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
                      <p className="font-medium text-foreground">No applications in Stage A yet.</p>
                      <p>
                        Apps appear here after both proposer and seconder submit. If entrance or annual
                        fees are unpaid, the applicant is notified to pay first; when fees are recorded
                        you get a notification to verify and authorize to interview.
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
                const progress = applicationProgress(row);
                const mark = initials(name);
                const sectionsOk = isSectionsComplete(row);
                const processable = sectionsOk && row.statusCode !== "Rejected";
                const expanded = manager && verifyingId === row.applicationId;

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
                            <p className="font-medium leading-tight text-foreground">{name}</p>
                            <p className="text-xs text-muted-foreground">{applicationReference(row)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{row.membershipTypeName || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="min-w-[180px] space-y-1.5">
                          <StatusBadge tone={statusTone(row)}>{applicationStage(row)}</StatusBadge>
                          <p className="text-xs text-muted-foreground">
                            {progress.done}/{progress.total} sections
                          </p>
                          <SegmentProgress done={progress.done} total={progress.total} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={paymentTone(row)}>
                          {row.paymentStatus?.trim() || "Pending"}
                        </StatusBadge>
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
                              {(row.endorsementsCompleted ?? 0)}/{row.endorsementsRequired ?? 2}{" "}
                              endorsements
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
                              if (window.confirm(`Revoke approval for ${applicationReference(row)}?`)) {
                                reject.mutate(row.applicationId);
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
                        ) : (
                          <PendingActions
                            row={row}
                            busy={busy}
                            processable={processable}
                            manager={manager}
                            verifying={expanded}
                            onVerifyToggle={() =>
                              setVerifyingId((id) =>
                                id === row.applicationId ? null : row.applicationId,
                              )
                            }
                            onReview={() => review.mutate(row.applicationId)}
                            onAuthorize={() => authorizeStage.mutate(row.applicationId)}
                            onElect={() => openChairmanElection(row.applicationId)}
                            onReject={() => reject.mutate(row.applicationId)}
                            onDelete={() => {
                              if (window.confirm(`Delete application ${applicationReference(row)}?`)) {
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

      {verifyingRow ? (
        <div className="scroll-mt-4">
          <ManagerVerifyWizard
            row={verifyingRow}
            onClose={() => setVerifyingId(null)}
          />
        </div>
      ) : null}

      {manager ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Previously authorized (Stage A history)</h2>
            <p className="text-sm text-muted-foreground">
              Applicants authorized to interview. Use{" "}
              <span className="font-medium text-foreground">Assign to meeting</span> to pick an existing
              committee (and optional scheduled sitting) — the applicant is notified on their dashboard.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-secondary/40 text-left text-muted-foreground">
                <tr>
                  {[
                    "Applicant",
                    "Class",
                    "Application status",
                    "Payment Status",
                    "Sponsor Status",
                    "Actions",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stageHistory.isLoading ? (
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                      Loading history…
                    </td>
                  </tr>
                ) : authorizedHistory.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={6}>
                      No previously authorized applications yet. After you authorize someone from Stage A
                      to interview, they appear in this list.
                    </td>
                  </tr>
                ) : (
                  authorizedHistory.map((row) => {
                    const name = applicantDisplayName(row);
                    const progress = applicationProgress(row);
                    const mark = initials(name);
                    return (
                      <tr key={`hist-${row.applicationId}`} className="border-t border-border align-middle">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                              {mark || <UserRound className="size-4" />}
                            </div>
                            <div>
                              <p className="font-medium leading-tight text-foreground">{name}</p>
                              <p className="text-xs text-muted-foreground">{applicationReference(row)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground">{row.membershipTypeName || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="min-w-[180px] space-y-1.5">
                            <StatusBadge tone={statusTone(row)}>{applicationStage(row)}</StatusBadge>
                            <p className="text-xs text-muted-foreground">
                              {progress.done}/{progress.total} sections
                            </p>
                            <SegmentProgress done={progress.done} total={progress.total} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={paymentTone(row)}>
                            {row.paymentStatus?.trim() || "Pending"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-[120px] space-y-1">
                            <StatusBadge tone={sponsorTone(row)}>
                              {row.sponsorStatus?.trim() || "Pending"}
                            </StatusBadge>
                            <p className="text-xs text-muted-foreground">
                              {(row.endorsementsCompleted ?? 0)}/{row.endorsementsRequired ?? 2}{" "}
                              endorsements
                            </p>
                            {row.assignedToMeeting && row.committeeMeetingDate ? (
                              <p className="text-xs font-medium text-emerald-800">
                                {row.committeeMeetingName
                                  ? `${row.committeeMeetingName} · `
                                  : ""}
                                {row.committeeMeetingDate}
                                {row.committeeMeetingTime ? ` · ${row.committeeMeetingTime}` : ""}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">No meeting assigned</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <HistoryActions
                            row={row}
                            busy={busy}
                            onAssignMeeting={() => {
                              setAssignRow(row);
                              const committees = assignCommittees.data ?? [];
                              const matchByName = committees.find(
                                (c) =>
                                  row.committeeMeetingName &&
                                  c.committeeName.toLowerCase() ===
                                    row.committeeMeetingName.toLowerCase(),
                              );
                              const first = matchByName ?? committees[0];
                              const existingSitting = first?.scheduledMeetings.find(
                                (m) =>
                                  m.meetingDate === row.committeeMeetingDate &&
                                  (m.meetingTime ?? "") === (row.committeeMeetingTime ?? ""),
                              );
                              setMeetingForm({
                                committeeId: first ? String(first.committeeId) : "",
                                committeeMeetingId: existingSitting
                                  ? String(existingSitting.committeeMeetingId)
                                  : "new",
                                meetingDate: row.committeeMeetingDate || kenyaTodayISO(),
                                meetingTime: row.committeeMeetingTime || "10:00",
                              });
                            }}
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
                              if (window.confirm(`Delete application ${applicationReference(row)}?`)) {
                                remove.mutate(row.applicationId);
                              }
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          disabled={safePage <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
          <Button
            key={number}
            type="button"
            size="icon"
            variant={number === safePage ? "default" : "outline"}
            className="size-8"
            onClick={() => setPage(number)}
          >
            {number}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          disabled={safePage >= pageCount}
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <Dialog open={Boolean(assignRow)} onOpenChange={(open) => !open && setAssignRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign to meeting</DialogTitle>
            <DialogDescription>
              Schedule {assignRow ? applicantDisplayName(assignRow) : "the applicant"} against an
              existing committee from Manage Committee. They will get a notification on their
              dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <Label>Committee</Label>
              <Select
                value={meetingForm.committeeId}
                onValueChange={(value) =>
                  setMeetingForm((f) => ({
                    ...f,
                    committeeId: value,
                    committeeMeetingId: "new",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      assignCommittees.isLoading ? "Loading committees…" : "Select committee"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(assignCommittees.data ?? []).map((c) => (
                    <SelectItem key={c.committeeId} value={String(c.committeeId)}>
                      {c.committeeName}
                      {c.termStart || c.termEnd
                        ? ` (${c.termStart ?? "…"} → ${c.termEnd ?? "…"})`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!assignCommittees.isLoading && (assignCommittees.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-amber-800">
                  No active committee found. Create one under Manage Committee first.
                </p>
              ) : null}
            </label>

            <label className="grid gap-1 text-sm">
              <Label>Sitting</Label>
              <Select
                value={meetingForm.committeeMeetingId}
                onValueChange={(value) =>
                  setMeetingForm((f) => ({ ...f, committeeMeetingId: value }))
                }
                disabled={!meetingForm.committeeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sitting" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New sitting (set date & time)</SelectItem>
                  {(selectedCommittee?.scheduledMeetings ?? []).map((m) => (
                    <SelectItem key={m.committeeMeetingId} value={String(m.committeeMeetingId)}>
                      {(m.meetingName || m.meetingTypeName || "Meeting") +
                        ` · ${m.meetingDate}` +
                        (m.meetingTime ? ` ${m.meetingTime}` : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {meetingForm.committeeMeetingId === "new" ? (
              <>
                <label className="grid gap-1 text-sm">
                  <Label htmlFor="meeting-date">Date</Label>
                  <Input
                    id="meeting-date"
                    type="date"
                    value={meetingForm.meetingDate}
                    onChange={(e) => setMeetingForm((f) => ({ ...f, meetingDate: e.target.value }))}
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <Label htmlFor="meeting-time">Time</Label>
                  <Input
                    id="meeting-time"
                    type="time"
                    value={meetingForm.meetingTime}
                    onChange={(e) => setMeetingForm((f) => ({ ...f, meetingTime: e.target.value }))}
                    required
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  A new interview sitting will be scheduled under the selected committee name (no
                  duplicate committee is created).
                </p>
              </>
            ) : selectedExistingMeeting ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Using scheduled sitting:{" "}
                <span className="font-medium text-foreground">
                  {selectedExistingMeeting.meetingName || selectedExistingMeeting.meetingTypeName}
                </span>{" "}
                on {selectedExistingMeeting.meetingDate}
                {selectedExistingMeeting.meetingTime
                  ? ` at ${selectedExistingMeeting.meetingTime}`
                  : ""}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignRow(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                assignMeeting.isPending ||
                !meetingForm.committeeId ||
                (meetingForm.committeeMeetingId === "new" &&
                  (!meetingForm.meetingDate || !meetingForm.meetingTime))
              }
              onClick={() => assignMeeting.mutate()}
            >
              {assignMeeting.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save & notify applicant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryActions({
  row,
  busy,
  onAssignMeeting,
  onReopen,
  onDelete,
}: {
  row: ApplicationRow;
  busy: boolean;
  onAssignMeeting: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const rejected = row.statusCode === "Rejected";
  const assigned = Boolean(row.assignedToMeeting);
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button asChild size="sm" variant="outline">
        <Link
          to="/members/$applicationId"
          params={{ applicationId: String(row.applicationId) }}
          search={{ view: "manager" }}
        >
          Review
        </Link>
      </Button>
      <Button type="button" size="sm" disabled={busy || rejected} onClick={onAssignMeeting}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {assigned ? "Update meeting" : "Assign to meeting"}
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link
          to="/members/$applicationId"
          params={{ applicationId: String(row.applicationId) }}
          search={{ view: "manager", edit: true }}
        >
          <Pencil className="size-4" />
          Edit
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
        title="Delete"
        disabled={busy}
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
  onVerifyToggle?: () => void;
  onReview: () => void;
  onAuthorize: () => void;
  onElect: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const paymentBlocking = row.statusCode === "Endorsement" && row.stageAPaymentsReady === false;
  const interviewBlocking =
    row.statusCode === "EndorsementReview" && row.canAuthorizeToInterview === false;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {manager ? (
        <Button
          type="button"
          size="sm"
          variant={verifying ? "default" : "outline"}
          onClick={onVerifyToggle}
        >
          {verifying ? "Hide panel" : "Start verification"}
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
                  ? "Complete verification: documents, payment, sponsors and 3 club visits"
                  : row.statusCode === "EndorsementReview" && !isSponsorOk(row)
                    ? "Proposer and seconder must both endorse first"
                    : undefined
              }
            >
              {row.statusCode === "EndorsementReview" ? "Authorize to interview" : "Authorize next stage"}
              {interviewBlocking
                ? " (verification incomplete)"
                : row.statusCode === "EndorsementReview" && !isSponsorOk(row)
                  ? " (awaiting sponsors)"
                  : ""}
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
          <DropdownMenuItem disabled={busy} className="text-destructive focus:text-destructive" onClick={onReject}>
            Reject
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button asChild size="icon" variant="outline" className="size-8" title="Edit">
        <Link
          to="/members/$applicationId"
          params={{ applicationId: String(row.applicationId) }}
          search={{ edit: true }}
        >
          <Pencil className="size-4" />
        </Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 text-destructive"
        title="Delete"
        disabled={busy}
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
          <Button type="button" size="icon" variant="ghost" className="size-8" disabled={busy} title="Revoke / authorize">
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
          <DropdownMenuItem disabled={busy} className="text-destructive focus:text-destructive" onClick={onRevoke}>
            Revoke approval
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
