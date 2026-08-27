import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasAnyRole, readPortalMode, readUser } from "@/lib/auth";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

type Seat = {
  committeeMemberId: number;
  profileId: number;
  name: string;
  roleName: string;
  present: boolean;
};

type BallotPerson = {
  profileId: number;
  name: string;
  roleName: string;
  voteValue?: string | null;
  present?: boolean;
  kind?: string;
  dateElected?: string | null;
};

type BallotItem = {
  committeeBallotItemId: number;
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  applicationStatusCode?: string | null;
  itemStatus: string;
  forCount: number;
  againstCount: number;
  votesCast: number;
  quorumRequired: number;
  quorumMet: boolean;
  autoRejected: boolean;
  excludedUntil?: string | null;
  myVoteCast: boolean;
  myVoteValue?: string | null;
  canProceedToSignatures: boolean;
  committeeSignatures: number;
  gmSignatures: number;
  chairmanSigned: boolean;
  readyForChairman: boolean;
  appliedMembershipType?: string | null;
  voted?: BallotPerson[];
  Voted?: BallotPerson[];
  notVoted?: BallotPerson[];
  NotVoted?: BallotPerson[];
  signatures?: BallotPerson[];
  Signatures?: BallotPerson[];
  awaitingSignatures?: BallotPerson[];
  AwaitingSignatures?: BallotPerson[];
};

function peopleList(...candidates: unknown[]): BallotPerson[] {
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate.map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const pick = (...keys: string[]) => {
        for (const key of keys) {
          const value = row[key];
          if (value != null && String(value).trim() !== "") return value;
        }
        return undefined;
      };
      return {
        profileId: Number(pick("profileId", "ProfileId") ?? 0),
        name: String(pick("name", "Name") ?? ""),
        roleName: String(pick("roleName", "RoleName") ?? ""),
        voteValue: (pick("voteValue", "VoteValue") as string | undefined) ?? null,
        present: Boolean(pick("present", "Present") ?? false),
        kind: String(pick("kind", "Kind") ?? ""),
        dateElected: (pick("dateElected", "DateElected") as string | undefined) ?? null,
      };
    });
  }
  return [];
}

type Candidate = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  statusName?: string | null;
  alreadyLinked: boolean;
};

type Desk = {
  committeeMeetingId: number;
  meetingName: string;
  meetingDate: string;
  meetingTime?: string | null;
  status: string;
  committeeSize: number;
  quorumRequired: number;
  presentCount: number;
  meetingQuorumMet: boolean;
  deskMessage?: string | null;
  seats: Seat[];
  items: BallotItem[];
  pendingApplicants: Candidate[];
};

export function CommitteeBallotAdmissionPage() {
  const queryClient = useQueryClient();
  const user = readUser();
  const mode = readPortalMode(user);
  const memberView = mode === "member";
  const canChair = hasAnyRole(user, ["CHAIRMAN", "ADMIN"]);
  const canGm = hasAnyRole(user, ["GENERAL_MANAGER", "ADMIN"]);
  const [dateElected, setDateElected] = useState(kenyaTodayISO());
  const [membershipNumber, setMembershipNumber] = useState("");
  const [electedType, setElectedType] = useState<"FULL" | "COUNTRY" | "OVERSEAS" | "">("");
  const [presentIds, setPresentIds] = useState<number[] | null>(null);

  const desk = useQuery({
    queryKey: ["committee", "admission-ballot"],
    queryFn: () => apiRequest<Desk>("/api/committees/admission-ballot"),
  });

  const data = desk.data;
  const meetingId = data?.committeeMeetingId ?? 0;
  const seats = data?.seats ?? [];
  const checked = presentIds ?? seats.filter((s) => s.present).map((s) => s.committeeMemberId);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["committee", "admission-ballot"] });
    void queryClient.invalidateQueries({ queryKey: ["committee", "ballot"] });
  };

  const saveAttendance = useMutation({
    mutationFn: () =>
      apiRequest(`/api/committees/meetings/${meetingId}/attendance`, {
        method: "POST",
        body: JSON.stringify({ committeeMemberIds: checked }),
      }),
    onSuccess: () => {
      toast.success("Attendance saved.");
      setPresentIds(null);
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const attach = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/committees/meetings/${meetingId}/ballot`, {
        method: "POST",
        body: JSON.stringify({ applicationId }),
      }),
    onSuccess: () => {
      toast.success("Applicant added to this ballot.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const vote = useMutation({
    mutationFn: ({ itemId, voteValue }: { itemId: number; voteValue: "FOR" | "AGAINST" }) =>
      apiRequest(`/api/committees/ballot/${itemId}/vote`, {
        method: "POST",
        body: JSON.stringify({ voteValue }),
      }),
    onSuccess: (row: BallotItem) => {
      if (row.autoRejected) {
        toast.message(
          `2 adverse votes — excluded until ${row.excludedUntil ?? "one year from today"} (Article 6b).`,
        );
      } else {
        toast.success("Vote recorded.");
      }
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const proceed = useMutation({
    mutationFn: (itemId: number) =>
      apiRequest(`/api/committees/ballot/${itemId}/signatures`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Passed — collect 4 Committee signatures and the General Manager.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const sign = useMutation({
    mutationFn: ({
      itemId,
      kind,
    }: {
      itemId: number;
      kind: "COMMITTEE" | "GENERAL_MANAGER" | "CHAIRMAN";
    }) =>
      apiRequest(`/api/committees/ballot/${itemId}/sign`, {
        method: "POST",
        body: JSON.stringify({
          signatoryKind: kind,
          dateElected: kind === "CHAIRMAN" ? dateElected : undefined,
          membershipNumber: kind === "CHAIRMAN" ? membershipNumber.trim() : undefined,
          electedMembershipType: kind === "CHAIRMAN" ? electedType : undefined,
        }),
      }),
    onSuccess: (_d, vars) => {
      toast.success(
        vars.kind === "CHAIRMAN"
          ? "Chairman election recorded — membership number, date elected, and type assigned."
          : "Signature recorded.",
      );
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const busy =
    attach.isPending || vote.isPending || proceed.isPending || sign.isPending || saveAttendance.isPending;

  const toggleSeat = (id: number) => {
    setPresentIds((prev) => {
      const current = prev ?? checked;
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  };

  return (
    <PageFrame width="lg">
      <PageBackLink
        to={memberView ? "/" : "/admin"}
        label={memberView ? "Back to member dashboard" : "Back to admin dashboard"}
      />
      <PageHeader
        title="Committee Ballot"
        description="Confidential membership admission ballot (Article 6). Quorum is 7 Committee members present. Two adverse votes exclude the applicant for one year — this is not a majority vote."
      />

      {desk.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading admission ballot…</p>
      ) : data?.deskMessage && !meetingId ? (
        <p className="text-sm text-muted-foreground">{data.deskMessage}</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Unable to load the Committee Ballot.</p>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {data.meetingName} · {data.meetingDate}
                {data.meetingTime ? ` · ${data.meetingTime}` : ""}
              </CardTitle>
              <CardDescription>
                Meeting quorum: {data.presentCount} present of {data.quorumRequired} required (Article 6a).{" "}
                {data.meetingQuorumMet ? "Quorum met." : "Quorum not met."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-sm font-medium">Mark Committee members present</p>
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

          <Card>
            <CardHeader>
              <CardTitle>Pending applicants ready for ballot</CardTitle>
              <CardDescription>
                Already screened and interviewed, now on temporary-member / waitlist status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(data.pendingApplicants ?? []).filter((c) => !c.alreadyLinked).length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending applicants waiting for this ballot.</p>
              ) : (
                <ul className="divide-y rounded-lg border text-sm">
                  {data.pendingApplicants
                    .filter((c) => !c.alreadyLinked)
                    .map((row) => (
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

          <Card>
            <CardHeader>
              <CardTitle>Ballot per candidate</CardTitle>
              <CardDescription>
                One FOR or AGAINST per sitting member present. Two AGAINST votes auto-exclude (Article 6b).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.items.length === 0 ? (
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
                      {data.items.map((row) => {
                        const voted = peopleList(row.voted, row.Voted);
                        const notVoted = peopleList(row.notVoted, row.NotVoted);
                        const signatures = peopleList(row.signatures, row.Signatures);
                        const awaiting = peopleList(row.awaitingSignatures, row.AwaitingSignatures);
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
                            <p className="whitespace-nowrap">FOR {row.forCount} · AGAINST {row.againstCount}</p>
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
                                  onClick={() =>
                                    sign.mutate({ itemId: row.committeeBallotItemId, kind: "COMMITTEE" })
                                  }
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
                                      onChange={(e) =>
                                        setElectedType(e.target.value as "FULL" | "COUNTRY" | "OVERSEAS" | "")
                                      }
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
                                    disabled={
                                      busy ||
                                      !membershipNumber.trim() ||
                                      !dateElected ||
                                      !electedType
                                    }
                                    onClick={() =>
                                      sign.mutate({ itemId: row.committeeBallotItemId, kind: "CHAIRMAN" })
                                    }
                                  >
                                    Record Chairman election
                                  </Button>
                                </div>
                              ) : null}
                            </div>
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
        </div>
      )}
    </PageFrame>
  );
}
