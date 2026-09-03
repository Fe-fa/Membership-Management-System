import { Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasAnyRole, readUser } from "@/lib/auth";

import {
  peopleList,
  signaturesUnlocked,
  useAdmissionBallot,
  type AdmissionDesk,
  type BallotItem,
} from "./committeeBallotDesk";

function BallotMeetingBanner({ data }: { data: AdmissionDesk }) {
  return (
    <p className="text-sm text-muted-foreground">
      {data.meetingName} · {data.meetingDate}
      {data.meetingTime ? ` · ${data.meetingTime}` : ""} · Meeting quorum: {data.presentCount} present of{" "}
      {data.quorumRequired} required (Article 6a). {data.meetingQuorumMet ? "Quorum met." : "Quorum not met."}
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
    return <p className="text-sm text-muted-foreground">Loading admission ballot…</p>;
  }
  if (data?.deskMessage && !meetingId) {
    return <p className="text-sm text-muted-foreground">{data.deskMessage}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Unable to load the Committee Ballot.</p>;
  }
  return <>{children(ballot)}</>;
}

export function CommitteeBallotLayout() {
  return (
    <PageFrame width="lg">
      <PageHeader
        title="Committee Ballot"
        description="Confidential membership admission ballot (Article 6). Quorum is 7 Committee members present. Two adverse votes exclude the applicant for one year — this is not a majority vote."
      />
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
              <CardDescription>
                Already screened and interviewed, now on temporary-member / waitlist status.
              </CardDescription>
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

function CandidateSignatures({
  row,
  busy,
  canChair,
  canGm,
  proceed,
  sign,
  dateElected,
  setDateElected,
  membershipNumber,
  setMembershipNumber,
  electedType,
  setElectedType,
}: {
  row: BallotItem;
  busy: boolean;
  canChair: boolean;
  canGm: boolean;
  proceed: ReturnType<typeof useAdmissionBallot>["proceed"];
  sign: ReturnType<typeof useAdmissionBallot>["sign"];
  dateElected: string;
  setDateElected: (v: string) => void;
  membershipNumber: string;
  setMembershipNumber: (v: string) => void;
  electedType: "FULL" | "COUNTRY" | "OVERSEAS" | "";
  setElectedType: (v: "FULL" | "COUNTRY" | "OVERSEAS" | "") => void;
}) {
  if (!signaturesUnlocked(row)) {
    return (
      <p className="text-xs text-muted-foreground">
        Signatures open after more than 4 members have voted (currently {row.votesCast}).
      </p>
    );
  }

  const signatures = peopleList(row.signatures, row.Signatures);
  const awaiting = peopleList(row.awaitingSignatures, row.AwaitingSignatures);

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Committee {row.committeeSignatures}/4 · GM {row.gmSignatures}/1
        {row.chairmanSigned ? " · Date Elected signed" : ""}
      </p>
      {signatures.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-medium">Signed</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {signatures.map((s) => (
              <li key={`${row.committeeBallotItemId}-s-${s.profileId}-${s.kind}`}>
                {s.name} · {s.roleName}
                {s.kind === "GENERAL_MANAGER"
                  ? " (GM)"
                  : s.kind === "CHAIRMAN"
                    ? ` (Chairman${s.dateElected ? ` · Date Elected ${s.dateElected}` : ""})`
                    : " (Committee)"}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No signatures yet.</p>
      )}
      {awaiting.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-medium">Still needed</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {awaiting.map((s) => (
              <li key={`${row.committeeBallotItemId}-a-${s.profileId}-${s.kind}`}>
                {s.name} · {s.roleName}
                {s.kind === "GENERAL_MANAGER"
                  ? " (GM)"
                  : s.kind === "CHAIRMAN"
                    ? " (Chairman Date Elected)"
                    : " (Committee)"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1">
        {row.canProceedToSignatures ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => proceed.mutate(row.committeeBallotItemId)}
          >
            Pass to signatures
          </Button>
        ) : null}
        {row.itemStatus === "PASSED" && row.committeeSignatures < 4 ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => sign.mutate({ itemId: row.committeeBallotItemId, kind: "COMMITTEE" })}
          >
            Committee sign
          </Button>
        ) : null}
        {row.itemStatus === "PASSED" && canGm && row.gmSignatures < 1 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              sign.mutate({
                itemId: row.committeeBallotItemId,
                kind: "GENERAL_MANAGER",
              })
            }
          >
            GM sign
          </Button>
        ) : null}
        {row.readyForChairman && canChair ? (
          <div className="mt-2 grid max-w-xs gap-2">
            {row.appliedMembershipType ? (
              <p className="text-xs text-muted-foreground">
                Applied as {row.appliedMembershipType}. Chairman may elect a different category.
              </p>
            ) : null}
            <label className="grid gap-1 text-xs">
              <Label>Membership number</Label>
              <Input
                className="h-8"
                value={membershipNumber}
                onChange={(e) => setMembershipNumber(e.target.value)}
                placeholder="Assigned by Chairman"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <Label>Date Elected</Label>
              <Input
                type="date"
                className="h-8"
                value={dateElected}
                onChange={(e) => setDateElected(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <Label>Elected membership type</Label>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={electedType}
                onChange={(e) => setElectedType(e.target.value as "FULL" | "COUNTRY" | "OVERSEAS" | "")}
              >
                <option value="">Select…</option>
                <option value="FULL">Full</option>
                <option value="COUNTRY">Country</option>
                <option value="OVERSEAS">Overseas</option>
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              disabled={busy || !membershipNumber.trim() || !dateElected || !electedType}
              onClick={() => sign.mutate({ itemId: row.committeeBallotItemId, kind: "CHAIRMAN" })}
            >
              Record Chairman election
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function BallotCandidatesPage() {
  const user = readUser();
  const canChair = hasAnyRole(user, ["CHAIRMAN", "ADMIN"]);
  const canGm = hasAnyRole(user, ["GENERAL_MANAGER", "ADMIN"]);

  return (
    <BallotLoadGate>
      {(ballot) => {
        const {
          data,
          busy,
          vote,
          proceed,
          sign,
          dateElected,
          setDateElected,
          membershipNumber,
          setMembershipNumber,
          electedType,
          setElectedType,
        } = ballot;
        const items = data?.items ?? [];
        return (
          <Card>
            <CardHeader>
              <CardTitle>Ballot per candidate</CardTitle>
              <CardDescription>
                One FOR or AGAINST per sitting member present. Two AGAINST votes auto-exclude (Article 6b).
                Signatures appear after more than 4 members have voted.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <BallotMeetingBanner data={data!} />
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No applicants on this meeting ballot yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Applicant</th>
                        <th className="px-3 py-2">Votes</th>
                        <th className="px-3 py-2">Your vote</th>
                        <th className="px-3 py-2">Signatures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => {
                        const voted = peopleList(row.voted, row.Voted);
                        const notVoted = peopleList(row.notVoted, row.NotVoted);
                        return (
                          <tr key={row.committeeBallotItemId} className="border-t align-top">
                            <td className="px-3 py-2">
                              <p className="font-medium">{row.applicantName}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.applicationNo} · {row.itemStatus}
                              </p>
                              {row.autoRejected ? (
                                <p className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                                  2 adverse votes — excluded until {row.excludedUntil ?? "one year from today"}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
                              <p className="whitespace-nowrap">
                                FOR {row.forCount} · AGAINST {row.againstCount}
                              </p>
                              <p className="mt-2 text-xs font-medium">Voted</p>
                              {voted.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No votes yet.</p>
                              ) : (
                                <ul className="mt-1 space-y-0.5 text-xs">
                                  {voted.map((v) => (
                                    <li key={`${row.committeeBallotItemId}-v-${v.profileId}`}>
                                      {v.name}
                                      {v.roleName ? ` · ${v.roleName}` : ""} — {v.voteValue ?? "—"}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <p className="mt-2 text-xs font-medium">Not voted</p>
                              {notVoted.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  {voted.length > 0 ? "Everyone present has voted." : "No sitting members listed."}
                                </p>
                              ) : (
                                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                  {notVoted.map((v) => (
                                    <li key={`${row.committeeBallotItemId}-nv-${v.profileId}`}>
                                      {v.name}
                                      {v.roleName ? ` · ${v.roleName}` : ""}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {row.myVoteCast ? (
                                <span className="text-xs font-medium">{row.myVoteValue}</span>
                              ) : row.itemStatus === "OPEN" && !row.autoRejected ? (
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() =>
                                      vote.mutate({ itemId: row.committeeBallotItemId, voteValue: "FOR" })
                                    }
                                  >
                                    FOR
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                      vote.mutate({ itemId: row.committeeBallotItemId, voteValue: "AGAINST" })
                                    }
                                  >
                                    AGAINST
                                  </Button>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <CandidateSignatures
                                row={row}
                                busy={busy}
                                canChair={canChair}
                                canGm={canGm}
                                proceed={proceed}
                                sign={sign}
                                dateElected={dateElected}
                                setDateElected={setDateElected}
                                membershipNumber={membershipNumber}
                                setMembershipNumber={setMembershipNumber}
                                electedType={electedType}
                                setElectedType={setElectedType}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      }}
    </BallotLoadGate>
  );
}

/** @deprecated Use the split ballot routes. Kept so older imports still type-check. */
export function CommitteeBallotAdmissionPage() {
  return <BallotAttendancePage />;
}
