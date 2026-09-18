import { Outlet } from "@tanstack/react-router";
import { Check, CheckCircle2, Clock, Loader2, PenLine } from "lucide-react";
import { useState, type ReactNode } from "react";

import { BallotCandidateCard } from "@/components/admin/BallotCandidateCard";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasAnyRole, readUser } from "@/lib/auth";
import { cn } from "@/utils/cn";

import {
  applicantInitials,
  isFinanceFeesCleared,
  peopleList,
  signaturesUnlocked,
  useAdmissionBallot,
  type AdmissionDesk,
  type BallotItem,
  type BallotPerson,
} from "./committeeBallotDesk";

function BallotMeetingBanner({ data }: { data: AdmissionDesk }) {
  return (
    <p className="text-sm text-muted-foreground">
      {data.meetingName} · {data.meetingDate}
      {data.meetingTime ? ` · ${data.meetingTime}` : ""} · Meeting quorum: {data.presentCount} present of{" "}
      {data.quorumRequired} required. {data.meetingQuorumMet ? "Quorum met." : "Quorum not met."}
    </p>
  );
}

function BallotLoadGate({
  children,
}: {
  children: (ballot: ReturnType<typeof useAdmissionBallot>) => ReactNode;
}) {
  const ballot = useAdmissionBallot();
  const { desk, data, meetingId } = ballot;
  if (desk.isLoading) {
    return <PageBodyLoading label="Loading admission ballot…" />;
  }
  if (data?.deskMessage && !meetingId) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-sm text-muted-foreground">
        {data.deskMessage}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-sm text-muted-foreground">
        Unable to load the Committee Ballot.
      </div>
    );
  }
  return <>{children(ballot)}</>;
}

export function CommitteeBallotLayout() {
  return (
    <PageFrame width="lg">
      <Outlet />
    </PageFrame>
  );
}

export function BallotAttendancePage() {
  return (
    <BallotLoadGate>
      {(ballot) => {
        const { data, seats, checked, busy, meetingId, saveAttendance, toggleSeat } = ballot;
        return (
          <Card>
            <CardHeader>
              <CardTitle>Mark Committee members present</CardTitle>
              <CardDescription>
                <BallotMeetingBanner data={data!} />
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ul className="divide-y rounded-lg border text-sm">
                {seats.length === 0 ? (
                  <li className="px-3 py-2 text-muted-foreground">No sitting Committee members.</li>
                ) : (
                  seats.map((seat) => (
                    <li key={seat.committeeMemberId} className="flex items-center gap-2 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked.includes(seat.committeeMemberId)}
                        onChange={() => toggleSeat(seat.committeeMemberId)}
                      />
                      <span>
                        {seat.name} · {seat.roleName}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <Button type="button" disabled={busy || !meetingId} onClick={() => saveAttendance.mutate()}>
                {saveAttendance.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save attendance
              </Button>
            </CardContent>
          </Card>
        );
      }}
    </BallotLoadGate>
  );
}

export function BallotPendingPage() {
  return (
    <BallotLoadGate>
      {(ballot) => {
        const { data, busy, attach } = ballot;
        const waiting = (data?.pendingApplicants ?? []).filter((c) => !c.alreadyLinked);
        return (
          <Card>
            <CardHeader>
              <CardTitle>Pending applicants ready for ballot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <BallotMeetingBanner data={data!} />
              {waiting.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending applicants waiting for this ballot.</p>
              ) : (
                <ul className="divide-y rounded-lg border text-sm">
                  {waiting.map((row) => (
                    <li key={row.applicationId} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span>
                        {row.applicantName} · {row.applicationNo}
                        {row.statusName ? ` · ${row.statusName}` : ""}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => attach.mutate(row.applicationId)}
                      >
                        Add to ballot
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      }}
    </BallotLoadGate>
  );
}

function InterviewDetailsCard({ data }: { data: AdmissionDesk }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Interview Details</CardTitle>
          <CardDescription className="mt-0.5">{data.meetingName}</CardDescription>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            data.meetingQuorumMet ? "bg-emerald-600 text-white" : "bg-amber-600 text-white",
          )}
        >
          {data.meetingQuorumMet ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
          {data.meetingQuorumMet ? "Quorum Met" : "Quorum Not Met"}
        </span>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</dt>
            <dd className="mt-1 text-sm font-semibold">{data.meetingDate}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Time</dt>
            <dd className="mt-1 text-sm font-semibold">{data.meetingTime || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quorum</dt>
            <dd className="mt-1 text-sm font-semibold">
              ({data.presentCount} of {data.quorumRequired} required)
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function BallotCandidatesPage() {
  return (
    <BallotLoadGate>
      {(ballot) => {
        const { data, seats, busy, vote, setVoting, proceed } = ballot;
        const items = data?.items ?? [];
        return (
          <div className="grid gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Ballot</h1>

            <InterviewDetailsCard data={data!} />

            {seats.filter((s) => s.present).length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                No members are marked present yet. Mark attendance first so the vote list shows who
                may cast a ballot.
              </p>
            ) : null}

            {items.length === 0 ? (
              <Card>
                <CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No applicants on this meeting ballot yet. Add them from Pending applicants.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {items.map((row) => (
                  <BallotCandidateCard
                    key={row.committeeBallotItemId}
                    row={row}
                    seats={seats}
                    busy={busy}
                    onVote={(voteValue) =>
                      vote.mutate({ itemId: row.committeeBallotItemId, voteValue })
                    }
                    onSetVoting={(open) =>
                      setVoting.mutate({ itemId: row.committeeBallotItemId, open })
                    }
                    onMoveToSignatures={() => proceed.mutate(row.committeeBallotItemId)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      }}
    </BallotLoadGate>
  );
}

function kindLabel(kind?: string) {
  if (kind === "GENERAL_MANAGER") return "GM";
  if (kind === "CHAIRMAN") return "Chairman";
  return "Committee";
}

function QuorumBanner({ data }: { data: AdmissionDesk }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
        data.meetingQuorumMet
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-amber-200 bg-amber-50 text-amber-950",
      )}
    >
      <p className="text-sm">
        <span className="font-medium">{data.meetingName}</span>
        {": "}
        {data.meetingDate}
        {data.meetingTime ? ` ${data.meetingTime}` : ""}. Quorum Status:{" "}
        {data.meetingQuorumMet ? "Met" : "Not met"} ({data.presentCount}/{data.quorumRequired} Required)
      </p>
      <span
        className={cn(
          "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
          data.meetingQuorumMet ? "bg-emerald-600 text-white" : "bg-amber-600 text-white",
        )}
      >
        {data.meetingQuorumMet ? "Quorum Met" : "Quorum Not Met"}
      </span>
    </div>
  );
}

function AssignMembershipModal({
  open,
  onOpenChange,
  row,
  busy,
  dateElected,
  setDateElected,
  membershipNumber,
  setMembershipNumber,
  electedType,
  setElectedType,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: BallotItem | null;
  busy: boolean;
  dateElected: string;
  setDateElected: (v: string) => void;
  membershipNumber: string;
  setMembershipNumber: (v: string) => void;
  electedType: "FULL" | "COUNTRY" | "OVERSEAS" | "";
  setElectedType: (v: "FULL" | "COUNTRY" | "OVERSEAS" | "") => void;
  onConfirm: () => void;
}) {
  if (!row) return null;
  const ready =
    isFinanceFeesCleared(row) && membershipNumber.trim() && dateElected && electedType && !busy;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign membership</DialogTitle>
          <DialogDescription>
            Record the Chairman election for {row.applicantName} ({row.applicationNo}).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          {row.appliedMembershipType ? (
            <p className="text-sm text-muted-foreground">
              Applied as {row.appliedMembershipType}. Chairman may elect a different category.
            </p>
          ) : null}
          {!isFinanceFeesCleared(row) ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Finance must mark entrance and annual fees Paid before assigning a membership number.
            </p>
          ) : null}
          <label className="grid gap-1 text-sm">
            <Label>Membership number</Label>
            <Input
              value={membershipNumber}
              onChange={(e) => setMembershipNumber(e.target.value)}
              placeholder="Assigned by Chairman"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <Label>Date Elected</Label>
            <Input type="date" value={dateElected} onChange={(e) => setDateElected(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <Label>Elected membership type</Label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={electedType}
              onChange={(e) => setElectedType(e.target.value as "FULL" | "COUNTRY" | "OVERSEAS" | "")}
            >
              <option value="">Select…</option>
              <option value="FULL">Full</option>
              <option value="COUNTRY">Country</option>
              <option value="OVERSEAS">Overseas</option>
            </select>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!ready} onClick={onConfirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Record Chairman election
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmSignModal({
  open,
  onOpenChange,
  row,
  kind,
  busy,
  signerName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: BallotItem | null;
  kind: "COMMITTEE" | "GENERAL_MANAGER" | null;
  busy: boolean;
  signerName: string;
  onConfirm: () => void;
}) {
  if (!row || !kind) return null;
  const title = kind === "GENERAL_MANAGER" ? "Sign as General Manager" : "Sign as Committee Member";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Confirm your signature for {row.applicantName} ({row.applicationNo}). The time of signing
            will be recorded on this ballot.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 px-3 py-3 text-sm">
          <p>
            <span className="text-muted-foreground">Signing as</span>{" "}
            <span className="font-medium">{signerName || "Current user"}</span>
          </p>
          <p className="mt-1">
            <span className="text-muted-foreground">Role</span>{" "}
            <span className="font-medium">{kindLabel(kind)}</span>
          </p>
          <p className="mt-1 text-muted-foreground">
            Progress after this signature: Committee {row.committeeSignatures}
            {kind === "COMMITTEE" ? "+1" : ""}/4 · GM {row.gmSignatures}
            {kind === "GENERAL_MANAGER" ? "+1" : ""}/1
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
            Confirm signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignaturePersonRow({
  person,
  mode,
}: {
  person: BallotPerson;
  mode: "signed" | "pending";
}) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          mode === "signed" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
        )}
      >
        {mode === "signed" ? <Check className="size-3.5" strokeWidth={2.5} /> : <Clock className="size-3.5" />}
      </span>
      <span className="min-w-0">
        <span className="font-medium text-foreground">{person.name || "Pending"}</span>
        {person.roleName ? (
          <span className="text-muted-foreground"> · {person.roleName}</span>
        ) : null}
        <span className="text-muted-foreground"> ({kindLabel(person.kind)})</span>
        {mode === "signed" && person.signedAt ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{person.signedAt}</span>
        ) : null}
        {mode === "signed" && person.dateElected ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Date Elected {person.dateElected}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function SignatureApplicantCard({
  row,
  busy,
  canChair,
  canGm,
  onPass,
  onRequestSign,
  onAssign,
}: {
  row: BallotItem;
  busy: boolean;
  canChair: boolean;
  canGm: boolean;
  onPass: () => void;
  onRequestSign: (kind: "COMMITTEE" | "GENERAL_MANAGER") => void;
  onAssign: () => void;
}) {
  const signatures = peopleList(row.signatures, row.Signatures);
  const awaiting = peopleList(row.awaitingSignatures, row.AwaitingSignatures);
  const complete = row.chairmanSigned && awaiting.length === 0;
  const feesOk = isFinanceFeesCleared(row);
  const canCommitteeSign = row.itemStatus === "PASSED" && row.committeeSignatures < 4;
  const canGmSign = row.itemStatus === "PASSED" && canGm && row.gmSignatures < 1;
  const chairmanDate =
    signatures.find((s) => s.kind === "CHAIRMAN" && s.dateElected)?.dateElected ?? null;

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {applicantInitials(row.applicantName) || "—"}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold tracking-tight">{row.applicantName}</h3>
              {row.itemStatus === "PASSED" ? (
                <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
                  PASSED
                </Badge>
              ) : (
                <Badge variant="secondary">{row.itemStatus}</Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {row.applicationNo}
              {chairmanDate ? ` · Date Elected ${chairmanDate}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Committee {row.committeeSignatures}/4 · GM {row.gmSignatures}/1
              {row.chairmanSigned ? " · Chairman recorded" : ""}
            </p>
          </div>
        </div>
        {complete ? (
          <Badge variant="secondary" className="rounded-full px-3">
            Complete
          </Badge>
        ) : null}
      </div>

      {!feesOk && (row.canProceedToSignatures || row.itemStatus === "PASSED") ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Ask Finance to mark entrance and annual fees as Paid before signatures and membership number.
        </p>
      ) : null}

      {!signaturesUnlocked(row) && row.itemStatus !== "PASSED" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Signatures open after more than 4 members have voted (currently {row.votesCast}).
        </p>
      ) : (
        <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Signed ({signatures.length})
            </p>
            {signatures.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No signatures yet.</p>
            ) : (
              <ul className="mt-2 space-y-2.5">
                {signatures.map((s) => (
                  <SignaturePersonRow
                    key={`${row.committeeBallotItemId}-s-${s.profileId}-${s.kind}`}
                    person={s}
                    mode="signed"
                  />
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {complete ? "Still needed" : `Pending (${awaiting.length})`}
            </p>
            {complete ? (
              <p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
                Fully Signed
              </p>
            ) : awaiting.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Pass to signatures to open the signatory list.
              </p>
            ) : (
              <ul className="mt-2 space-y-2.5">
                {awaiting.map((s) => (
                  <SignaturePersonRow
                    key={`${row.committeeBallotItemId}-a-${s.profileId}-${s.kind}`}
                    person={s}
                    mode="pending"
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!complete ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {row.canProceedToSignatures ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !feesOk}
              onClick={onPass}
            >
              Pass to signatures
            </Button>
          ) : null}
          {canCommitteeSign ? (
            <Button
              type="button"
              disabled={busy || !feesOk}
              onClick={() => onRequestSign("COMMITTEE")}
            >
              <PenLine className="size-4" />
              Sign Ballot as Committee Member
            </Button>
          ) : null}
          {canGmSign ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !feesOk}
              onClick={() => onRequestSign("GENERAL_MANAGER")}
            >
              <PenLine className="size-4" />
              Sign as General Manager
            </Button>
          ) : null}
          {row.readyForChairman && canChair ? (
            <Button type="button" disabled={busy || !feesOk} onClick={onAssign}>
              Assign membership
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function isBallotFullySigned(row: BallotItem) {
  if (!row.chairmanSigned) return false;
  const awaiting = peopleList(row.awaitingSignatures, row.AwaitingSignatures);
  return awaiting.length === 0;
}

function SignaturesEmptyState({
  title,
  description,
  icon = "caught-up",
}: {
  title: string;
  description: string;
  icon?: "caught-up" | "idle";
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full",
            icon === "caught-up" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
          )}
        >
          {icon === "caught-up" ? (
            <CheckCircle2 className="size-7" strokeWidth={1.75} />
          ) : (
            <PenLine className="size-7" strokeWidth={1.75} />
          )}
        </span>
        <div className="max-w-md space-y-1">
          <p className="text-base font-semibold tracking-tight">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function BallotSignaturesPage() {
  const user = readUser();
  const canChair = hasAnyRole(user, ["CHAIRMAN", "ADMIN"]);
  const canGm = hasAnyRole(user, ["GENERAL_MANAGER", "ADMIN"]);
  const [assignItemId, setAssignItemId] = useState<number | null>(null);
  const [signRequest, setSignRequest] = useState<{
    itemId: number;
    kind: "COMMITTEE" | "GENERAL_MANAGER";
  } | null>(null);

  return (
    <BallotLoadGate>
      {(ballot) => {
        const {
          data,
          busy,
          proceed,
          sign,
          dateElected,
          setDateElected,
          membershipNumber,
          setMembershipNumber,
          electedType,
          setElectedType,
        } = ballot;
        const items = (data?.items ?? []).filter(
          (row) =>
            signaturesUnlocked(row) ||
            row.itemStatus === "PASSED" ||
            row.canProceedToSignatures ||
            row.committeeSignatures > 0 ||
            row.gmSignatures > 0,
        );
        const pending = items.filter((row) => !isBallotFullySigned(row));
        const completed = items.filter((row) => isBallotFullySigned(row));
        const assignRow = items.find((r) => r.committeeBallotItemId === assignItemId) ?? null;
        const signRow = items.find((r) => r.committeeBallotItemId === signRequest?.itemId) ?? null;
        const signerName = user?.fullName?.trim() || user?.email || "Current user";

        const renderCards = (rows: BallotItem[]) => (
          <div className="grid gap-4">
            {rows.map((row) => (
              <SignatureApplicantCard
                key={row.committeeBallotItemId}
                row={row}
                busy={busy}
                canChair={canChair}
                canGm={canGm}
                onPass={() => proceed.mutate(row.committeeBallotItemId)}
                onRequestSign={(kind) =>
                  setSignRequest({ itemId: row.committeeBallotItemId, kind })
                }
                onAssign={() => setAssignItemId(row.committeeBallotItemId)}
              />
            ))}
          </div>
        );

        return (
          <div className="grid gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Signatures</h1>
            </div>

            <QuorumBanner data={data!} />

            {items.length === 0 ? (
              <SignaturesEmptyState
                icon="idle"
                title="No signature work yet"
                description="Complete voting on Ballot per candidate first (more than 4 votes), then return here to collect signatures."
              />
            ) : (
              <Tabs defaultValue="pending" className="gap-0">
                <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-muted/80 p-1 sm:w-auto">
                  <TabsTrigger
                    value="pending"
                    className="rounded-lg px-3 py-2 data-[state=active]:shadow-sm"
                  >
                    Pending signatures
                    <span className="ml-2 rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                      {pending.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="rounded-lg px-3 py-2 data-[state=active]:shadow-sm"
                  >
                    Completed / History
                    <span className="ml-2 rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                      {completed.length}
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="mt-4">
                  {pending.length === 0 ? (
                    <SignaturesEmptyState
                      title="You're all caught up."
                      description=""
                    />
                  ) : (
                    renderCards(pending)
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {completed.length === 0 ? (
                    <SignaturesEmptyState
                      icon="idle"
                      title="No completed ballots yet"
                      description="When a candidate is fully signed and membership is assigned, the record moves here for audit."
                    />
                  ) : (
                    renderCards(completed)
                  )}
                </TabsContent>
              </Tabs>
            )}

            <ConfirmSignModal
              open={signRequest != null}
              onOpenChange={(next) => {
                if (!next) setSignRequest(null);
              }}
              row={signRow}
              kind={signRequest?.kind ?? null}
              busy={busy}
              signerName={signerName}
              onConfirm={() => {
                if (!signRequest) return;
                sign.mutate(
                  { itemId: signRequest.itemId, kind: signRequest.kind },
                  { onSuccess: () => setSignRequest(null) },
                );
              }}
            />

            <AssignMembershipModal
              open={assignItemId != null}
              onOpenChange={(next) => {
                if (!next) setAssignItemId(null);
              }}
              row={assignRow}
              busy={busy}
              dateElected={dateElected}
              setDateElected={setDateElected}
              membershipNumber={membershipNumber}
              setMembershipNumber={setMembershipNumber}
              electedType={electedType}
              setElectedType={setElectedType}
              onConfirm={() => {
                if (!assignRow) return;
                sign.mutate(
                  { itemId: assignRow.committeeBallotItemId, kind: "CHAIRMAN" },
                  { onSuccess: () => setAssignItemId(null) },
                );
              }}
            />
          </div>
        );
      }}
    </BallotLoadGate>
  );
}

/** @deprecated Use the split ballot routes. Kept so older imports still type-check. */
export function CommitteeBallotAdmissionPage() {
  return <BallotAttendancePage />;
}
