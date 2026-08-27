import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

export type CommitteeBallotItem = {
  committeeBallotItemId: number;
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  applicationStatusCode?: string | null;
  itemStatus: string;
  forCount: number;
  againstCount: number;
  votesCast: number;
  committeeSize: number;
  quorumRequired: number;
  quorumMet: boolean;
  autoRejected: boolean;
  myVoteCast: boolean;
  myVoteValue?: string | null;
  canProceedToSignatures: boolean;
};

type BallotMeeting = {
  committeeMeetingId: number;
  meetingName: string;
  meetingDate: string;
  meetingTime?: string | null;
  status: string;
  committeeSize: number;
  quorumRequired: number;
  items: CommitteeBallotItem[];
};

type BallotCandidate = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  statusCode?: string | null;
  statusName?: string | null;
  alreadyLinked: boolean;
};

export function MeetingBallotPanel({
  meetingId,
  onChanged,
}: {
  meetingId: number;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const ballot = useQuery({
    queryKey: ["committee", "ballot", meetingId],
    queryFn: () => apiRequest<BallotMeeting>(`/api/committees/meetings/${meetingId}/ballot`),
  });

  const candidates = useQuery({
    queryKey: ["committee", "ballot-candidates", meetingId, search],
    queryFn: () =>
      apiRequest<BallotCandidate[]>(
        `/api/committees/meetings/${meetingId}/ballot-candidates?search=${encodeURIComponent(search.trim())}`,
      ),
    enabled: search.trim().length >= 2,
  });

  const attach = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/committees/meetings/${meetingId}/ballot`, {
        method: "POST",
        body: JSON.stringify({ applicationId }),
      }),
    onSuccess: () => {
      toast.success("Application attached to this ballot meeting.");
      setSearch("");
      void ballot.refetch();
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const vote = useMutation({
    mutationFn: ({ itemId, voteValue }: { itemId: number; voteValue: "FOR" | "AGAINST" }) =>
      apiRequest(`/api/committees/ballot/${itemId}/vote`, {
        method: "POST",
        body: JSON.stringify({ voteValue }),
      }),
    onSuccess: (row: CommitteeBallotItem) => {
      if (row.autoRejected) {
        toast.message("2 adverse votes reached — application auto-rejected");
      } else {
        toast.success("Vote recorded.");
      }
      void queryClient.invalidateQueries({ queryKey: ["committee", "ballot", meetingId] });
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const proceed = useMutation({
    mutationFn: (itemId: number) =>
      apiRequest(`/api/committees/ballot/${itemId}/signatures`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Passed — proceed to signature collection.");
      void ballot.refetch();
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const data = ballot.data;
  const busy = attach.isPending || vote.isPending || proceed.isPending;

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-semibold">Committee ballot / election</p>
        <p className="text-xs text-muted-foreground">
          Confidential Committee business (Article 6). One FOR/AGAINST vote per sitting member.
          Two AGAINST votes auto-reject and exclude the applicant for one year.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-[220px] flex-1 gap-1 text-xs text-muted-foreground">
          Attach temporary member
          <Input
            className="h-8"
            placeholder="Search name or APP no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {search.trim().length >= 2 ? (
        <ul className="divide-y rounded-lg border bg-background text-sm">
          {(candidates.data ?? []).length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No matching temporary members.</li>
          ) : (
            (candidates.data ?? []).map((row) => (
              <li key={row.applicationId} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  {row.applicantName}{" "}
                  <span className="text-muted-foreground">· {row.applicationNo}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || row.alreadyLinked}
                  onClick={() => attach.mutate(row.applicationId)}
                >
                  {row.alreadyLinked ? "Attached" : "Attach"}
                </Button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {ballot.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading ballot…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications attached to this ballot meeting yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Applicant</th>
                <th className="px-3 py-2">Quorum</th>
                <th className="px-3 py-2">FOR</th>
                <th className="px-3 py-2">AGAINST</th>
                <th className="px-3 py-2">Your vote</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.committeeBallotItemId} className="border-t align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.applicantName}</p>
                    <p className="text-xs text-muted-foreground">{row.applicationNo}</p>
                    {row.autoRejected ? (
                      <p className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        2 adverse votes reached — application auto-rejected
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.quorumMet ? "Met" : "Not met"} ({row.votesCast} of {row.committeeSize})
                  </td>
                  <td className="px-3 py-2">{row.forCount}</td>
                  <td className="px-3 py-2">{row.againstCount}</td>
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
                    {row.canProceedToSignatures ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => proceed.mutate(row.committeeBallotItemId)}
                      >
                        {proceed.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                        Proceed to signatures
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
