import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  ArrowRight,
  BedDouble,
  Bell,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileText,
  Landmark,
  Plane,
  Settings,
  UserRound,
  Users,
  Vote,
} from "lucide-react";

import heroImage from "@/assets/acea-hero.jpg";
import { AdminPortalCard } from "@/components/card/AdminPortalCard";
import { ActionCard } from "@/components/card/ActionCard";
import { PageFrame } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { apiRequest, fetchApplication } from "@/services/membership/api";
import { applicationQueryKey, validateSection } from "@/services/membership/useApplication";
import { isClubMember, isAuthenticated, readPortalMode, readUser } from "@/lib/auth";
import { formatKes } from "@/utils/format";
import { FEES, ageOn, emptyDraft, type MembershipType } from "@/services/membership/schema";
import { STEPS, type StepId } from "@/services/membership/steps";
import { useMemberDashboard, fallbackMemberDashboard, type MemberDashboard } from "@/services/member/dashboard";
import { ApplicantStageChecklist } from "@/components/admin/ManagerStagePanel";

const STATUS_COPY: Record<string, string> = {
  Draft: "Draft — not yet submitted",
  Submitted: "Active — waiting for admin review",
  UnderReview: "Under review — screening",
  Endorsement: "Endorsement — proposer and seconder",
  EndorsementReview: "With manager — Stage A review",
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
    return <MemberHome me={member.data ?? fallbackMemberDashboard(user)} />;
  }
  return <ApplicantHome />;
}

function MemberHome({ me }: { me: MemberDashboard }) {
  const cards = [
    // {
    //   id: "profile",
    //   title: "My Profile",
    //   description: "Personal details, family records and digital membership card.",
    //   to: "/profile",
    //   icon: UserRound,
    //   tone: "amber" as const,
    //   locked: !me.cards.profile,
    // },
    {
      id: "subscriptions",
      title: "Subscriptions & Payments",
      description: "Annual dues, M-Pesa / card / bank receipts and standing.",
      to: "/payment",
      icon: CreditCard,
      tone: "sky" as const,
      locked: !me.cards.subscriptions,
    },
    {
      id: "guests",
      title: "Guests & Reciprocation",
      description: "Guest book and reciprocal-club visits.",
      to: "/guests",
      icon: Users,
      tone: "rose" as const,
      locked: !me.cards.guests,
    },
    {
      id: "committee",
      title: "Committee",
      description: "Sitting committee, officers and next meeting.",
      to: "/governance",
      icon: Landmark,
      tone: "violet" as const,
      locked: !me.cards.committee,
    },
    {
      id: "election",
      title: "Election",
      description: "AGM notices, votes, proxies and nominations.",
      to: "/election",
      icon: Vote,
      tone: "violet" as const,
      locked: !me.cards.election,
    },
    {
      id: "committee-ballot",
      title: "Committee Ballot",
      description: "Membership admission ballot per candidate (Article 6).",
      to: "/committee-ballot/attendance",
      icon: ClipboardList,
      tone: "violet" as const,
      locked: !me.cards.committeeBallot,
    },
    {
      id: "accommodation",
      title: "Accommodation",
      description: "Room bookings and Clubhouse facility rules.",
      to: "/accommodation",
      icon: BedDouble,
      tone: "emerald" as const,
      locked: !me.cards.accommodation,
    },
    {
      id: "endorsements",
      title: "Endorsements",
      description:
        me.pendingEndorsements > 0
          ? `${me.pendingEndorsements} endorsement request${me.pendingEndorsements === 1 ? "" : "s"} waiting for you.`
          : "Complete endorsements named against you.",
      to: "/endorsements",
      icon: Bell,
      tone: "rose" as const,
      locked: !me.cards.endorsements,
      badgeCount: me.pendingEndorsements,
    },
    {
      id: "documents",
      title: "Notifications & Documents",
      description: "Circulars, receipts, privacy policy and consent.",
      to: "/documents",
      icon: FileText,
      tone: "slate" as const,
      locked: !me.cards.documents,
    },
    {
      id: "settings",
      title: "Settings",
      description: "Account, privacy, appearance, and scheduled actions.",
      to: "/settings",
      icon: Settings,
      tone: "slate" as const,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl">
        <img
          src={heroImage}
          alt=""
          width={1600}
          height={900}
          className="h-48 w-full object-cover sm:h-56 lg:h-64"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary/40 to-transparent" />
        <h1 className="absolute inset-0 flex items-center px-6 font-sans text-2xl font-semibold tracking-tight text-white sm:px-8 sm:text-3xl">
          Member dashboard
        </h1>
      </section>
      {/* {me.pendingEndorsements > 0 ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
          You have {me.pendingEndorsements} endorsement request
          {me.pendingEndorsements === 1 ? "" : "s"} to complete.{" "}
          <Link to="/endorsements" className="font-medium underline underline-offset-2">
            Open
          </Link>
        </p>
      ) : null} */}
      {me.childrenRequiringOwnMembership > 0 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {me.childrenRequiringOwnMembership} child record(s) are 21 or over and should take out their own
          membership (Bye-Laws).
        </p>
      ) : null}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards
          .filter((card) => !(card.id === "committee-ballot" && card.locked))
          .map((card) => (
          <AdminPortalCard
            key={card.id}
            title={card.title}
            description={card.description}
            icon={card.icon}
            to={card.to}
            tone={card.tone}
            locked={card.locked}
            badgeCount={"badgeCount" in card ? card.badgeCount : undefined}
          />
        ))}
      </section>
    </div>
  );
}

function ApplicantHome() {
  const user = readUser();
  const { data: record } = useQuery({
    queryKey: applicationQueryKey(user?.userAccountId),
    queryFn: fetchApplication,
    staleTime: 30_000,
    enabled: Boolean(user?.userAccountId),
  });

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

  const { data: notifications = [] } = useQuery({
    queryKey: ["member-notifications", readUser()?.profileId],
    queryFn: () =>
      apiRequest<
        Array<{
          notificationId: number;
          typeCode: string;
          title: string;
          body: string;
          createdAtUtc: string;
          isRead: boolean;
          relatedEntityType?: string | null;
          relatedEntityId?: number | null;
        }>
      >("/api/members/me/notifications"),
    staleTime: 15_000,
    enabled: Boolean(readUser()?.profileId),
  });

  const status = record?.status ?? "Draft";
  const meetingNotice = notifications.find(
    (n) =>
      (n.typeCode === "MEETING_LINK" || n.typeCode === "INTERVIEW_MEETING") &&
      n.relatedEntityType === "APPLICATION" &&
      meetingNoticeStillActive(n, status),
  );
  const managerRequest = notifications.find(
    (n) =>
      [
        "MANAGER_PAYMENT_REQUEST",
        "MANAGER_DOCUMENT_REQUEST",
        "MANAGER_DETAILS_REQUEST",
        "MANAGER_ENDORSEMENT_REQUEST",
        "APPLICATION_PAYMENT_REQUIRED",
        "APPLICATION_PENDING_ITEMS",
      ].includes(n.typeCode) && managerRequestStillActive(n, status, record?.updatedAt),
  );
  const electionNotice = notifications.find(
    (n) =>
      /ELECTION|BALLOT|AGM|EGM/i.test(n.typeCode) &&
      !["Committee", "CommitteeReview", "Approved", "NotElected", "Rejected", "TemporaryMember"].includes(
        status,
      ),
  );
  const rejectionNotice = notifications.find((n) => n.typeCode === "APPLICATION_REJECTED");

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

  const membershipType = draft.membership.membershipType as MembershipType | undefined;
  const age = ageOn(draft.personal.dateOfBirth);
  const feePlan = membershipType ? FEES[membershipType] : null;
  const estimatedDue = feePlan
    ? (age !== null && age < 30 ? feePlan.joiningUnder30 : feePlan.joining) + feePlan.annual
    : 0;
  const ballotLabel = mine.data?.[0]?.applicantBallotLabel;
  const rejectionReason = mine.data?.[0]?.lastRejectionReason;
  const statusDisplay = ballotLabel || STATUS_COPY[status] || status;

  return (
    <PageFrame>
      <section className="relative overflow-hidden rounded-3xl bg-hero text-primary-foreground">
        <img
          src={heroImage}
          alt="Light aircraft on an East African airstrip at sunset"
          width={1600}
          height={900}
          className="absolute inset-0 size-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/75 to-primary/20" />

        <div className="relative grid gap-8 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-accent">
              <Plane className="size-4" /> Aero Club of East Africa
            </p>
            <h1 className="mt-3 max-w-2xl text-3xl leading-tight sm:text-5xl">
              Membership application
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-primary-foreground/85 sm:text-base">
              Track your application progress, review uploaded documents, and manage payment from one
              place. After election, this home becomes your Member dashboard.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-7">
              <Link to="/application">
                {record?.id && status !== "Draft"
                  ? "Update application"
                  : record?.id
                    ? "Continue application"
                    : "Start application"}{" "}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5 backdrop-blur-sm sm:grid-cols-2 lg:min-w-[280px] lg:grid-cols-1">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/70">
                Application status
              </p>
              <p className="mt-1 text-sm font-medium">{statusDisplay}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/70">
                Estimated dues
              </p>
              <p className="mt-1 text-sm font-medium">
                {membershipType ? formatKes(estimatedDue) : "Select a membership type"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {status === "Rejected" || rejectionNotice ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-950">
          <p className="text-sm font-semibold">Your application was not approved</p>
          <p className="mt-1 text-sm whitespace-pre-line">
            {rejectionReason || rejectionNotice?.body || "The manager rejected this application."}
          </p>
        </section>
      ) : null}

      {record?.id &&
      !["Waitlist", "ElectionReview", "TemporaryMember", "Committee", "CommitteeReview", "NotElected", "Rejected"].includes(
        status,
      ) ? (
        <ApplicantStageChecklist applicationId={record.id} statusCode={status} />
      ) : null}

      {managerRequest && status !== "Rejected" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
          <p className="text-sm font-semibold">{managerRequest.title}</p>
          <p className="mt-1 text-sm whitespace-pre-line">{managerRequest.body}</p>
          <Button asChild size="sm" className="mt-3">
            <Link to={managerRequest.typeCode === "MANAGER_PAYMENT_REQUEST" ? "/payment" : managerRequest.typeCode === "MANAGER_DOCUMENT_REQUEST" ? "/documents" : "/application"}>
              {managerRequest.typeCode === "MANAGER_PAYMENT_REQUEST"
                ? "Open payment"
                : managerRequest.typeCode === "MANAGER_DOCUMENT_REQUEST"
                  ? "Open documents"
                  : "Update this application"}
            </Link>
          </Button>
        </section>
      ) : null}

      {meetingNotice ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sky-950">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              <Bell className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{meetingNotice.title}</p>
              <p className="mt-1 text-sm text-sky-900/85 whitespace-pre-line">{meetingNotice.body}</p>
              <p className="mt-2 text-xs text-sky-800/70">
                {new Date(meetingNotice.createdAtUtc).toLocaleString()}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {electionNotice ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sky-950">
          <p className="text-sm font-semibold">{electionNotice.title}</p>
          <p className="mt-1 text-sm whitespace-pre-line">{electionNotice.body}</p>
        </section>
      ) : null}

      <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          featured
          outline={false}
          icon={<ClipboardList className="size-5" />}
          badge={`${doneCount}/${sections.length} complete`}
          title="My Application"
          description="Open the tracker to view your progress, uploaded documents, application flow, and next steps."
          progress={{ label: "Progress", value: overallPercent }}
          href="/applications"
          cta="Open Application"
        />
        <ActionCard
          icon={<CreditCard className="size-5" />}
          badge={membershipType ? formatKes(estimatedDue) : "Pending type"}
          title="Payment"
          description="See joining fee, annual subscription, outstanding balance, and payment history."
          href="/payment"
          cta="Open payment"
        />
        <ActionCard
          icon={<FileCheck2 className="size-5" />}
          badge={`${uploadedDocuments}/${requiredDocuments} docs`}
          title="Documents & History"
          description="Review your uploaded files and follow each stage of the application process."
          progress={{ label: "Documents uploaded", value: documentPercent }}
          href="/documents"
          cta="View Application"
        />
        <ActionCard
          icon={<Settings className="size-5" />}
          badge="Account"
          title="Settings"
          description="Account and profile, privacy, appearance, and scheduled actions."
          href="/settings"
          cta="Open settings"
        />
      </section>
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
