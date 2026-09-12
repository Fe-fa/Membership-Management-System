import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

export type Notice = {
  generalMeetingId: number;
  meetingType: string;
  meetingDate: string;
  noticeSentDate?: string | null;
  agenda?: string | null;
  papersUrl?: string | null;
  venue?: string | null;
  status: string;
  requiredClearDays: number;
  actualClearDays: number;
  noticePeriodMet: boolean;
  noticePeriodDetail: string;
};

export type AgendaTally = {
  agendaItemId: number;
  subject: string;
  isSpecialBusiness: boolean;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  votesCast: number;
};

export type Nomination = {
  electionNominationId: number;
  nomineeName: string;
  nomineeMembershipNo?: string | null;
  proposerName: string;
  seconderName: string;
  roleStandingFor: string;
  photoUrl?: string | null;
};

export type DeskProxy = {
  proxyId: number;
  appointingName?: string | null;
  proxyName?: string | null;
  proxyMembershipNo?: string | null;
  proxyProfileId?: number | null;
  linkedMember?: boolean;
  manualContactRequired?: boolean;
  voteInstruction?: string | null;
  leaveToDiscretion?: boolean;
  instrumentReceivedAt?: string | null;
  depositedOnTime?: boolean;
  isValid?: boolean;
  reviewStatus?: string | null;
  reviewReason?: string | null;
};

export type Desk = {
  meeting: Notice;
  ballotWindowOpen: boolean;
  ballotOpensAt?: string | null;
  ballotClosesAt?: string | null;
  conductorProfileId?: number | null;
  conductorName?: string | null;
  resultDeclaredAt?: string | null;
  resultSummary?: string | null;
  nominationDeadline?: string | null;
  nominationsOpen: boolean;
  uniqueVoters: number;
  quorumRequired: number;
  quorumMet: boolean;
  scrutineer1ProfileId?: number | null;
  scrutineer1Name?: string | null;
  scrutineer2ProfileId?: number | null;
  scrutineer2Name?: string | null;
  agenda: AgendaTally[];
  nominations: Nomination[];
  proxies?: DeskProxy[];
};

export type MemberHit = {
  profileId: number;
  name: string;
  membershipNo?: string | null;
  classCode: string;
  continuousYears: number;
  eligibleToNominate: boolean;
};

export function initials(name?: string | null) {
  return (
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function formatWhen(value?: string | null) {
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

export function ballotCloseAt(meetingDate?: string | null) {
  if (!meetingDate) return null;
  const date = new Date(meetingDate.length === 10 ? `${meetingDate}T00:00:00` : meetingDate);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(date.getHours() - 48);
  return date.toISOString();
}

export function instructionLabel(row: DeskProxy) {
  if (row.leaveToDiscretion) return "Discretionary";
  const value = (row.voteInstruction ?? "").toUpperCase();
  if (value === "FOR") return "In favour";
  if (value === "AGAINST") return "Against";
  if (value === "DISCRETION") return "Discretionary";
  return value || "—";
}

export function proxyReviewStatus(row: DeskProxy) {
  const status = (row.reviewStatus ?? "").toUpperCase();
  if (status === "PENDING" || status === "APPROVED" || status === "REJECTED" || status === "LATE") {
    return status;
  }
  if (row.depositedOnTime === false || row.isValid === false) return "LATE";
  return "PENDING";
}

export function proxyStatusLabel(status: string) {
  if (status === "PENDING") return "Pending review";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  if (status === "LATE") return "Late";
  return status;
}

export function proxyStatusTone(status: string) {
  if (status === "APPROVED") return "bg-emerald-600";
  if (status === "REJECTED") return "bg-red-600";
  if (status === "LATE") return "bg-slate-500";
  return "bg-amber-600";
}

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="About this field">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

export function FieldLabel({ children, tip }: { children: string; tip?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium leading-none">
      {children}
      {tip ? <InfoTip text={tip} /> : null}
    </span>
  );
}

export function StatusDot({
  label,
  tone,
}: {
  label: string;
  tone: "open" | "closed" | "idle";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "open" && "bg-emerald-500",
          tone === "closed" && "bg-slate-400",
          tone === "idle" && "bg-amber-400",
        )}
      />
      {label}
    </span>
  );
}

export function useElectionDesk() {
  const queryClient = useQueryClient();
  const desk = useQuery({
    queryKey: ["elections", "desk"],
    queryFn: () => apiRequest<Desk[]>("/api/elections"),
  });
  const meetings = desk.data ?? [];
  // Prefer scheduled/open meetings; fall back to the most recent held meeting.
  const current =
    meetings.find((row) => {
      const status = (row.meeting.status ?? "").toUpperCase();
      return status !== "HELD" && status !== "CANCELLED";
    }) ?? meetings[0];
  const meetingId = current?.meeting.generalMeetingId;
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["elections"] });
  return { desk, meetings, current, meetingId, invalidate, queryClient };
}

export function ElectionDeskLayout({ children }: { children?: ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <PageFrame width="lg">
        <PageBackLink to="/admin" label="Back to admin dashboard" />
        <PageHeader title="AGM/EGM Election" />
        {children ?? <Outlet />}
      </PageFrame>
    </TooltipProvider>
  );
}

export function DeskLoadGate({
  children,
  empty = "No general meeting published yet.",
}: {
  children: (args: { current: Desk; meetingId: number }) => ReactNode;
  empty?: string;
}) {
  const { desk, current, meetingId } = useElectionDesk();
  if (desk.isLoading) {
    return <PageBodyLoading label="Loading election desk…" />;
  }
  if (desk.isError) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-10 text-sm text-destructive">
        {extractErrorMessage(desk.error)}
      </div>
    );
  }
  if (!current || !meetingId) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return <>{children({ current, meetingId })}</>;
}
