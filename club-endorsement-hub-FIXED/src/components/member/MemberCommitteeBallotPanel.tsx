import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiRequest, extractErrorMessage } from "@/services/membership/api";

type BallotItem = {
  committeeBallotItemId: number;
  applicationNo: string;
  applicantName: string;
  itemStatus: string;
  autoRejected: boolean;
  excludedUntil?: string | null;
  myVoteCast: boolean;
  myVoteValue?: string | null;
};

type Desk = {
  committeeMeetingId: number;
  meetingName?: string;
  meetingDate?: string;
  quorumRequired: number;
  presentCount: number;
  meetingQuorumMet: boolean;
  deskMessage?: string | null;
  items: BallotItem[];
};

/** Confidential Article 6 admission ballot — sitting Committee members only. Not the AGM e-vote. */
export function MemberCommitteeBallotPanel() {
  const queryClient = useQueryClient();
  const desk = useQuery({
    queryKey: ["committee", "admission-ballot"],
    queryFn: () => apiRequest<Desk>("/api/committees/admission-ballot"),
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
      void queryClient.invalidateQueries({ queryKey: ["committee", "admission-ballot"] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const data = desk.data;
  const meetingId = data?.committeeMeetingId ?? 0;
  const forbidden =
    desk.error instanceof ApiError && (desk.error.status === 401 || desk.error.status === 403);

  if (forbidden) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ballot per candidate</CardTitle>
        <CardDescription>
          Confidential Committee admission ballot (Article 6) — not the AGM electronic vote. One FOR or AGAINST
          per sitting member present. Two adverse votes exclude the applicant for one year.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {desk.isLoading ? (
          <p className="text-muted-foreground">Loading admission ballot…</p>
        ) : data?.deskMessage && !meetingId ? (
          <p className="text-muted-foreground">{data.deskMessage}</p>
        ) : !data ? (
          <p className="text-muted-foreground">Unable to load the Committee Ballot.</p>
        ) : (
          <>
            <p>
              {data.meetingName ? `${data.meetingName} · ${data.meetingDate}. ` : ""}
              Meeting quorum: {data.presentCount} present of {data.quorumRequired} required (Article 6a).{" "}
              {data.meetingQuorumMet ? "Quorum met." : "Quorum not met — mark attendance in Admin if you cannot vote."}
            </p>
            {data.items.length === 0 ? (
              <p className="text-muted-foreground">No applicants on this meeting ballot yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Applicant</th>
                      <th className="px-3 py-2">Your vote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.committeeBallotItemId} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-medium">{row.applicantName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.applicationNo} · {row.itemStatus}
                          </p>
                          {row.autoRejected ? (
                            <p className="mt-1 text-xs text-destructive">
                              Excluded until {row.excludedUntil ?? "one year from today"}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {row.myVoteCast ? (
                            <span className="text-xs font-medium">{row.myVoteValue}</span>
                          ) : row.itemStatus === "OPEN" && !row.autoRejected ? (
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                disabled={vote.isPending}
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
                                disabled={vote.isPending}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
