import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  applicantInitials,
  ballotPhotoUrl,
  canToggleVoting,
  isFinanceFeesCleared,
  isVotingOpen,
  peopleList,
  type BallotItem,
  type Seat,
} from "@/pages/admin/committeeBallotDesk";
import { cn } from "@/utils/cn";

const TALLY = {
  for: "var(--chart-1)",
  against: "var(--chart-2)",
  voted: "var(--chart-3)",
  nonVoters: "var(--chart-5)",
} as const;

function voteTrace(row: BallotItem, seats: Seat[]) {
  const voted = peopleList(row.voted, row.Voted);
  const votedIds = new Set(voted.map((v) => v.profileId));
  return {
    voted,
    votedIds,
    presentWaiting: seats.filter((s) => s.present && !votedIds.has(s.profileId)),
    notYetPresent: seats.filter((s) => !s.present),
  };
}

function VotingStatusBadge({ row }: { row: BallotItem }) {
  if (row.autoRejected || row.itemStatus === "REJECTED") {
    return (
      <Badge className="border-transparent bg-destructive text-destructive-foreground hover:bg-destructive">
        REJECTED
      </Badge>
    );
  }
  if (row.itemStatus === "PASSED") {
    return (
      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">PASSED</Badge>
    );
  }
  if (isVotingOpen(row)) {
    return (
      <Badge className="border-transparent bg-orange-500 text-white hover:bg-orange-500">
        VOTING OPEN
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="border-transparent">
      VOTING CLOSED
    </Badge>
  );
}

function TallyDonut({
  forCount,
  againstCount,
  nonVoters,
}: {
  forCount: number;
  againstCount: number;
  nonVoters: number;
}) {
  const slices = [
    { value: forCount, color: TALLY.for },
    { value: againstCount, color: TALLY.against },
    { value: nonVoters, color: TALLY.nonVoters },
  ].filter((s) => s.value > 0);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--muted)" strokeWidth="14" />
      {slices.map((slice, index) => {
        if (total === 0) return null;
        const dash = (slice.value / total) * circumference;
        const circle = (
          <circle
            key={`${slice.color}-${index}`}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={slice.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return circle;
      })}
    </svg>
  );
}

function Mark({ on }: { on: boolean }) {
  if (!on) return <span className="text-muted-foreground/40">—</span>;
  return <Check className="mx-auto size-4 text-emerald-600" strokeWidth={2.75} />;
}

function TallyRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="h-2 w-7 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
      <span className="font-semibold uppercase tracking-wide text-foreground">{label}:</span>
      <span className="tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

export function BallotCandidateCard({
  row,
  seats,
  busy,
  canVoteOnBehalf = false,
  onVote,
  onSetVoting,
  onMoveToSignatures,
}: {
  row: BallotItem;
  seats: Seat[];
  busy: boolean;
  canVoteOnBehalf?: boolean;
  onVote: (voteValue: "FOR" | "AGAINST", voterProfileId?: number) => void;
  onSetVoting: (open: boolean) => void;
  onMoveToSignatures: () => void;
}) {
  const { voted, votedIds, presentWaiting, notYetPresent } = voteTrace(row, seats);
  const voteById = new Map(voted.map((person) => [person.profileId, person.voteValue]));
  const votingOpen = isVotingOpen(row);
  const alreadyMoved = row.itemStatus === "PASSED";
  const feesOk = isFinanceFeesCleared(row);
  const canMove = row.canProceedToSignatures && !alreadyMoved && feesOk && !row.autoRejected;
  const photo = ballotPhotoUrl(row);
  const totalVoters = seats.length;
  const nonVoters = Math.max(totalVoters - row.votesCast, 0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [behalfProfileId, setBehalfProfileId] = useState("");
  const [behalfVote, setBehalfVote] = useState<"FOR" | "AGAINST" | "">("");

  const unvotedMembers = seats.filter((s) => s.present && !votedIds.has(s.profileId));
  const canOpenOptions =
    canVoteOnBehalf && votingOpen && !row.autoRejected && unvotedMembers.length > 0;

  function closeOptions() {
    setOptionsOpen(false);
    setBehalfProfileId("");
    setBehalfVote("");
  }

  function submitOnBehalf() {
    const profileId = Number(behalfProfileId);
    if (!profileId || (behalfVote !== "FOR" && behalfVote !== "AGAINST")) return;
    onVote(behalfVote, profileId);
    closeOptions();
  }

  return (
    <article className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Ballot - {row.applicantName}</h2>
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Applicant:</span>{" "}
            <span className="font-semibold">{row.applicantName}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.applicationNo}
            {row.itemStatus ? ` · ${row.itemStatus}` : ""}
          </p>
        </div>
        <Avatar className="size-14 border border-border">
          {photo ? <AvatarImage src={photo} alt="" /> : null}
          <AvatarFallback className="text-sm font-semibold">
            {applicantInitials(row.applicantName) || "—"}
          </AvatarFallback>
        </Avatar>
      </header>

      {row.autoRejected ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          2 adverse votes — excluded until {row.excludedUntil ?? "one year from today"}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(16rem,0.9fr)]">
        <Card className="shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Voting Progress</h3>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {totalVoters} Total
            </span>
            <VotingStatusBadge row={row} />
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {row.votesCast} Voted
            </span>
          </div>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Committee Voters</th>
                  <th className="w-16 px-2 py-2 text-center font-medium">Voted</th>
                  <th className="w-20 px-2 py-2 text-center font-medium">Unvoted</th>
                </tr>
              </thead>
              <tbody>
                {seats.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      No sitting Committee members.
                    </td>
                  </tr>
                ) : (
                  seats.map((seat) => {
                    const hasVoted = votedIds.has(seat.profileId);
                    return (
                      <tr key={seat.committeeMemberId} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          <span className={cn(!seat.present && "text-muted-foreground")}>{seat.name}</span>
                        </td>
                        <td className="px-2 py-2 text-center" title={voteById.get(seat.profileId) ?? undefined}>
                          <Mark on={hasVoted} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Mark on={!hasVoted} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Vote Tally &amp; Summary</h3>
          </div>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="grid gap-2.5">
              <TallyRow color={TALLY.for} label="For" value={row.forCount} />
              <TallyRow color={TALLY.against} label="Against" value={row.againstCount} />
              <TallyRow color={TALLY.voted} label="Voted" value={row.votesCast} />
              <TallyRow color={TALLY.nonVoters} label="Non-voters" value={nonVoters} />
            </div>
            <TallyDonut
              forCount={row.forCount}
              againstCount={row.againstCount}
              nonVoters={nonVoters}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">My Vote &amp; Actions</h3>
          </div>
          <CardContent className="grid gap-4 p-4">
            <div className="grid gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cast your vote
              </p>
              {row.myVoteCast ? (
                <p className="text-sm font-medium">Voted: YES · {row.myVoteValue}</p>
              ) : votingOpen && !row.autoRejected ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" disabled={busy} onClick={() => onVote("FOR")}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      FOR
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => onVote("AGAINST")}>
                      AGAINST
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">Voted: NO</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Voted: NO</p>
              )}
            </div>

            <div className="grid gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </p>
              {canVoteOnBehalf ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !canOpenOptions}
                  title={
                    !votingOpen
                      ? "Open voting first"
                      : unvotedMembers.length === 0
                        ? "Mark attendance first, or every present member has already voted"
                        : "Record a vote for a member who cannot use the portal or voted in person"
                  }
                  onClick={() => setOptionsOpen(true)}
                >
                  Voting options
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !canMove}
                title={
                  alreadyMoved
                    ? "Already moved to signatures"
                    : !row.canProceedToSignatures
                      ? "Available after more than 4 votes"
                      : !feesOk
                        ? "Finance must mark entrance and annual fees Paid first"
                        : undefined
                }
                onClick={onMoveToSignatures}
              >
                {busy && canMove ? <Loader2 className="size-4 animate-spin" /> : null}
                Moved to Signatures
              </Button>
              {canToggleVoting(row) ? (
                votingOpen ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onSetVoting(false)}
                  >
                    Close Voting
                  </Button>
                ) : (
                  <Button type="button" disabled={busy} onClick={() => onSetVoting(true)}>
                    Open Voting
                  </Button>
                )
              ) : (
                <Button type="button" variant="outline" disabled>
                  Close Voting
                </Button>
              )}
              {!feesOk && row.canProceedToSignatures ? (
                <p className="text-[11px] text-amber-900">
                  Finance must mark entrance and annual fees Paid before signatures.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {presentWaiting.length + notYetPresent.length > 0 && row.votesCast > 0 ? (
        <p className="text-xs text-muted-foreground">
          Waiting on {presentWaiting.length} present member
          {presentWaiting.length === 1 ? "" : "s"}
          {notYetPresent.length > 0
            ? ` · ${notYetPresent.length} still to be marked present`
            : ""}
          .
        </p>
      ) : null}

      <Dialog
        open={optionsOpen}
        onOpenChange={(open) => {
          if (!open) closeOptions();
          else setOptionsOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Voting options</DialogTitle>
            <DialogDescription>
              Record a vote for {row.applicantName} on behalf of a present Committee member who
              cannot use the portal or who voted in person. Mark attendance first if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <Label>Committee member</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={behalfProfileId}
                onChange={(e) => setBehalfProfileId(e.target.value)}
                disabled={busy}
              >
                <option value="">Select member…</option>
                {unvotedMembers.map((seat) => (
                  <option key={seat.committeeMemberId} value={seat.profileId}>
                    {seat.name}
                    {seat.roleName ? ` · ${seat.roleName}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1.5">
              <Label>Vote</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={behalfVote === "FOR" ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => setBehalfVote("FOR")}
                >
                  For
                </Button>
                <Button
                  type="button"
                  variant={behalfVote === "AGAINST" ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => setBehalfVote("AGAINST")}
                >
                  Against
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={closeOptions}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !behalfProfileId || !behalfVote}
              onClick={submitOnBehalf}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Record vote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
