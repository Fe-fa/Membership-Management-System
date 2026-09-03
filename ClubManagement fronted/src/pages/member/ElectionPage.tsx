import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ElectionDeskPage } from "@/pages/admin/ElectionDeskPage";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

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
  proxy?: {
    proxyTitle?: string | null;
    proxyName?: string | null;
    alternateTitle?: string | null;
    alternateName?: string | null;
    voteInstruction?: string | null;
    leaveToDiscretion?: boolean;
    appointingName?: string | null;
    appointingPoBox?: string | null;
  } | null;
};

type VoteReceipt = {
  receiptNumber: string;
  subject: string;
  voteValue: string;
  castAt: string;
};

/** Standalone Election page — AGM notices / member ballot. Committee application ballot is never shown here. */
export function ElectionPage() {
  const user = readUser();
  if (isStaff(user) && readPortalMode(user) === "admin") {
    return <ElectionDeskPage />;
  }
  return <MemberElectionCards />;
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
    if (close <= 0) return "Closed";
    const total = Math.floor(close / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m ${s}s`;
  }, [now, target]);
}

function MemberElectionCards() {
  const user = readUser();
  const staff = isStaff(user);
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ["elections", "mine"],
    queryFn: () => apiRequest<Mine>("/api/elections/mine"),
  });
  const data = mine.data;
  const [proxy, setProxy] = useState({
    appointingName: "",
    appointingPoBox: "",
    proxyTitle: "Mr",
    proxyName: "",
    alternateTitle: "Mr",
    alternateName: "",
    leaveToDiscretion: false,
    isPoll: false,
  });
  const [instructions, setInstructions] = useState<Record<number, "FOR" | "AGAINST" | "DISCRETION">>({});
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);

  useEffect(() => {
    if (!data) return;
    setProxy((p) => ({
      ...p,
      appointingName: data.proxy?.appointingName || data.memberName || p.appointingName,
      appointingPoBox: data.proxy?.appointingPoBox || data.postalAddress || p.appointingPoBox,
      proxyTitle: data.proxy?.proxyTitle || p.proxyTitle,
      proxyName: data.proxy?.proxyName || p.proxyName,
      alternateTitle: data.proxy?.alternateTitle || p.alternateTitle,
      alternateName: data.proxy?.alternateName || p.alternateName,
      leaveToDiscretion: data.proxy?.leaveToDiscretion ?? p.leaveToDiscretion,
    }));
  }, [data]);

  const meetingId = data?.notice?.generalMeetingId;
  const windowOpen = Boolean(data?.ballotWindowOpen);
  const eligible = Boolean(data?.eligibleToVote);
  const countdown = useCountdown(data?.ballotClosesAt);

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
          appointingName: proxy.appointingName,
          appointingPoBox: proxy.appointingPoBox,
          proxyTitle: proxy.proxyTitle,
          proxyName: proxy.proxyName,
          alternateTitle: proxy.alternateTitle,
          alternateName: proxy.alternateName,
          leaveToDiscretion: proxy.leaveToDiscretion,
          isPoll: proxy.isPoll,
          instructions: proxy.leaveToDiscretion
            ? []
            : Object.entries(instructions)
                .filter(([, v]) => v === "FOR" || v === "AGAINST")
                .map(([agendaItemId, voteValue]) => ({
                  agendaItemId: Number(agendaItemId),
                  voteValue,
                })),
        }),
      }),
    onSuccess: () => {
      toast.success("Proxy instrument lodged.");
      void queryClient.invalidateQueries({ queryKey: ["elections", "mine"] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const notice = data?.notice;
  const nominees = data?.nominations ?? [];
  const items = data?.ballotItems ?? [];

  return (
    <PageFrame>
      {staff ? <PageBackLink to="/admin" label="Back to admin dashboard" /> : null}
      <PageHeader
        title="Election"
        description="AGM notices are issued with at least 14 clear days; EGMs with 21 clear days (Article 52)."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Meeting notices</CardTitle>
            <CardDescription>Date, venue, agenda and papers.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {mine.isLoading ? (
              "Loading notices…"
            ) : notice ? (
              <dl className="grid gap-2 text-foreground">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Meeting type</dt>
                  <dd className="font-medium">{notice.meetingType}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Date</dt>
                  <dd>{formatWhen(notice.meetingDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Venue</dt>
                  <dd>{notice.venue || "To be advised"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Notice issued</dt>
                  <dd>
                    {formatWhen(notice.noticeSentDate)}{" "}
                    <span className={notice.noticePeriodMet ? "text-emerald-700" : "text-destructive"}>
                      · {notice.actualClearDays} clear days
                      {notice.noticePeriodMet ? " (Article 52 met)" : ` (needs ≥${notice.requiredClearDays})`}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Agenda</dt>
                  <dd className="whitespace-pre-line">{notice.agenda || "Agenda will appear when published."}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Papers</dt>
                  <dd>
                    {notice.papersUrl ? (
                      <a className="text-primary underline" href={notice.papersUrl} target="_blank" rel="noreferrer">
                        Open attached papers
                      </a>
                    ) : (
                      "No papers attached yet."
                    )}
                  </dd>
                </div>
                <p className="text-xs text-muted-foreground">{notice.noticePeriodDetail}</p>
              </dl>
            ) : (
              "When the Committee publishes an AGM or EGM, the notice appears here with the agenda and papers."
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Electronic ballot & proxy</CardTitle>
            <CardDescription>Article 65 electronic vote. One vote per resolution; cannot be recast.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!eligible ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                {data?.noVoteReason ?? "You are not eligible to vote."}
                {!data?.subscriptionsPaidUp
                  ? " Settle the current subscription to restore voting rights (Article 62)."
                  : ""}
              </p>
            ) : null}

            {windowOpen && data?.ballotClosesAt ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2">
                Voting window closes 2 days before the AGM (Article 65). Time remaining:{" "}
                <span className="font-semibold">{countdown ?? "—"}</span>
                <span className="block text-xs text-muted-foreground">
                  Opens {formatWhen(data.ballotOpensAt)} · closes {formatWhen(data.ballotClosesAt)}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">
                When the Committee authorises an electronic vote, you may cast a ballot or appoint a proxy from this
                page.
              </p>
            )}

            {receipt ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950">
                Confirmation receipt {receipt.receiptNumber}: {receipt.subject} — {receipt.voteValue} at{" "}
                {formatWhen(receipt.castAt)}. This resolution cannot be voted again.
              </p>
            ) : null}

            {windowOpen
              ? items.map((item) => (
                  <div key={item.agendaItemId} className="rounded-lg border px-3 py-2">
                    <p className="font-medium">
                      {item.subject}
                      {item.isSpecialBusiness ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">Special business</span>
                      ) : null}
                    </p>
                    {item.myVoteValue ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Recorded: {item.myVoteValue}
                        {item.receiptNumber ? ` · receipt ${item.receiptNumber}` : ""}
                        {item.castAt ? ` · ${formatWhen(item.castAt)}` : ""}
                      </p>
                    ) : eligible ? (
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={vote.isPending}
                          onClick={() => vote.mutate({ agendaItemId: item.agendaItemId, voteValue: "FOR" })}
                        >
                          Vote for
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={vote.isPending}
                          onClick={() => vote.mutate({ agendaItemId: item.agendaItemId, voteValue: "AGAINST" })}
                        >
                          Vote against
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Voting blocked until you are eligible.</p>
                    )}
                  </div>
                ))
              : null}

            {nominees.length > 0 ? (
              <div className="grid gap-2 border-t border-border pt-3">
                <p className="font-medium">Committee nominees (Articles 20 & 55)</p>
                <ul className="divide-y rounded-lg border">
                  {nominees.map((n) => (
                    <li key={n.electionNominationId} className="px-3 py-2">
                      <p className="font-medium">
                        {n.nomineeName}
                        {n.nomineeMembershipNo ? ` · ${n.nomineeMembershipNo}` : ""} — {n.roleStandingFor}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Proposed by {n.proposerName}; seconded by {n.seconderName}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {windowOpen && eligible ? (
              <div className="grid gap-2 border-t border-border pt-3">
                <p className="font-medium">Proxy appointment (Article 65)</p>
                <p className="text-xs text-muted-foreground">
                  Lodge at least 48 hours before the meeting (24 hours for a poll). Deadline{" "}
                  {formatWhen(proxy.isPoll ? data?.pollProxyDeadlineAt : data?.proxyDeadlineAt)}.
                </p>
                <label className="grid gap-1 text-xs">
                  Member&apos;s name
                  <Input
                    value={proxy.appointingName}
                    onChange={(e) => setProxy((p) => ({ ...p, appointingName: e.target.value }))}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  P.O. Box
                  <Input
                    value={proxy.appointingPoBox}
                    onChange={(e) => setProxy((p) => ({ ...p, appointingPoBox: e.target.value }))}
                  />
                </label>
                <p className="text-xs">I appoint</p>
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={proxy.proxyTitle}
                    onChange={(e) => setProxy((p) => ({ ...p, proxyTitle: e.target.value }))}
                  >
                    <option>Mr</option>
                    <option>Mrs</option>
                    <option>Ms</option>
                  </select>
                  <Input
                    placeholder="as my proxy"
                    value={proxy.proxyName}
                    onChange={(e) => setProxy((p) => ({ ...p, proxyName: e.target.value }))}
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={proxy.alternateTitle}
                    onChange={(e) => setProxy((p) => ({ ...p, alternateTitle: e.target.value }))}
                  >
                    <option>Mr</option>
                    <option>Mrs</option>
                    <option>Ms</option>
                  </select>
                  <Input
                    placeholder="and failing him/her (alternate)"
                    value={proxy.alternateName}
                    onChange={(e) => setProxy((p) => ({ ...p, alternateName: e.target.value }))}
                  />
                </div>
                <label className="flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={proxy.leaveToDiscretion}
                    onCheckedChange={(v) => setProxy((p) => ({ ...p, leaveToDiscretion: v === true }))}
                  />
                  Leave voting to the proxy&apos;s discretion (do not strike in favour / against)
                </label>
                {!proxy.leaveToDiscretion
                  ? items.map((item) => (
                      <label key={`p-${item.agendaItemId}`} className="grid gap-1 text-xs">
                        <Label>Strike in favour / against — {item.subject}</Label>
                        <select
                          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                          value={instructions[item.agendaItemId] ?? ""}
                          onChange={(e) =>
                            setInstructions((cur) => ({
                              ...cur,
                              [item.agendaItemId]: e.target.value as "FOR" | "AGAINST",
                            }))
                          }
                        >
                          <option value="">Select</option>
                          <option value="FOR">In favour</option>
                          <option value="AGAINST">Against</option>
                        </select>
                      </label>
                    ))
                  : null}
                <label className="flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={proxy.isPoll}
                    onCheckedChange={(v) => setProxy((p) => ({ ...p, isPoll: v === true }))}
                  />
                  This is a poll instrument (24-hour lodging rule)
                </label>
                {data?.proxy?.proxyName ? (
                  <p className="text-xs text-muted-foreground">
                    Lodged: {data.proxy.proxyTitle} {data.proxy.proxyName}
                    {data.proxy.alternateName
                      ? ` (alt. ${data.proxy.alternateTitle} ${data.proxy.alternateName})`
                      : ""}
                  </p>
                ) : null}
                <Button type="button" variant="outline" disabled={saveProxy.isPending} onClick={() => saveProxy.mutate()}>
                  Lodge proxy
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
