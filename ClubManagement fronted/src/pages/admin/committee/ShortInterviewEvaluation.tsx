import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pencil, RefreshCw, Trash2, Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest, extractErrorMessage } from "@/services/membership/api";

import type { CommitteeMeeting, MeetingInterview } from "./committeeDesk";

const OUTCOME_COPY: Record<string, string> = {
  Positive: "Cleared — applicant moved to temporary status for balloting. This sitting is now Held.",
  Deferred: "Deferred — remains in interview for further review. Assign a new sitting when ready.",
  Negative: "Returned to the previous stage with the required change noted.",
};

type EvaluationDraft = {
  notes: string;
  suitability: string;
  verbalAlignment: string;
  recommendation: string;
  returnReason: string;
  outcome: string;
};

function draftFrom(row: MeetingInterview): EvaluationDraft {
  return {
    notes: row.notes ?? "",
    suitability: row.form?.suitability ?? "",
    verbalAlignment: row.form?.verbalAlignment ?? "",
    recommendation: row.form?.recommendation ?? "",
    returnReason: row.form?.returnReason ?? "",
    outcome: row.outcome ?? "",
  };
}

function assessmentBody(draft: EvaluationDraft) {
  return {
    notes: draft.notes,
    suitability: draft.suitability,
    verbalAlignment: draft.verbalAlignment,
    recommendation: draft.recommendation,
    returnReason: draft.returnReason,
    attended: true,
  };
}

export function isWaitingForMeeting(row: { linkedMeetingId?: number | null; outcome?: string | null }) {
  return Boolean(row.linkedMeetingId) && !row.outcome;
}

export function interviewStatusClass(status?: string | null) {
  const value = (status ?? "").toLowerCase();
  if (value.includes("interview")) return "text-destructive";
  if (value.includes("temporary")) return "text-emerald-700";
  return "text-foreground";
}

export function isClearedPastInterview(row: { statusCode?: string | null; statusName?: string | null }) {
  const code = (row.statusCode ?? "").replace(/[_\s]/g, "").toLowerCase();
  const name = (row.statusName ?? "").toLowerCase();
  return (
    code === "temporarymember" ||
    code === "approved" ||
    code === "waitlist" ||
    code === "electionreview" ||
    name.includes("temporary") ||
    name.includes("fully approved")
  );
}

function canAmendHistory(row: MeetingInterview) {
  if (row.canAmendHistory != null) return row.canAmendHistory;
  return Boolean(row.outcome) && row.outcome !== "Positive";
}

export function InterviewEvaluationCard({
  row,
  sittingLabel,
  readOnly,
  submitLabel = "Record outcome",
  onChanged,
}: {
  row: MeetingInterview;
  sittingLabel?: string;
  readOnly: boolean;
  submitLabel?: string;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EvaluationDraft>(draftFrom(row));

  useEffect(() => {
    setDraft(draftFrom(row));
  }, [row.interviewId, row.notes, row.outcome, row.form?.suitability, row.form?.verbalAlignment, row.form?.recommendation, row.form?.returnReason]);

  const saveNotes = useMutation({
    mutationFn: () =>
      apiRequest(`/api/committees/interviews/${row.interviewId}/notes`, {
        method: "PATCH",
        body: JSON.stringify(assessmentBody(draft)),
      }),
    onSuccess: () => {
      toast.success("Committee notes and assessment saved.");
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ["committee", "meeting-interviews"] });
      void queryClient.invalidateQueries({ queryKey: ["committee", "interview-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["committee", "interview-history"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const saveOutcome = useMutation({
    mutationFn: () =>
      apiRequest(`/api/committees/interviews/${row.interviewId}/outcome`, {
        method: "PATCH",
        body: JSON.stringify({
          ...assessmentBody(draft),
          outcome: draft.outcome,
        }),
      }),
    onSuccess: () => {
      toast.success(OUTCOME_COPY[draft.outcome] ?? "Interview outcome recorded. This sitting is now Held.");
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ["committee", "meeting-interviews"] });
      void queryClient.invalidateQueries({ queryKey: ["committee", "interview-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["committee", "interview-history"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const busy = saveNotes.isPending || saveOutcome.isPending;
  const alreadyMember = isClearedPastInterview(row) && !row.outcome;
  const locked = readOnly || alreadyMember;
  const negativeReasonOk = draft.outcome !== "Negative" || draft.returnReason.trim().length >= 5;
  const canRecord =
    Boolean(draft.outcome) &&
    Boolean(draft.suitability) &&
    Boolean(draft.verbalAlignment) &&
    negativeReasonOk;

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {row.applicantName}{" "}
            <span className="text-xs font-normal text-muted-foreground">{row.applicationNo}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {sittingLabel ? `${sittingLabel} · ` : ""}
            <span className={interviewStatusClass(row.statusName)}>{row.statusName ?? "Interview"}</span>
            {row.outcomeRecorded || row.outcome
              ? ` · Outcome: ${outcomeLabel(row.outcome)}`
              : alreadyMember
                ? " · Already cleared — do not evaluate again"
                : " · Outcome pending"}
          </p>
        </div>
        {row.outcomeRecorded || row.outcome ? (
          <Badge variant="secondary">{outcomeLabel(row.outcome)}</Badge>
        ) : alreadyMember ? (
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800" variant="outline">
            Temporary member
          </Badge>
        ) : (
          <Badge variant="outline">Awaiting evaluation</Badge>
        )}
      </div>

      {alreadyMember ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          This applicant is already a temporary member from a previous positive interview. A second outcome is not allowed.
        </p>
      ) : null}

      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <Label htmlFor={`notes-${row.interviewId}`}>1. Interview notes and observations</Label>
          <Textarea
            id={`notes-${row.interviewId}`}
            disabled={locked}
            placeholder="What the committee observed: manner, aviation interest, questions asked, concerns…"
            className="min-h-[96px]"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          />
        </fieldset>

        <fieldset className="grid gap-3">
          <div>
            <Label>2. Committee assessment</Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Suitability</span>
              <Select
                value={draft.suitability || undefined}
                disabled={locked}
                onValueChange={(value) => setDraft((d) => ({ ...d, suitability: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Applicant suitability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Suitable">Suitable for membership</SelectItem>
                  <SelectItem value="Conditional">Suitable with conditions</SelectItem>
                  <SelectItem value="NotSuitable">Not suitable at this time</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Verbal alignment</span>
              <Select
                value={draft.verbalAlignment || undefined}
                disabled={locked}
                onValueChange={(value) => setDraft((d) => ({ ...d, verbalAlignment: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alignment with club interests" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aligned">Aligned with club interests</SelectItem>
                  <SelectItem value="Partial">Partially aligned — follow up</SelectItem>
                  <SelectItem value="NotAligned">Not aligned</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <Textarea
            disabled={locked}
            placeholder="Assessment remarks (optional) — why the committee reached this view."
            className="min-h-[72px]"
            value={draft.recommendation}
            onChange={(e) => setDraft((d) => ({ ...d, recommendation: e.target.value }))}
          />
        </fieldset>

        <fieldset className="grid gap-2">
          <Label>3. Interview outcome</Label>
          <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
            <Select
              value={draft.outcome || undefined}
              disabled={locked}
              onValueChange={(value) => setDraft((d) => ({ ...d, outcome: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Positive">Positive</SelectItem>
                <SelectItem value="Deferred">Deferred</SelectItem>
                <SelectItem value="Negative">Negative</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={locked || busy}
              onClick={() => saveNotes.mutate()}
            >
              {saveNotes.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save notes
            </Button>
            <Button
              type="button"
              disabled={locked || busy || !canRecord}
              onClick={() => saveOutcome.mutate()}
            >
              {saveOutcome.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
          {draft.outcome === "Negative" ? (
            <div className="grid gap-1">
              <Label htmlFor={`return-reason-${row.interviewId}`}>
                Reason — stage change required
              </Label>
              <p className="text-xs text-muted-foreground">
                Required. The application returns to the previous stage with this change requested.
              </p>
              <Textarea
                id={`return-reason-${row.interviewId}`}
                disabled={locked}
                placeholder="What must change at the previous stage before this applicant can be interviewed again?"
                className="min-h-[80px]"
                value={draft.returnReason}
                onChange={(e) => setDraft((d) => ({ ...d, returnReason: e.target.value }))}
              />
            </div>
          ) : null}
          {!locked && draft.outcome && !canRecord ? (
            <p className="text-xs text-amber-800">
              {draft.outcome === "Negative" && draft.returnReason.trim().length < 5
                ? "Enter the stage-change reason (at least 5 characters) before recording a negative outcome."
                : "Record suitability and verbal alignment before saving an outcome."}
            </p>
          ) : null}
        </fieldset>
      </div>
    </div>
  );
}

export function ShortInterviewStage({
  meetings,
  readOnly,
  onChanged,
}: {
  meetings: CommitteeMeeting[];
  readOnly?: boolean;
  onChanged: () => void;
}) {
  const sittings = meetings.filter((m) => (m.linkedInterviewCount ?? 0) > 0);
  const results = useQueries({
    queries: sittings.map((m) => ({
      queryKey: ["committee", "meeting-interviews", m.committeeMeetingId] as const,
      queryFn: () =>
        apiRequest<MeetingInterview[]>(`/api/committees/meetings/${m.committeeMeetingId}/interviews`),
    })),
  });

  const loading = results.some((r) => r.isLoading);
  const error = results.find((r) => r.error)?.error;
  const rows = sittings.flatMap((meeting, index) => {
    const interviews = results[index]?.data ?? [];
    const label =
      (meeting.meetingName || meeting.meetingTypeName) +
      ` · ${meeting.meetingDate}` +
      (meeting.meetingTime ? ` ${meeting.meetingTime}` : "");
    return interviews
      .filter((row) => !row.outcome)
      .map((row) => ({
        row,
        sittingLabel: label,
        locked: readOnly || (meeting.status !== "SCHEDULED" && meeting.status !== "HELD"),
      }));
  });

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-destructive">{extractErrorMessage(error)}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading interview evaluations…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No applicants are waiting for an interview outcome. Assign them on Waiting for meeting.
          Recorded outcomes appear under Interview history.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ row, sittingLabel, locked }) => (
            <InterviewEvaluationCard
              key={row.interviewId}
              row={row}
              sittingLabel={sittingLabel}
              readOnly={locked}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function InterviewHistory() {
  const queryClient = useQueryClient();
  const [editRow, setEditRow] = useState<MeetingInterview | null>(null);
  const [deleteRow, setDeleteRow] = useState<MeetingInterview | null>(null);
  const history = useQuery({
    queryKey: ["committee", "interview-history"],
    queryFn: () => apiRequest<MeetingInterview[]>("/api/committees/interview-history"),
  });
  const retrieve = useMutation({
    mutationFn: (interviewId: number) =>
      apiRequest(`/api/committees/interviews/${interviewId}/retrieve`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Deferred applicant returned to Pending application for further review.");
      void queryClient.invalidateQueries({ queryKey: ["committee"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (interviewId: number) =>
      apiRequest(`/api/committees/interviews/${interviewId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Interview record removed from history.");
      setDeleteRow(null);
      void queryClient.invalidateQueries({ queryKey: ["committee"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });
  const rows = history.data ?? [];
  const historyError =
    history.error instanceof ApiError && history.error.status === 404
      ? "Restart the API to load interview history."
      : history.error
        ? extractErrorMessage(history.error)
        : null;

  return (
    <div className="space-y-3">
      {historyError ? (
        <p className="text-sm text-destructive">{historyError}</p>
      ) : history.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading interview history…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recorded interview outcomes yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Applicant</th>
                <th className="px-3 py-2">Sitting</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Now at</th>
                <th className="px-3 py-2">Notes / required change</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const amendable = canAmendHistory(row);
                return (
                  <tr key={row.interviewId} className="border-t align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.applicantName}</p>
                      <p className="text-xs text-muted-foreground">{row.applicationNo}</p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.sittingLabel ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          row.outcome === "Positive"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : row.outcome === "Negative"
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-amber-200 bg-amber-50 text-amber-900"
                        }
                      >
                        {outcomeLabel(row.outcome)}
                      </Badge>
                    </td>
                    <td className={`px-3 py-2 ${interviewStatusClass(row.statusName)}`}>
                      {row.statusName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.outcome === "Negative" && row.form?.returnReason
                        ? row.form.returnReason
                        : row.notes || "—"}
                    </td>
                    <td className="px-3 py-2">


<div className="flex flex-wrap items-center gap-1">
  <Button
    type="button"
    size="icon"
    variant="outline"
    disabled={!amendable}
    onClick={() => setEditRow(row)}
    title="Edit outcome"
  >
    <Pencil className="size-4" />
    <span className="sr-only">Edit outcome</span>
  </Button>
  <Button
    type="button"
    size="icon"
    variant="outline"
    disabled={!amendable}
    onClick={() => setEditRow(row)}
    title="Update"
  >
    <RefreshCw className="size-4" />
    <span className="sr-only">Update</span>
  </Button>
  <Button
    type="button"
    size="icon"
    variant="outline"
    disabled={!amendable || remove.isPending}
    onClick={() => setDeleteRow(row)}
    title="Delete"
  >
    <Trash2 className="size-4" />
    <span className="sr-only">Delete</span>
  </Button>
  {row.canRetrieve ? (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={retrieve.isPending}
      onClick={() => retrieve.mutate(row.interviewId)}
      title="Retrieve for review"
    >
      {retrieve.isPending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
      <span className="sr-only">Retrieve for review</span>
    </Button>
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

      <Dialog open={Boolean(editRow)} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update interview outcome</DialogTitle>
            <DialogDescription>
              Deferred and negative records can be corrected. A clearance to temporary status stays locked.
            </DialogDescription>
          </DialogHeader>
          {editRow ? (
            <InterviewEvaluationCard
              key={editRow.interviewId}
              row={editRow}
              sittingLabel={editRow.sittingLabel ?? undefined}
              readOnly={false}
              submitLabel="Update"
              onChanged={() => {
                setEditRow(null);
                void queryClient.invalidateQueries({ queryKey: ["committee"] });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteRow)} onOpenChange={(open) => !open && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this interview record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow
                ? `Remove the ${outcomeLabel(deleteRow.outcome).toLowerCase()} record for ${deleteRow.applicantName}. A positive clearance cannot be deleted.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteRow) remove.mutate(deleteRow.interviewId);
              }}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function outcomeLabel(outcome?: string | null) {
  if (outcome === "Positive") return "Cleared for temporary status";
  if (outcome === "Deferred") return "Deferred — further review";
  if (outcome === "Negative") return "Returned — change required";
  return outcome || "Pending";
}
