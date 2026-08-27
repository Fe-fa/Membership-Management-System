import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  CircleDashed,
  Eye,
  FileSearch,
  Inbox,
  Loader2,
  MapPin,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatDate } from "@/utils/format";
import { ageOn } from "@/services/membership/schema";
import { cn } from "@/utils/cn";
import { readUser } from "@/lib/auth";
import { displayApplicationStatus } from "@/services/admin/membershipDesk";
import { ApplicantStageChecklist } from "@/components/admin/ManagerStagePanel";

type ApplicationStatus =
  | "Draft"
  | "Submitted"
  | "UnderReview"
  | "Endorsement"
  | "EndorsementReview"
  | "Interview"
  | "InterviewReview"
  | "Waitlist"
  | "ElectionReview"
  | "Committee"
  | "CommitteeReview"
  | "Approved"
  | "Rejected"
  | "Withdrawn";

type ApplicationListItem = {
  applicationId: number;
  referenceNumber: string;
  applicationNo: string;
  applicantProfileId: number;
  applicantName: string;
  applicantCity?: string | null;
  applicantCountry?: string | null;
  applicantDateOfBirth?: string | null;
  applicantAgeYears?: number | null;
  statusCode: ApplicationStatus | string;
  statusName: string;
  membershipTypeName: string;
  membershipTypeBadge: string;
  appliedAt: string | null;
  updatedAt: string | null;
  sectionsCompleted: number;
  totalSections: number;
  entranceFeeAmount: number | null;
  annualSubscriptionAmount: number | null;
  excludedUntilDate?: string | null;
  applicantBallotLabel?: string | null;
};

const APPLICATIONS_KEY = (userId?: number | null) => ["applications", "me", userId ?? "anon"] as const;
const WITHDRAWN_STATUS_ID = 7;

const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  "Draft",
  "Submitted",
  "UnderReview",
  "Endorsement",
  "EndorsementReview",
  "Interview",
  "InterviewReview",
  "Waitlist",
  "ElectionReview",
  "Committee",
  "CommitteeReview",
  "Approved",
];
const FINAL_STATUSES: readonly ApplicationStatus[] = ["Rejected", "Withdrawn"];

type Bucket = {
  key: string;
  label: string;
  tints: string;
  matches: readonly ApplicationStatus[];
};

const BUCKETS: Bucket[] = [
  {
    key: "Active",
    label: "Active",
    tints: "border-border bg-card text-foreground",
    matches: ["Submitted"],
  },
  {
    key: "Endorsement",
    label: "Endorsement",
    tints: "border-amber-300 bg-amber-50 text-amber-700",
    matches: ["Endorsement", "EndorsementReview"],
  },
  {
    key: "Interview",
    label: "Interview",
    tints: "border-violet-300 bg-violet-50 text-violet-700",
    matches: ["Interview", "InterviewReview"],
  },
  {
    key: "Election",
    label: "Election",
    tints: "border-pink-300 bg-pink-50 text-pink-700",
    matches: ["Waitlist", "ElectionReview"],
  },
  {
    key: "Screening",
    label: "Screening",
    tints: "border-violet-200 bg-violet-50 text-violet-600",
    matches: ["UnderReview"],
  },
  {
    key: "Committee",
    label: "Committee signatures",
    tints: "border-emerald-300 bg-emerald-50 text-emerald-700",
    matches: ["Committee", "CommitteeReview"],
  },
  {
    key: "Final",
    label: "Fully approved",
    tints: "border-zinc-300 bg-zinc-100 text-zinc-700",
    matches: ["Approved", "Rejected", "Withdrawn"],
  },
];

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "Submitted", label: "Pre-requisites" },
  { value: "UnderReview", label: "Screening" },
  { value: "Endorsement", label: "Endorsement" },
  { value: "EndorsementReview", label: "Endorsement Review" },
  { value: "Interview", label: "Interview" },
  { value: "InterviewReview", label: "Interview Review" },
  { value: "Waitlist", label: "Waitlisted" },
  { value: "ElectionReview", label: "Election Review" },
  { value: "Committee", label: "Committee signatures" },
  { value: "CommitteeReview", label: "Committee Review" },
  { value: "Approved", label: "Fully approved" },
  { value: "Rejected", label: "Rejected" },
  { value: "Withdrawn", label: "Withdrawn" },
];

async function fetchApplications(): Promise<ApplicationListItem[]> {
  return apiRequest<ApplicationListItem[]>("/api/applications/me");
}

function normalizeStatusCode(statusCode?: string | null): ApplicationStatus | null {
  const normalized = (statusCode ?? "").replace(/[^a-z]/gi, "").toUpperCase();
  switch (normalized) {
    case "DRAFT":
      return "Draft";
    case "SUBMITTED":
      return "Submitted";
    case "UNDERREVIEW":
      return "UnderReview";
    case "ENDORSEMENT":
      return "Endorsement";
    case "ENDORSEMENTREVIEW":
      return "EndorsementReview";
    case "INTERVIEW":
      return "Interview";
    case "INTERVIEWREVIEW":
      return "InterviewReview";
    case "WAITLIST":
    case "ELECTION":
      return "Waitlist";
    case "ELECTIONREVIEW":
      return "ElectionReview";
    case "COMMITTEE":
      return "Committee";
    case "COMMITTEEREVIEW":
      return "CommitteeReview";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "WITHDRAWN":
    case "EXCLUDED":
      return "Withdrawn";
    default:
      return null;
  }
}

function isActiveStatus(statusCode?: string | null) {
  const normalized = normalizeStatusCode(statusCode);
  return normalized ? ACTIVE_STATUSES.includes(normalized) : false;
}

function matchesBucket(bucket: Bucket, app: ApplicationListItem) {
  const normalized = normalizeStatusCode(app.statusCode);
  return normalized ? bucket.matches.includes(normalized) : false;
}

function ageString(dob?: string | null, ageYears?: number | null) {
  if (typeof ageYears === "number" && Number.isFinite(ageYears) && ageYears >= 0) {
    return `${ageYears} yrs`;
  }
  const age = ageOn(dob ?? undefined);
  return age !== null && age >= 0 ? `${age} yrs` : "—";
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const userId = readUser()?.userAccountId ?? null;
  const listKey = APPLICATIONS_KEY(userId);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: listKey,
    queryFn: fetchApplications,
    staleTime: 30_000,
    enabled: userId != null,
  });

  const myApps = useMemo(() => data ?? [], [data]);

  const [tab, setTab] = useState<"active" | "archive">("active");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<ApplicationListItem | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const search = useDebounced(searchInput, 250);

  const withdrawMutation = useMutation({
    mutationFn: async (app: ApplicationListItem) =>
      apiRequest(`/api/applications/${app.applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          toStatusId: WITHDRAWN_STATUS_ID,
          reason: "Application withdrawn by applicant.",
        }),
      }),
    onMutate: async (app) => {
      setWithdrawError(null);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ApplicationListItem[]>(listKey);
      queryClient.setQueryData<ApplicationListItem[]>(listKey, (current = []) =>
        current.map((item) =>
          item.applicationId === app.applicationId
            ? {
                ...item,
                statusCode: "Withdrawn",
                statusName: "Withdrawn",
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      return { previous };
    },
    onError: (err, _app, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
      setWithdrawError(extractErrorMessage(err));
    },
    onSuccess: () => {
      toast.success("Application withdrawn", {
        description: "The application has been moved to Archive.",
      });
      setWithdrawTarget(null);
      setWithdrawError(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const activeCount = useMemo(
    () => myApps.filter((a) => isActiveStatus(a.statusCode)).length,
    [myApps],
  );
  const archiveCount = myApps.length - activeCount;

  const bucketCounts = useMemo(
    () => Object.fromEntries(BUCKETS.map((bucket) => [bucket.key, myApps.filter((a) => matchesBucket(bucket, a)).length])),
    [myApps],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return myApps.filter((a) => {
      const isActive = isActiveStatus(a.statusCode);
      const normalizedStatus = normalizeStatusCode(a.statusCode);
      if (tab === "active" && !isActive) return false;
      if (tab === "archive" && isActive) return false;
      if (statusFilter !== "all" && normalizedStatus !== statusFilter) return false;
      if (needle) {
        const haystack = [
          a.applicantName,
          a.referenceNumber,
          a.applicationNo,
          a.membershipTypeName,
          a.membershipTypeBadge,
          a.statusName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [myApps, search, statusFilter, tab]);

  useEffect(() => {
    if (!selectedId || !visible.some((a) => a.applicationId === selectedId)) {
      setSelectedId(visible[0]?.applicationId ?? null);
    }
  }, [selectedId, visible]);

  const selected = useMemo(
    () => visible.find((a) => a.applicationId === selectedId) ?? visible[0] ?? null,
    [selectedId, visible],
  );

  return (
    <PageFrame>
      <PageBackLink to="/" label="Back to dashboard" />
      <PageHeader
        title="My Applications"
        description="Track and manage your membership applications"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : <CircleDashed className="size-4" />}
            Refresh
          </Button>
        }
      />

      <section aria-label="Application status overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {BUCKETS.map((bucket) => {
          const count = bucketCounts[bucket.key] ?? 0;
          const selectedMatches = selected ? matchesBucket(bucket, selected) : false;
          return (
            <div
              key={bucket.key}
              className={cn(
                "rounded-xl border px-4 py-3 transition-shadow",
                bucket.tints,
                selectedMatches && "ring-2 ring-primary/40 shadow-sm",
              )}
            >
              <p className="text-2xl font-semibold leading-none">{count}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide opacity-80">{bucket.label}</p>
            </div>
          );
        })}
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Application list scope" className="inline-flex rounded-md border border-border bg-card p-0.5 text-sm">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "active"}
            onClick={() => setTab("active")}
            className={cn(
              "rounded-md px-3 py-1.5 transition",
              tab === "active"
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "archive"}
            onClick={() => setTab("archive")}
            className={cn(
              "rounded-md px-3 py-1.5 transition",
              tab === "archive"
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Archive ({archiveCount})
          </button>
        </div>

        <div className="flex flex-1 items-center gap-2 sm:max-w-md sm:justify-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, reference, or membership type…"
              className="h-10 pl-9"
              aria-label="Search applications"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | "all")}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="mt-5" aria-live="polite">
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> Loading your applications…
            </CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-8 text-sm text-rose-600">
              <AlertCircle className="size-5" />
              {error instanceof Error ? error.message : "Couldn't load your applications."}
            </CardContent>
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-sm text-muted-foreground">
              <Inbox className="size-6" />
              <p>No applications match the current filter.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setStatusFilter("all");
                  setTab("active");
                }}
              >
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visible.map((app) => (
              <ApplicationCard
                key={app.applicationId}
                app={app}
                selected={app.applicationId === selectedId}
                onSelect={() => setSelectedId(app.applicationId)}
                onWithdrawRequest={(target) => {
                  setWithdrawError(null);
                  setWithdrawTarget(target);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(withdrawTarget)}
        onOpenChange={(open) => {
          if (!open && !withdrawMutation.isPending) {
            setWithdrawTarget(null);
            setWithdrawError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw application</DialogTitle>
            <DialogDescription>
              Are you sure you want to withdraw this application?
            </DialogDescription>
          </DialogHeader>

          {withdrawTarget && (
            <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{withdrawTarget.membershipTypeName || "Membership application"}</p>
              <p className="mt-1">Reference {withdrawTarget.referenceNumber}</p>
            </div>
          )}

          {withdrawError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{withdrawError}</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setWithdrawTarget(null);
                setWithdrawError(null);
              }}
              disabled={withdrawMutation.isPending}
            >
              No, keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (withdrawTarget) {
                  withdrawMutation.mutate(withdrawTarget);
                }
              }}
              disabled={withdrawMutation.isPending}
            >
              {withdrawMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              Yes, withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

function ApplicationCard({
  app,
  selected,
  onSelect,
  onWithdrawRequest,
}: {
  app: ApplicationListItem;
  selected: boolean;
  onSelect: () => void;
  onWithdrawRequest: (app: ApplicationListItem) => void;
}) {
  const statusLabel = app.applicantBallotLabel || displayApplicationStatus(app.statusCode, app.statusName);

  return (
    <Card
      className={cn(
        "cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected && "ring-2 ring-primary/40",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Briefcase className="size-7" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">
              {app.membershipTypeName || "Membership application"}
            </h2>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{app.applicantName || "Applicant"}</span>
              {(app.applicantCity || app.applicantCountry) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {[app.applicantCity, app.applicantCountry].filter(Boolean).join(", ")}
                </span>
              )}
              {app.membershipTypeBadge && (
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-medium text-foreground">
                  <BadgeCheck className="size-3.5" />
                  {app.membershipTypeBadge}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" /> Age {ageString(app.applicantDateOfBirth, app.applicantAgeYears)}
              </span>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Reference{" "}
              <span className="font-mono text-foreground">{app.referenceNumber}</span>
            </p>
            <div className="mt-3 max-w-md space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((app.sectionsCompleted ?? 0) / Math.max(app.totalSections || 7, 1)) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {app.sectionsCompleted}/{app.totalSections} complete (
                {Math.min(
                  100,
                  Math.round(
                    ((app.sectionsCompleted ?? 0) / Math.max(app.totalSections || 7, 1)) * 100,
                  ),
                )}
                %)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium",
              app.statusCode === "Endorsement" || app.statusCode === "EndorsementReview"
                ? "bg-amber-100 text-amber-900"
                : "bg-slate-100 text-slate-700",
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {statusLabel}
          </span>
        </div>
      </div>

      {(app.statusCode === "Endorsement" ||
        app.statusCode === "EndorsementReview" ||
        app.statusCode === "Submitted" ||
        app.statusCode === "UnderReview" ||
        app.statusCode === "Interview") && (
        <div className="border-t border-border px-5 py-3" onClick={(e) => e.stopPropagation()}>
          <ApplicantStageChecklist applicationId={app.applicationId} statusCode={app.statusCode} compact />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-0.5 border-t border-border px-5 py-3">
        <Button asChild size="icon" variant="ghost" className="size-8" title="View details">
          <Link to="/documents" onClick={(e) => e.stopPropagation()}>
            <Eye className="size-4" />
          </Link>
        </Button>
        <Button asChild size="icon" variant="ghost" className="size-8" title="Resume application">
          <Link to="/application" onClick={(e) => e.stopPropagation()}>
            <FileSearch className="size-4" />
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          title="Withdraw application"
          onClick={(e) => {
            e.stopPropagation();
            onWithdrawRequest(app);
          }}
          disabled={!isActiveStatus(app.statusCode)}
        >
          <X className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
