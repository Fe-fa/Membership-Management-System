import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, Lock, PenLine, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

type Notice = {
  generalMeetingId: number;
  meetingType: string;
  meetingDate: string;
  venue?: string | null;
  agenda?: string | null;
  status: string;
};

type AgendaTally = {
  agendaItemId: number;
  subject: string;
  isSpecialBusiness: boolean;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  votesCast: number;
};

type Desk = {
  meeting: Notice;
  resultDeclaredAt?: string | null;
  resultSummary?: string | null;
};

type Minutes = {
  generalMeetingId: number;
  meeting: Notice;
  proceedings?: string | null;
  status: string;
  recordedByName?: string | null;
  recordedAt?: string | null;
  signedByName?: string | null;
  signedAt?: string | null;
  resultDeclaredAt?: string | null;
  resultSummary?: string | null;
  agenda: AgendaTally[];
  canEdit: boolean;
  canSign: boolean;
};

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

function InfoTip({ text }: { text: string }) {
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

function FieldLabel({ children, tip }: { children: string; tip?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium leading-none">
      {children}
      {tip ? <InfoTip text={tip} /> : null}
    </span>
  );
}

function outcomeLabel(row: AgendaTally) {
  if (row.forCount > row.againstCount) return "Carried";
  if (row.againstCount > row.forCount) return "Not carried";
  return "Tied";
}

export function MeetingMinutesPage() {
  const queryClient = useQueryClient();
  const [proceedings, setProceedings] = useState("");
  const [confirmSign, setConfirmSign] = useState(false);

  const desk = useQuery({
    queryKey: ["elections", "desk"],
    queryFn: () => apiRequest<Desk[]>("/api/elections"),
  });
  const meetings = desk.data ?? [];
  const meetingId =
    meetings.find((row) => {
      const status = (row.meeting.status ?? "").toUpperCase();
      return status !== "HELD" && status !== "CANCELLED";
    })?.meeting.generalMeetingId ?? meetings[0]?.meeting.generalMeetingId;

  const minutes = useQuery({
    queryKey: ["elections", "minutes", meetingId],
    queryFn: () => apiRequest<Minutes>(`/api/elections/meetings/${meetingId}/minutes`),
    enabled: Boolean(meetingId),
  });

  useEffect(() => {
    if (minutes.data) setProceedings(minutes.data.proceedings ?? "");
  }, [minutes.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["elections"] });
  };

  const saveDraft = useMutation({
    mutationFn: () =>
      apiRequest<Minutes>(`/api/elections/meetings/${meetingId}/minutes`, {
        method: "PUT",
        body: JSON.stringify({ proceedings }),
      }),
    onSuccess: () => {
      toast.success("Draft minutes saved.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const sign = useMutation({
    mutationFn: () =>
      apiRequest<Minutes>(`/api/elections/meetings/${meetingId}/minutes/sign`, {
        method: "POST",
        body: JSON.stringify({ proceedings }),
      }),
    onSuccess: () => {
      setConfirmSign(false);
      toast.success("Minutes signed. The record is now locked.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const current = minutes.data;
  const signed = (current?.status ?? "DRAFT").toUpperCase() === "SIGNED";
  const canEdit = Boolean(current?.canEdit);
  const canSign = Boolean(current?.canSign);
  const declared = Boolean(current?.resultDeclaredAt);
  const agenda = current?.agenda ?? [];

  return (
    <TooltipProvider delayDuration={200}>
      <PageFrame width="lg">
        <PageBackLink to="/admin" label="Back to admin dashboard" />
        <PageHeader title="Meeting minutes" />

        <div className="grid gap-4">
          {desk.isLoading ? (
            <PageBodyLoading label="Loading meeting minutes…" />
          ) : desk.isError ? (
            <p className="text-sm text-destructive">{extractErrorMessage(desk.error)}</p>
          ) : !meetingId ? (
            <p className="text-sm text-muted-foreground">No general meeting published yet.</p>
          ) : minutes.isLoading ? (
            <PageBodyLoading label="Loading meeting minutes…" />
          ) : minutes.isError ? (
            <p className="text-sm text-destructive">{extractErrorMessage(minutes.error)}</p>
          ) : current ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>
                      {current.meeting.meetingType} · {current.meeting.meetingDate}
                      {current.meeting.venue ? ` · ${current.meeting.venue}` : ""}
                    </CardTitle>
                    <CardDescription>
                      Record what was discussed after voting, separate from the raw tally.
                    </CardDescription>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold text-white",
                      signed ? "bg-emerald-700" : "bg-amber-600",
                    )}
                  >
                    {signed ? "Signed" : "Draft"}
                  </span>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{current.meeting.agenda || "No agenda text yet."}</p>
                  {current.resultSummary ? (
                    <p className="rounded-md border bg-muted/40 px-3 py-2">{current.resultSummary}</p>
                  ) : (
                    <p className="text-muted-foreground">
                      Vote results have not been declared yet. Minutes can be drafted; signing waits until the
                      Chairman declares the result.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Proceedings
                    <InfoTip text="Write up what was discussed, questions members raised, and any amendments proposed before voting. This sits beside the declared tally, not instead of it." />
                  </CardTitle>
                  <CardDescription>
                    Narrative of the meeting — discussion, questions and amendments — kept separate from the vote
                    count.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {canEdit ? (
                    <label className="grid gap-1 text-sm">
                      <FieldLabel>What happened at the meeting</FieldLabel>
                      <Textarea
                        value={proceedings}
                        onChange={(e) => setProceedings(e.target.value)}
                        rows={10}
                        placeholder="Record the proceedings of the meeting…"
                      />
                      <span className="text-xs text-muted-foreground">{proceedings.length} characters</span>
                    </label>
                  ) : (
                    <p className="min-h-[8rem] whitespace-pre-wrap rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                      {proceedings || "No proceedings recorded."}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1 text-sm">
                      <span className="font-medium">Recorded by</span>
                      <p className="rounded-md border border-input bg-muted/40 px-3 py-2">
                        {current.recordedByName ?? "—"}
                      </p>
                    </div>
                    <div className="grid gap-1 text-sm">
                      <span className="font-medium">Recorded at</span>
                      <p className="rounded-md border border-input bg-muted/40 px-3 py-2">
                        {formatWhen(current.recordedAt)}
                      </p>
                    </div>
                  </div>
                  {signed ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1 text-sm">
                        <span className="font-medium">Signed by</span>
                        <p className="rounded-md border border-input bg-muted/40 px-3 py-2">
                          {current.signedByName ?? "—"}
                        </p>
                      </div>
                      <div className="grid gap-1 text-sm">
                        <span className="font-medium">Signed at</span>
                        <p className="rounded-md border border-input bg-muted/40 px-3 py-2">
                          {formatWhen(current.signedAt)}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {signed ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock className="size-3.5" />
                      These minutes have been signed and can no longer be edited.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        disabled={saveDraft.isPending || !canEdit}
                        onClick={() => saveDraft.mutate()}
                      >
                        {saveDraft.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        Save draft
                      </Button>
                      {canSign ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={sign.isPending || proceedings.trim().length < 3 || !declared}
                          onClick={() => setConfirmSign(true)}
                        >
                          <PenLine className="size-4" />
                          Sign as chairman
                        </Button>
                      ) : null}
                      {canSign && !declared ? (
                        <p className="w-full text-xs text-muted-foreground">
                          Sign as chairman is available after the result is declared on the Election desk.
                        </p>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Declared vote outcome
                    <InfoTip text="These figures are taken from the Chairman's declared result. They are shown with the minutes and cannot be edited here." />
                  </CardTitle>
                  <CardDescription>
                    Read-only tally for each resolution, pulled from what has already been declared.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!declared ? (
                    <p className="text-sm text-muted-foreground">
                      Results have not been declared yet. Declare the result on the Election desk first.
                    </p>
                  ) : agenda.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No resolutions or seats were on the agenda.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Seat</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Total votes</TableHead>
                          <TableHead>Results summary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agenda.map((row) => (
                          <TableRow key={row.agendaItemId}>
                            <TableCell className="text-muted-foreground">
                              {row.isSpecialBusiness ? "Special" : "Ordinary"}
                            </TableCell>
                            <TableCell className="font-medium">{row.subject}</TableCell>
                            <TableCell>
                              <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                                {outcomeLabel(row)}
                              </span>
                            </TableCell>
                            <TableCell>{row.votesCast}</TableCell>
                            <TableCell className="text-muted-foreground">
                              FOR {row.forCount} AGAINST {row.againstCount}
                              {row.abstainCount ? ` ABSTAIN ${row.abstainCount}` : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        <Dialog open={confirmSign} onOpenChange={setConfirmSign}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign these minutes?</DialogTitle>
              <DialogDescription>
                The Chairman's signature locks the record permanently. Drafts can no longer be edited after this.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmSign(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={sign.isPending} onClick={() => sign.mutate()}>
                {sign.isPending ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
                Sign as chairman
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageFrame>
    </TooltipProvider>
  );
}
