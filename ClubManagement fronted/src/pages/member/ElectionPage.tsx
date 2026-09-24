import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardList,
  CloudUpload,
  FileText,
  Gavel,
  Lock,
  MapPin,
  Paperclip,
  ScrollText,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isStaff, readUser } from "@/lib/auth";
import { useMemberDashboard } from "@/services/member/dashboard";
import { apiRequest, extractErrorMessage, uploadFile } from "@/services/membership/api";
import { cn } from "@/utils/cn";
import { KENYA_TIME_ZONE } from "@/utils/kenyaDate";

type Notice = {
  generalMeetingId: number;
  meetingType: string;
  meetingDate: string;
  noticeSentDate?: string | null;
  agenda?: string | null;
  papersUrl?: string | null;
  venue?: string | null;
  noticePeriodDetail: string;
  noticePeriodMet: boolean;
  requiredClearDays: number;
  actualClearDays: number;
};

type BallotItem = {
  agendaItemId: number;
  subject: string;
  resolutionText?: string | null;
  isSpecialBusiness: boolean;
  myVoteValue?: string | null;
  receiptNumber?: string | null;
  castAt?: string | null;
};

type Nomination = {
  electionNominationId: number;
  nomineeName: string;
  nomineeMembershipNo?: string | null;
  proposerName: string;
  seconderName: string;
  roleStandingFor: string;
  photoUrl?: string | null;
  occupation?: string | null;
  company?: string | null;
};

type ProxyHeld = {
  proxyId: number;
  generalMeetingId: number;
  meetingType: string;
  meetingDate: string;
  venue?: string | null;
  appointingName: string;
  appointingMembershipNo?: string | null;
  voteInstruction?: string | null;
  leaveToDiscretion?: boolean;
  instructionLabel: string;
  reviewStatus?: string | null;
  proxyDeadlineAt?: string | null;
  instrumentReceivedAt?: string | null;
  resolutions: string[];
};

type MemberHit = {
  profileId: number;
  name: string;
  membershipNo?: string | null;
  classCode: string;
  continuousYears: number;
  eligibleToNominate: boolean;
};

type Mine = {
  canVote: boolean;
  subscriptionsPaidUp: boolean;
  eligibleToVote: boolean;
  memberName: string;
  membershipNo?: string | null;
  postalAddress?: string | null;
  noVoteReason?: string | null;
  notice?: Notice | null;
  ballotWindowOpen: boolean;
  ballotOpensAt?: string | null;
  ballotClosesAt?: string | null;
  proxyDeadlineAt?: string | null;
  pollProxyDeadlineAt?: string | null;
  ballotItems: BallotItem[];
  nominations: Nomination[];
  proxiesHeld?: ProxyHeld[];
  proxy?: {
    proxyProfileId?: number | null;
    linkedMember?: boolean;
    proxyTitle?: string | null;
    proxyName?: string | null;
    alternateTitle?: string | null;
    alternateName?: string | null;
    voteInstruction?: string | null;
    leaveToDiscretion?: boolean;
    appointingName?: string | null;
    appointingPoBox?: string | null;
    proxyMembershipNo?: string | null;
    notes?: string | null;
    signedFormUrl?: string | null;
    instrumentReceivedAt?: string | null;
    depositedOnTime?: boolean;
    reviewStatus?: string | null;
    reviewReason?: string | null;
  } | null;
  resultDeclaredAt?: string | null;
  quorumMet?: boolean;
  uniqueVoters?: number;
  eligibleVoters?: number;
  quorumRequired?: number;
  publishedResults?: PublishedResult[];
};

type PublishedResult = {
  agendaItemId: number;
  subject: string;
  isSpecialBusiness: boolean;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  votesCast: number;
};

type ProxyInstruction = "FOR" | "AGAINST" | "DISCRETION";

type ProxyForm = {
  proxyProfileId: number | null;
  proxyName: string;
  proxyMembershipNo: string;
  instruction: ProxyInstruction;
  notes: string;
  signedFormUrl: string;
  signedFileName: string;
};

type VoteReceipt = {
  receiptNumber: string;
  subject: string;
  voteValue: string;
  castAt: string;
};

type ElectionCycle = "vote" | "proxy" | "audit";

const MEMBER_ELECTION_CYCLES = [
  {
    id: "vote" as const,
    to: "/election/vote",
    label: "Cast electronic vote",
    description: "One vote per resolution. A recorded vote cannot be recast.",
    icon: Gavel,
  },
  {
    id: "proxy" as const,
    to: "/election/appoint-proxy",
    label: "Appoint a proxy",
    description: "Authorise another eligible member to vote on your behalf.",
    icon: UserPlus,
  },
  {
    id: "audit" as const,
    to: "/election/audit",
    label: "Published audit log",
    description: "Declared results after the Returning Officer publishes them.",
    icon: ScrollText,
  },
];

/** Standalone Election page — AGM notices / member ballot, plus Committee For/Against for sitting members. */
export function ElectionPage() {
  return <MemberElectionCards />;
}

export function MemberElectionVotePage() {
  return <MemberElectionCyclePage cycle="vote" />;
}

export function MemberElectionProxyPage() {
  return <MemberElectionCyclePage cycle="proxy" />;
}

export function MemberElectionAuditPage() {
  return <MemberElectionCyclePage cycle="audit" />;
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: value.length > 10 ? "2-digit" : undefined,
    minute: value.length > 10 ? "2-digit" : undefined,
  });
}

function formatLongDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function meetingTypeLabel(code?: string | null) {
  const type = (code ?? "").toUpperCase();
  if (type === "EGM") return "Extraordinary General Meeting";
  if (type === "AGM") return "Annual General Meeting";
  return code || "General meeting";
}

function agendaLines(agenda?: string | null) {
  if (!agenda?.trim()) return [];
  return agenda
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function papersName(url?: string | null) {
  if (!url) return null;
  try {
    const path = new URL(url, window.location.origin).pathname;
    const name = decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "");
    return name || "Open attached papers";
  } catch {
    return "Open attached papers";
  }
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function formatPublishedAt(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString("en-GB", {
    timeZone: KENYA_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-GB", {
    timeZone: KENYA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day}, ${time} EAT`;
}

function parseProxyInstruction(data?: Mine | null): ProxyInstruction {
  if (data?.proxy?.leaveToDiscretion) return "DISCRETION";
  const value = (data?.proxy?.voteInstruction ?? "").trim().toUpperCase();
  if (value === "FOR" || value === "AGAINST" || value === "DISCRETION") return value;
  return "FOR";
}

function fileNameFromUrl(url?: string | null) {
  if (!url) return "";
  try {
    const path = new URL(url, window.location.origin).pathname;
    return decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "") || "Signed form";
  } catch {
    return "Signed form";
  }
}

function useCountdown(target?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  return useMemo(() => {
    if (!target) return null;
    const close = new Date(target).getTime() - now;
    if (Number.isNaN(close)) return null;
    if (close <= 0) return { closed: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    const total = Math.max(0, Math.floor(close / 1000));
    return {
      closed: false,
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
    };
  }, [now, target]);
}

function useMemberElection() {
  const user = readUser();
  const staff = isStaff(user);
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ["elections", "mine"],
    queryFn: () => apiRequest<Mine>("/api/elections/mine"),
  });
  const data = mine.data;
  const [proxy, setProxy] = useState<ProxyForm>({
    proxyProfileId: null,
    proxyName: "",
    proxyMembershipNo: "",
    instruction: "FOR",
    notes: "",
    signedFormUrl: "",
    signedFileName: "",
  });
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);

  useEffect(() => {
    if (!data) return;
    setProxy((p) => ({
      proxyProfileId: data.proxy?.proxyProfileId ?? p.proxyProfileId,
      proxyName: data.proxy?.proxyName || p.proxyName,
      proxyMembershipNo: data.proxy?.proxyMembershipNo || p.proxyMembershipNo,
      instruction: parseProxyInstruction(data),
      notes: data.proxy?.notes || p.notes,
      signedFormUrl: data.proxy?.signedFormUrl || p.signedFormUrl,
      signedFileName: data.proxy?.signedFormUrl
        ? fileNameFromUrl(data.proxy.signedFormUrl)
        : p.signedFileName,
    }));
  }, [data]);

  const meetingId = data?.notice?.generalMeetingId;
  const windowOpen = Boolean(data?.ballotWindowOpen);
  const eligible = Boolean(data?.eligibleToVote);
  const countdown = useCountdown(data?.ballotClosesAt);
  const notice = data?.notice;
  const nominees = data?.nominations ?? [];
  const items = data?.ballotItems ?? [];
  const votedCount = items.filter((item) => item.myVoteValue).length;

  const vote = useMutation({
    mutationFn: (payload: { agendaItemId: number; voteValue: string }) =>
      apiRequest<VoteReceipt>(`/api/elections/meetings/${meetingId}/votes`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (row) => {
      setReceipt(row);
      toast.success(`Vote recorded. Receipt ${row.receiptNumber}`);
      void queryClient.invalidateQueries({ queryKey: ["elections", "mine"] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const saveProxy = useMutation({
    mutationFn: () =>
      apiRequest(`/api/elections/meetings/${meetingId}/proxy`, {
        method: "POST",
        body: JSON.stringify({
          appointingName: data?.memberName,
          appointingPoBox: data?.postalAddress,
          proxyProfileId: proxy.proxyProfileId || null,
          proxyName: proxy.proxyName,
          proxyMembershipNo: proxy.proxyMembershipNo,
          voteInstruction: proxy.instruction,
          leaveToDiscretion: proxy.instruction === "DISCRETION",
          notes: proxy.notes,
          signedFormUrl: proxy.signedFormUrl || null,
          instructions:
            proxy.instruction === "DISCRETION"
              ? []
              : items.map((item) => ({
                  agendaItemId: item.agendaItemId,
                  voteValue: proxy.instruction,
                })),
        }),
      }),
    onSuccess: () => {
      toast.success(
        proxy.proxyProfileId
          ? "Proxy lodged. The named member has been notified."
          : "Proxy lodged. No member account was linked — staff may need to contact them manually.",
      );
      void queryClient.invalidateQueries({ queryKey: ["elections", "mine"] });
      void queryClient.invalidateQueries({ queryKey: ["member-me"] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return {
    staff,
    mine,
    data,
    proxy,
    setProxy,
    receipt,
    meetingId,
    windowOpen,
    eligible,
    countdown,
    notice,
    nominees,
    items,
    votedCount,
    vote,
    saveProxy,
  };
}

function CountdownBanner({
  notice,
  deadline,
  countdown,
}: {
  notice: Notice;
  deadline?: string | null | undefined;
  countdown: ReturnType<typeof useCountdown>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-6 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <Clock3 className="mt-0.5 size-5 shrink-0 opacity-90" />
          <div>
            <p className="font-semibold">Voting closes 48 hours before the {notice.meetingType}</p>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Ballots and proxy appointments must reach the Returning Officer by {formatWhen(deadline)}.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          {(
            [
              ["DAYS", countdown?.days ?? 0],
              ["HRS", countdown?.hours ?? 0],
              ["MIN", countdown?.minutes ?? 0],
              ["SEC", countdown?.seconds ?? 0],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-white/10 font-display text-xl font-semibold tabular-nums sm:size-16 sm:text-2xl">
                {countdown?.closed ? "00" : pad(value)}
              </div>
              <p className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-primary-foreground/70">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemberElectionCards() {
  const { staff, mine, data, countdown, notice, items, votedCount } = useMemberElection();
  const member = useMemberDashboard();
  const showCommitteeVote = Boolean(member.data?.cards.committeeBallot);

  return (
    <PageFrame width="lg">
      {staff ? <PageBackLink to="/admin" label="Back to admin dashboard" /> : null}
      {notice ? (
        <CountdownBanner notice={notice} deadline={data?.proxyDeadlineAt} countdown={countdown} />
      ) : null}

      <div className="grid gap-5">
        <ProxiesHeldSection rows={data?.proxiesHeld ?? []} loading={mine.isLoading} />

        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">Electronic ballot &amp; proxy</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                One vote per resolution; it cannot be recast.
              </p>
            </div>
            {items.length > 0 ? (
              <div className="min-w-[140px]">
                <p className="text-right text-xs font-medium text-muted-foreground">
                  {votedCount} of {items.length} items voted
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${items.length ? (votedCount / items.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {MEMBER_ELECTION_CYCLES.map(({ to, label, description, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="rounded-xl border border-border bg-background px-4 py-4 shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-50/40"
              >
                <span className="inline-flex size-9 items-center justify-center rounded-full border border-border">
                  <Icon className="size-4" />
                </span>
                <p className="mt-3 font-medium">{label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </Link>
            ))}
            {showCommitteeVote ? (
              <>
                <Link
                  to="/election/committee-vote"
                  className="rounded-xl border border-border bg-background px-4 py-4 shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-50/40"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-border">
                    <ClipboardList className="size-4" />
                  </span>
                  <p className="mt-3 font-medium">Committee vote</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review a membership applicant, then vote For or Against.
                  </p>
                </Link>
                <Link
                  to="/election/committee-signatures"
                  className="rounded-xl border border-border bg-background px-4 py-4 shadow-sm transition-colors hover:border-emerald-600 hover:bg-emerald-50/40"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-border">
                    <ScrollText className="size-4" />
                  </span>
                  <p className="mt-3 font-medium">Signatures</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sign as a Committee member when a ballot has passed.
                  </p>
                </Link>
              </>
            ) : null}
          </div>
        </section>

        <MeetingNoticeCard notice={notice ?? null} loading={mine.isLoading} />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Aero Club of East Africa · Wilson Airport, Nairobi · Governance queries: governance@aeroclubea.org
      </p>
    </PageFrame>
  );
}

function MemberElectionCyclePage({ cycle }: { cycle: ElectionCycle }) {
  const election = useMemberElection();
  const {
    mine,
    data,
    proxy,
    setProxy,
    receipt,
    meetingId,
    windowOpen,
    eligible,
    countdown,
    notice,
    nominees,
    items,
    votedCount,
    vote,
    saveProxy,
  } = election;
  const current = MEMBER_ELECTION_CYCLES.find((item) => item.id === cycle)!;

  return (
    <PageFrame width="lg">
      <PageBackLink to="/election" label="Back to election" />
      <PageHeader title={current.label} description={current.description} />
      {notice && cycle !== "audit" ? (
        <CountdownBanner notice={notice} deadline={data?.proxyDeadlineAt} countdown={countdown} />
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
        {cycle === "vote" && items.length > 0 ? (
          <div className="mb-5 min-w-[140px] sm:ml-auto sm:w-40">
            <p className="text-right text-xs font-medium text-muted-foreground">
              {votedCount} of {items.length} items voted
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${items.length ? (votedCount / items.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : null}

        {mine.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading ballot…</p>
        ) : cycle === "vote" ? (
          <VoteTab
            eligible={eligible}
            windowOpen={windowOpen}
            noVoteReason={data?.noVoteReason ?? null}
            subscriptionsPaidUp={data?.subscriptionsPaidUp ?? false}
            items={items}
            nominees={nominees}
            receipt={receipt}
            pending={vote.isPending}
            proxyReviewStatus={data?.proxy?.reviewStatus ?? null}
            onVote={(agendaItemId, voteValue) => vote.mutate({ agendaItemId, voteValue })}
          />
        ) : cycle === "proxy" ? (
          <ProxyTab
            eligible={eligible}
            meetingId={meetingId}
            {...(data ? { data } : {})}
            proxy={proxy}
            setProxy={setProxy}
            pending={saveProxy.isPending}
            onSave={() => saveProxy.mutate()}
          />
        ) : (
          <AuditTab {...(data ? { data } : {})} />
        )}
      </section>
    </PageFrame>
  );
}

function MeetingNoticeCard({
  notice,
  loading,
}: {
  notice?: Notice | null;
  loading: boolean;
}) {
  const lines = agendaLines(notice?.agenda);
  const file = papersName(notice?.papersUrl);

  return (
    <aside className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <h2 className="font-display text-xl font-semibold">Meeting notice</h2>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading notice…</p>
      ) : !notice ? (
        <p className="mt-4 text-sm text-muted-foreground">
          When the Committee publishes an AGM or EGM, the notice appears here with the agenda and
          papers.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <NoticeRow icon={FileText} label="Meeting type" value={meetingTypeLabel(notice.meetingType)} />
          <NoticeRow icon={CalendarDays} label="Date & time" value={formatLongDate(notice.meetingDate)} />
          <NoticeRow icon={MapPin} label="Venue" value={notice.venue || "To be advised"} />
          <NoticeRow
            icon={ScrollText}
            label="Notice issued"
            value={formatLongDate(notice.noticeSentDate)}
          />

          {/* <div
            className={cn(
              "rounded-xl px-3 py-2.5 text-sm",
              notice.noticePeriodMet
                ? "bg-emerald-50 text-emerald-900"
                : "bg-amber-50 text-amber-950",
            )}
          >
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              {notice.actualClearDays} clear days
              {notice.noticePeriodMet ? " met" : ""}. requires at least{" "}
              {notice.requiredClearDays} clear days&apos; notice for an {notice.meetingType}.
            </p>
          </div> */}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Agenda
            </p>
            {lines.length > 0 ? (
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Agenda will appear when published.</p>
            )}
          </div>

          {notice.papersUrl ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <p className="truncate text-sm font-medium">{file}</p>
              </div>
              <a
                href={notice.papersUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold uppercase tracking-wide text-primary"
              >
                Open
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No papers attached yet.</p>
          )}
        </div>
      )}
    </aside>
  );
}

function NoticeRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function VoteTab({
  eligible,
  windowOpen,
  noVoteReason,
  subscriptionsPaidUp,
  items,
  nominees,
  receipt,
  pending,
  proxyReviewStatus,
  onVote,
}: {
  eligible: boolean;
  windowOpen: boolean;
  noVoteReason?: string | null;
  subscriptionsPaidUp?: boolean;
  items: BallotItem[];
  nominees: Nomination[];
  receipt: VoteReceipt | null;
  pending: boolean;
  proxyReviewStatus?: string | null;
  onVote: (agendaItemId: number, voteValue: string) => void;
}) {
  const approvedProxy = (proxyReviewStatus ?? "").toUpperCase() === "APPROVED";
  return (
    <div className="space-y-6">
      {!eligible ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {noVoteReason ?? "You are not eligible to vote."}
          {!subscriptionsPaidUp
            ? " Settle the current subscription to restore voting rights (Article 62)."
            : ""}
        </p>
      ) : null}

      {approvedProxy ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Your approved proxy already records your vote, so electronic voting is closed for this meeting.
        </p>
      ) : null}

      {!windowOpen ? (
        <p className="text-sm text-muted-foreground">
          When the Committee authorises an electronic vote, you may cast a ballot or appoint a proxy
          from this page.
        </p>
      ) : null}

      {receipt ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Confirmation receipt {receipt.receiptNumber}: {receipt.subject} — {receipt.voteValue} at{" "}
          {formatWhen(receipt.castAt)}. This resolution cannot be voted again.
        </p>
      ) : null}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Official resolutions
        </p>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No resolutions have been published yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {items.map((item, index) => (
              <ResolutionCard
                key={item.agendaItemId}
                index={index + 1}
                item={item}
                canVote={eligible && windowOpen && !item.myVoteValue && !approvedProxy}
                pending={pending}
                onVote={onVote}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Committee nominees 
        </p>
        {nominees.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Empty
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {nominees.map((n) => (
              <NomineeCard key={n.electionNominationId} nominee={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResolutionCard({
  index,
  item,
  canVote,
  pending,
  onVote,
}: {
  index: number;
  item: BallotItem;
  canVote: boolean;
  pending: boolean;
  onVote: (agendaItemId: number, voteValue: string) => void;
}) {
  const against = (item.myVoteValue ?? "").toUpperCase() === "AGAINST";
  const forVote = (item.myVoteValue ?? "").toUpperCase() === "FOR";
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
          Resolution {index}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {item.isSpecialBusiness ? "Special resolution" : "Ordinary resolution"}
        </span>
      </div>
      <h3 className="mt-2 font-display text-lg font-semibold leading-snug">{item.subject}</h3>
      {item.resolutionText ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.resolutionText}</p>
      ) : null}

      {item.myVoteValue ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white",
              against ? "bg-red-600" : "bg-emerald-600",
            )}
          >
            <CheckCircle2 className="size-3.5" />
            Voted {against ? "AGAINST" : forVote ? "FOR" : item.myVoteValue}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            <Lock className="size-3.5" />
            Sealed
          </span>
        </div>
      ) : canVote ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={pending}
            onClick={() => onVote(item.agendaItemId, "FOR")}
          >
            <ThumbsUp className="size-4" />
            For
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={pending}
            onClick={() => onVote(item.agendaItemId, "AGAINST")}
          >
            <ThumbsDown className="size-4" />
            Against
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Voting opens when the Committee authorises the electronic ballot and you are eligible.
        </p>
      )}
    </article>
  );
}

function NomineeCard({ nominee }: { nominee: Nomination }) {
  const bio = [nominee.occupation, nominee.company].filter(Boolean).join(" · ");
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="flex gap-3">
        {nominee.photoUrl ? (
          <img
            src={nominee.photoUrl}
            alt=""
            className="size-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
            {initials(nominee.nomineeName)}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-semibold">
            {nominee.nomineeName}
            {nominee.nomineeMembershipNo ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {nominee.nomineeMembershipNo}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm font-medium text-emerald-700">{nominee.roleStandingFor}</p>
          {bio ? <p className="mt-1 text-sm text-foreground/90">{bio}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Proposed by {nominee.proposerName}; seconded by {nominee.seconderName}
          </p>
        </div>
      </div>
    </article>
  );
}

function ProxiesHeldSection({ rows, loading }: { rows: ProxyHeld[]; loading: boolean }) {
  if (loading || rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Appointments to you</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Members who named you as their proxy. Authority ends at the lodging deadline shown for each meeting.
          </p>
        </div>
        <span className="rounded-full bg-sky-700 px-2.5 py-0.5 text-xs font-semibold text-white">
          {rows.length} appointment{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {rows.map((row) => (
          <div key={row.proxyId} className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold">
                  {row.appointingName}
                  {row.appointingMembershipNo ? (
                    <span className="font-normal text-muted-foreground"> · {row.appointingMembershipNo}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {meetingTypeLabel(row.meetingType)} · {formatLongDate(row.meetingDate)}
                  {row.venue ? ` · ${row.venue}` : ""}
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                Deadline {formatWhen(row.proxyDeadlineAt)}
              </span>
            </div>
            <p className="mt-3 text-sm">
              <span className="font-medium">Instruction:</span> {row.instructionLabel}
            </p>
            {row.resolutions.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                {row.resolutions.map((subject) => (
                  <li key={`${row.proxyId}-${subject}`}>{subject}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No resolutions published for this meeting yet.</p>
            )}
            {row.reviewStatus ? (
              <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                Status · {row.reviewStatus}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

const PROXY_INSTRUCTIONS: {
  id: ProxyInstruction;
  title: string;
}[] = [
  { id: "FOR", title: "In favour" },
  { id: "AGAINST", title: "Against" },
  { id: "DISCRETION", title: "Discretionary" },
];

function ProxyTab({
  eligible,
  meetingId,
  data,
  proxy,
  setProxy,
  pending,
  onSave,
}: {
  eligible: boolean;
  meetingId?: number | undefined;
  data?: Mine;
  proxy: ProxyForm;
  setProxy: React.Dispatch<React.SetStateAction<ProxyForm>>;
  pending: boolean;
  onSave: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [search, setSearch] = useState("");
  const hits = useQuery({
    queryKey: ["elections", "members", search],
    queryFn: () => apiRequest<MemberHit[]>(`/api/elections/members?search=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
  });
  const deadlinePassed = Boolean(
    data?.proxyDeadlineAt && new Date(data.proxyDeadlineAt).getTime() <= Date.now(),
  );
  const reviewStatus = (data?.proxy?.reviewStatus ?? "").toUpperCase();
  const lockedReview = reviewStatus === "APPROVED" || reviewStatus === "REJECTED" || reviewStatus === "LATE";
  const canSubmit =
    Boolean(meetingId) &&
    eligible &&
    !lockedReview &&
    proxy.proxyName.trim().length >= 2 &&
    !pending &&
    !uploadBusy;

  async function acceptFile(file?: File | null) {
    if (!file) return;
    const type = file.type.toLowerCase();
    const okType =
      type === "application/pdf" ||
      type === "image/jpeg" ||
      type === "image/png" ||
      /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!okType) {
      toast.error("Upload a PDF, JPG or PNG.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be 10 MB or smaller.");
      return;
    }
    setUploadBusy(true);
    try {
      const uploaded = await uploadFile(file, "proxy");
      setProxy((p) => ({
        ...p,
        signedFormUrl: uploaded.url ?? uploaded.id,
        signedFileName: uploaded.fileName,
      }));
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setUploadBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const pickMember = (hit: MemberHit) => {
    setProxy((p) => ({
      ...p,
      proxyProfileId: hit.profileId,
      proxyName: hit.name,
      proxyMembershipNo: hit.membershipNo || "",
    }));
    setSearch("");
  };

  return (
    <div className="grid gap-5">
      {!meetingId ? (
        <p className="text-sm text-muted-foreground">
          Proxy appointments can be lodged once a meeting notice is published.
        </p>
      ) : null}
      {!eligible && data?.noVoteReason ? (
        <p className="text-sm text-amber-800">{data.noVoteReason}</p>
      ) : null}

      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Search club member (recommended)
          <Input
            placeholder="Name or membership number"
            value={search}
            disabled={lockedReview}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {search.trim().length >= 2 ? (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
            {hits.isLoading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
            ) : (hits.data ?? []).length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No members matched.</p>
            ) : (
              (hits.data ?? []).map((hit) => (
                <button
                  key={hit.profileId}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                  onClick={() => pickMember(hit)}
                >
                  <span className="font-medium">{hit.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {hit.membershipNo || hit.classCode}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
        {/* {proxy.proxyProfileId ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Linked member selected — they will be notified by email and in-app when you lodge this proxy.
            <button
              type="button"
              className="ml-2 font-medium underline"
              disabled={lockedReview}
              onClick={() =>
                setProxy((p) => ({ ...p, proxyProfileId: null, proxyName: "", proxyMembershipNo: "" }))
              }
            >
              Clear
            </button>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Or type a name below for a guest / non-member. Staff will see that this person could not be
            auto-notified.
          </p>
        )} */}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Proxy name
          <Input
            placeholder="Member name or 'The Chairman'"
            value={proxy.proxyName}
            disabled={lockedReview || Boolean(proxy.proxyProfileId)}
            onChange={(e) =>
              setProxy((p) => ({ ...p, proxyProfileId: null, proxyName: e.target.value }))
            }
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Proxy membership number
          <Input
            placeholder="AC-0000"
            value={proxy.proxyMembershipNo}
            disabled={lockedReview || Boolean(proxy.proxyProfileId)}
            onChange={(e) =>
              setProxy((p) => ({ ...p, proxyProfileId: null, proxyMembershipNo: e.target.value }))
            }
          />
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Voting instructions</legend>
        {PROXY_INSTRUCTIONS.map((option) => {
          const selected = proxy.instruction === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3",
                lockedReview && "pointer-events-none opacity-70",
                selected
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-border bg-background hover:border-foreground/20",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                  selected ? "border-emerald-700" : "border-muted-foreground/40",
                )}
              >
                {selected ? <span className="size-2 rounded-full bg-emerald-800" /> : null}
              </span>
              <input
                type="radio"
                name="proxy-instruction"
                className="sr-only"
                checked={selected}
                disabled={lockedReview}
                onChange={() => setProxy((p) => ({ ...p, instruction: option.id }))}
              />
              <span>
                <span className="font-semibold">{option.title}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <label className="grid gap-1.5 text-sm font-medium">
        Notes to your proxy (optional)
        <Textarea
          rows={4}
          placeholder="Any specific instruction..."
          className="min-h-24"
          value={proxy.notes}
          disabled={lockedReview}
          onChange={(e) => setProxy((p) => ({ ...p, notes: e.target.value }))}
        />
      </label>

      <div className="grid gap-1.5">
        <p className="text-sm font-medium">Signed proxy form</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => void acceptFile(e.target.files?.[0])}
        />
        {proxy.signedFormUrl ? (
          <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm">
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{proxy.signedFileName || "Signed form"}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-7"
              disabled={lockedReview}
              onClick={() => setProxy((p) => ({ ...p, signedFormUrl: "", signedFileName: "" }))}
            >
              <X className="size-4" />
              <span className="sr-only">Remove signed form</span>
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={lockedReview}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void acceptFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "grid place-items-center rounded-xl border-2 border-dashed px-4 py-8 text-center",
              dragging ? "border-emerald-600 bg-emerald-50/60" : "border-muted-foreground/25 bg-muted/20",
            )}
          >
            <CloudUpload className="size-7 text-primary" />
            <p className="mt-2 text-sm font-semibold">
              {uploadBusy ? "Uploading…" : "Drag & drop your signed form here"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG or PNG up to 10 MB</p>
            <span className="mt-3 inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium">
              Browse files
            </span>
          </button>
        )}
      </div>

      {data?.proxyDeadlineAt ? (
        <p className="text-sm text-muted-foreground">
          Lodging deadline {formatWhen(data.proxyDeadlineAt)}
          {deadlinePassed ? " — cutoff has passed for ordinary proxies." : "."}
        </p>
      ) : null}

      {deadlinePassed && !lockedReview ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          The proxy cutoff has passed. You may still lodge the instrument, but it will be marked Late and
          cannot count toward quorum or the tally (Article 65).
        </p>
      ) : null}

      {reviewStatus === "PENDING" ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          Your proxy is pending Returning Officer review. It will not count until it is approved.
        </p>
      ) : null}
      {reviewStatus === "APPROVED" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Your proxy has been approved and records your vote. You cannot also vote electronically.
        </p>
      ) : null}
      {reviewStatus === "REJECTED" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Your proxy was rejected
          {data?.proxy?.reviewReason ? `: ${data.proxy.reviewReason}` : ""}. If the electronic balloting
          window is still open, you may cast your own vote directly.
        </p>
      ) : null}
      {reviewStatus === "LATE" ? (
        <p className="rounded-xl border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This proxy was lodged after the cutoff and cannot count (Article 65). If the balloting window is
          still open, cast your vote electronically instead.
        </p>
      ) : null}

      {data?.proxy?.proxyName ? (
        <p className="text-xs text-muted-foreground">
          Lodged: {data.proxy.proxyName}
          {data.proxy.instrumentReceivedAt
            ? ` · ${formatWhen(data.proxy.instrumentReceivedAt)}`
            : ""}
          {reviewStatus
            ? ` · ${reviewStatus === "PENDING" ? "Pending review" : reviewStatus.charAt(0) + reviewStatus.slice(1).toLowerCase()}`
            : ""}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
          <Lock className="size-3.5" />
          {lockedReview
            ? "This proxy decision is final"
            : "On-time instruments await Returning Officer review"}
        </span>
        <Button type="button" className="rounded-lg px-5" disabled={!canSubmit} onClick={onSave}>
          {pending ? "Submitting…" : lockedReview ? "Proxy locked after review" : "Submit proxy appointment"}
        </Button>
      </div>
    </div>
  );
}

function AuditTab({ data }: { data?: Mine }) {
  const published = data?.resultDeclaredAt;
  const results = data?.publishedResults ?? [];
  if (!published) {
    return (
      <p className="text-sm text-muted-foreground">
        Published motion results appear here after the Chairman declares them. Tallies stay sealed
        until then.
      </p>
    );
  }

  const unique = data?.uniqueVoters ?? 0;
  const eligible = data?.eligibleVoters ?? 0;
  const quorumMet = Boolean(data?.quorumMet);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Published motion results</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Published {formatPublishedAt(published)} · read-only
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
            quorumMet ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground",
          )}
        >
          <Lock className="size-3.5" />
          {quorumMet ? "Quorum met" : "Quorum not met"} — {unique} of {eligible} eligible members
          voted
        </span>
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No resolutions were published for this meeting.</p>
      ) : (
        <ul className="grid gap-3">
          {results.map((row, index) => {
            const total = Math.max(row.votesCast, row.forCount + row.againstCount + row.abstainCount, 1);
            const carried = row.forCount > row.againstCount;
            return (
              <li key={row.agendaItemId} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
                      RESOLUTION {index + 1}
                    </p>
                    <p className="mt-1 font-display text-lg font-semibold leading-snug">{row.subject}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white",
                      carried ? "bg-emerald-700" : "bg-red-700",
                    )}
                  >
                    {carried ? "Carried" : "Not carried"}
                  </span>
                </div>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="h-full bg-emerald-600"
                    style={{ width: `${(row.forCount / total) * 100}%` }}
                  />
                  <span
                    className="h-full bg-red-500"
                    style={{ width: `${(row.againstCount / total) * 100}%` }}
                  />
                  <span
                    className="h-full bg-muted-foreground/25"
                    style={{ width: `${(row.abstainCount / total) * 100}%` }}
                  />
                </div>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium text-emerald-700">For {row.forCount}</span>
                  <span className="font-medium text-red-600">Against {row.againstCount}</span>
                  <span className="text-muted-foreground">Abstained {row.abstainCount}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
