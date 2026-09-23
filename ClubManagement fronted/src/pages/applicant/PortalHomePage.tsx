import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  ArrowRight,
  ClipboardList,
  CreditCard,
  FileCheck2,
  Settings,
  UserRound,
} from "lucide-react";

import { PageFrame } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MemberHomePage } from "@/pages/member/MemberHomePage";
import { apiRequest, API_BASE, fetchApplication } from "@/services/membership/api";
import { applicationQueryKey, validateSection } from "@/services/membership/useApplication";
import { isClubMember, isAuthenticated, readPortalMode, readUser } from "@/lib/auth";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";
import { emptyDraft } from "@/services/membership/schema";
import { STEPS, type StepId } from "@/services/membership/steps";
import { useMemberDashboard, fallbackMemberDashboard } from "@/services/member/dashboard";
import { useApplicationDues } from "@/components/payments";

const STATUS_COPY: Record<string, string> = {
  Draft: "Draft",
  Submitted: "Active",
  UnderReview: "Under review",
  Endorsement: "Endorsement",
  EndorsementReview: "With manager",
  Interview: "Interview stage",
  InterviewReview: "Interview under review",
  TemporaryMember: "Ballot in progress",
  Waitlist: "Ballot in progress",
  ElectionReview: "Ballot in progress",
  Committee: "Approved — pending signatures",
  CommitteeReview: "Approved — pending signatures",
  Approved: "Final decision — approved",
  Rejected: "Not approved",
  NotElected: "Rejected — you may reapply later per the rules",
  Withdrawn: "Withdrawn",
};

const STEP_BLURB: Record<Exclude<StepId, "review">, string> = {
  personal: "Identity, residence and contact record",
  family: "Marital status, dependents and emergency contact",
  aviation: "Affiliation, licence and aircraft details",
  membership: "Choose Full, Country or Overseas",
  supporters: "Proposer and seconder endorsements",
  clubs: "Other club memberships",
  consent: "Declaration and data consent",
};

function mediaUrl(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

/** Portal entry: applicants see overview here; members are routed to the member dashboard. */
export function PortalHomePage() {
  const navigate = useNavigate();
  const user = readUser();
  const mode = readPortalMode(user);
  const member = useMemberDashboard();

  useEffect(() => {
    if (!isAuthenticated()) {
      void navigate({ to: "/" });
      return;
    }
    if (mode === "admin") {
      void navigate({ to: "/admin" });
    }
  }, [mode, navigate]);

  if (!isAuthenticated() || !user) return null;
  if (mode === "admin") return null;

  if (mode === "member" || (isClubMember(user) && mode !== "applicant")) {
    if (member.isLoading) {
      return (
        <PageFrame width="lg">
          <PageBodyLoading label="Loading your portal…" />
        </PageFrame>
      );
    }
    return <MemberHomePage me={member.data ?? fallbackMemberDashboard(user)} />;
  }
  return <ApplicantHome />;
}

function ApplicantHome() {
  const user = readUser();
  const application = useQuery({
    queryKey: applicationQueryKey(user?.userAccountId),
    queryFn: fetchApplication,
    staleTime: 30_000,
    enabled: Boolean(user?.userAccountId),
  });
  const record = application.data;
  const applicationId = Number(record?.id || 0);
  const dues = useApplicationDues(applicationId);

  const mine = useQuery({
    queryKey: ["applications", "me", user?.userAccountId],
    queryFn: () =>
      apiRequest<
        Array<{
          statusCode: string;
          applicantBallotLabel?: string | null;
          lastRejectionReason?: string | null;
          assignedToMeeting?: boolean | null;
          committeeMeetingId?: number | null;
        }>
      >("/api/applications/me"),
    staleTime: 15_000,
    enabled: Boolean(user?.userAccountId),
  });

  if (application.isLoading || mine.isLoading || (applicationId > 0 && dues.isLoading)) {
    return (
      <PageFrame width="lg">
        <PageBodyLoading label="Loading your application…" />
      </PageFrame>
    );
  }

  const status = record?.status ?? "Draft";

  const draft = { ...emptyDraft(), ...record?.draft };
  const completed = record?.completedSteps ?? [];

  const sections = STEPS.filter((step) => step.key !== "review").map((step) => {
    const key = step.key as Exclude<StepId, "review">;
    return {
      ...step,
      done: completed.includes(key) && Object.keys(validateSection(key, draft[key])).length === 0,
    };
  });

  const doneCount = sections.filter((section) => section.done).length;
  const overallPercent = (doneCount / Math.max(sections.length, 1)) * 100;

  const uploadedDocuments = [
    draft.personal.photo,
    draft.personal.cv,
    draft.personal.idPassport,
    draft.aviation.holdsLicense ? draft.aviation.licenseFile : null,
  ].filter(Boolean).length;

  const requiredDocuments = 3 + (draft.aviation.holdsLicense ? 1 : 0);
  const documentPercent = (uploadedDocuments / Math.max(requiredDocuments, 1)) * 100;

  const membershipType = draft.membership.membershipType;
  const joiningInvoiced = Boolean(dues.data?.joiningInvoiced);
  const annualInvoiced = Boolean(dues.data?.annualInvoiced);
  const feeInvoiced = joiningInvoiced || annualInvoiced;
  const joiningDue = joiningInvoiced ? Number(dues.data?.joiningBalance || 0) : 0;
  const annualDue = annualInvoiced ? Number(dues.data?.annualBalance || 0) : 0;
  const estimatedDue = joiningDue + annualDue;
  const ballotLabel = mine.data?.[0]?.applicantBallotLabel;
  const statusDisplay = ballotLabel || STATUS_COPY[status] || status;

  const displayName =
    [draft.personal.firstName, draft.personal.middleName, draft.personal.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    user?.fullName ||
    "Applicant";
  const contactLine = [
    draft.personal.email || user?.email,
    [draft.personal.telPrefix, draft.personal.mobile].filter(Boolean).join(" ").trim() || null,
    [draft.personal.city, draft.personal.country].filter(Boolean).join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const photo = mediaUrl(draft.personal.photo?.url);
  const nextStep = sections.find((section) => !section.done);
  const continueLabel =
    record?.id && status !== "Draft"
      ? "Update application"
      : record?.id
        ? "Continue application"
        : "Start application";

  const docRows = [
    {
      key: "id",
      label: "ID / Passport",
      hint: draft.personal.idPassport ? "Uploaded" : "Required — not uploaded",
      tag: "ID",
      done: Boolean(draft.personal.idPassport),
    },
    {
      key: "cv",
      label: "CV",
      hint: draft.personal.cv ? "Uploaded" : "Required — not uploaded",
      tag: "CV",
      done: Boolean(draft.personal.cv),
    },
    {
      key: "photo",
      label: "Passport photo",
      hint: draft.personal.photo ? "Uploaded" : "Required — not uploaded",
      tag: "PHOTO",
      done: Boolean(draft.personal.photo),
    },
    ...(draft.aviation.holdsLicense
      ? [
          {
            key: "license",
            label: "Pilot licence",
            hint: draft.aviation.licenseFile ? "Uploaded" : "Optional — not uploaded",
            tag: "LIC",
            done: Boolean(draft.aviation.licenseFile),
          },
        ]
      : []),
  ];

  return (
    <PageFrame width="lg" className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Membership application
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {status === "Draft" ? "Draft status" : "Application status"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {statusDisplay}
            {" · "}
            {doneCount} of {sections.length} steps
          </p>
        </div>
      </header>

      <Card className="overflow-hidden shadow-sm">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-secondary sm:size-20">
              {photo ? (
                <img src={photo} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <UserRound className="size-8" />
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{displayName}</h2>
              {contactLine ? (
                <p className="text-sm text-muted-foreground">{contactLine}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Add contact details in your application.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  Member type · {membershipType || "Pending selection"}
                </Badge>
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                  {feeInvoiced ? `Dues · ${formatKes(estimatedDue)}` : "Waiting for invoice"}
                </Badge>
              </div>
            </div>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to="/application">
              {continueLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-xl tracking-tight">Application progress</CardTitle>
              <CardDescription className="mt-1">
                {doneCount} / {sections.length} steps
              </CardDescription>
            </div>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {Math.round(overallPercent)}%
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={overallPercent} className="h-2" />
            <ol className="divide-y divide-border rounded-xl border border-border">
              {sections.map((section, index) => {
                const isNext = nextStep?.key === section.key;
                return (
                  <li key={section.key} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        section.done
                          ? "bg-primary text-primary-foreground"
                          : isNext
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{section.title}</p>
                        <span
                          className={cn(
                            "shrink-0 text-xs font-medium",
                            section.done
                              ? "text-primary"
                              : isNext
                                ? "text-emerald-700"
                                : "text-muted-foreground",
                          )}
                        >
                          {section.done ? "Done" : isNext ? "Next up" : "Pending"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {STEP_BLURB[section.key as Exclude<StepId, "review">]}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link to="/applications">
                <ClipboardList className="size-4" />
                Open application status
              </Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
              <CardTitle className="text-xl tracking-tight">Payment</CardTitle>
              <Badge variant="secondary">{feeInvoiced ? "Invoice issued" : "Waiting for invoice"}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {feeInvoiced ? (
                <>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">{formatKes(estimatedDue)}</p>
                    <p className="text-sm text-muted-foreground">Balance due</p>
                  </div>
                  <dl className="space-y-2 text-sm">
                    {joiningInvoiced ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Joining fee</dt>
                        <dd className="font-medium">{formatKes(joiningDue)}</dd>
                      </div>
                    ) : null}
                    {annualInvoiced ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Annual subscription</dt>
                        <dd className="font-medium">{formatKes(annualDue)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3 border-t border-border pt-2">
                      <dt className="font-medium">Balance due</dt>
                      <dd className="font-semibold">{formatKes(estimatedDue)}</dd>
                    </div>
                  </dl>
                  <Button asChild className="w-full">
                    <Link to="/payment">
                      <CreditCard className="size-4" />
                      Make a payment
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Fees stay hidden until the manager or the finance desk issues an invoice for the entrance fee or annual subscription.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
              <div>
                <CardTitle className="text-xl tracking-tight">Documents</CardTitle>
                <CardDescription className="mt-1">
                  {uploadedDocuments} / {requiredDocuments} uploaded
                </CardDescription>
              </div>
              <FileCheck2 className="size-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={documentPercent} className="h-2" />
              <ul className="space-y-2">
                {docRows.map((doc) => (
                  <li
                    key={doc.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{doc.label}</p>
                      <p className="text-xs text-muted-foreground">{doc.hint}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide",
                        doc.done
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {doc.tag}
                    </span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="w-full">
                <Link to="/documents">View documents</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Settings className="size-5" />
            </span>
            <div>
              <h3 className="text-xl tracking-tight">Settings</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Account and profile, privacy, appearance, and scheduled actions.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to="/settings">Open settings</Link>
          </Button>
        </CardContent>
      </Card>
    </PageFrame>
  );
}

type HomeNotice = {
  typeCode: string;
  title: string;
  createdAtUtc: string;
};

function managerRequestStillActive(n: HomeNotice, status: string, updatedAt?: string | null) {
  if (
    [
      "Interview",
      "InterviewReview",
      "Waitlist",
      "ElectionReview",
      "TemporaryMember",
      "Committee",
      "CommitteeReview",
      "Approved",
      "NotElected",
      "Rejected",
    ].includes(status)
  ) {
    return false;
  }
  if (updatedAt && new Date(updatedAt).getTime() > new Date(n.createdAtUtc).getTime()) {
    return false;
  }
  return true;
}

function meetingNoticeStillActive(n: HomeNotice, status: string) {
  if (
    [
      "InterviewReview",
      "Waitlist",
      "ElectionReview",
      "TemporaryMember",
      "Committee",
      "CommitteeReview",
      "Approved",
      "NotElected",
      "Rejected",
    ].includes(status)
  ) {
    return false;
  }
  const stamp = n.title.match(/(\d{1,2} \w{3} \d{4}) at (\d{1,2}:\d{2})/i);
  if (stamp) {
    const when = Date.parse(`${stamp[1]} ${stamp[2]}`);
    if (!Number.isNaN(when) && Date.now() >= when) return false;
  }
  return true;
}
