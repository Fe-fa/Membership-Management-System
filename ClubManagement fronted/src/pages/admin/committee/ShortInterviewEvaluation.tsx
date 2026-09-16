import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileDown, FileText, Loader2, Pencil, Trash2, Undo2 } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { PageHeader } from "@/components/layout/PageFrame";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE } from "@/config/env";
import { ApiError, apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

import type { CommitteeMeeting, InterviewDocument, MeetingInterview } from "./committeeDesk";

const OUTCOME_COPY: Record<string, string> = {
  Positive: "Cleared — applicant moved to temporary status for balloting. This sitting is now Held.",
  Deferred: "Deferred — remains in interview for further review. Assign a new sitting when ready.",
  Negative: "Returned to the previous stage with the required change noted.",
};

const FIELD =
  "border-input bg-card shadow-none placeholder:text-muted-foreground/80";

type EvaluationDraft = {
  notes: string;
  suitability: string;
  verbalAlignment: string;
  recommendation: string;
  returnReason: string;
  outcome: string;
};

type SittingMeta = {
  meetingId?: number | null;
  meetingDate?: string | null;
  meetingTime?: string | null;
  chairName?: string | null;
  sittingLabel?: string;
};

function isLinkStubNote(notes?: string | null) {
  return /^linked to meeting\b/i.test((notes ?? "").trim());
}

function draftFrom(row: MeetingInterview): EvaluationDraft {
  return {
    notes: isLinkStubNote(row.notes) ? "" : (row.notes ?? ""),
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

function mediaUrl(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function applicantInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatSittingDate(value?: string | null) {
  if (!value) return "—";
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : value;
}

function formatSittingTime(value?: string | null) {
  if (!value) return "—";
  const match = value.match(/(\d{2}:\d{2})/);
  return match?.[1] ?? value;
}

function pickApplicationPdf(docs?: InterviewDocument[]) {
  if (!docs?.length) return null;
  const withFile = docs.filter((d) => d.onFile && (d.fileUrl || d.fileName));
  return (
    withFile.find((d) => /\.pdf$/i.test(d.fileName ?? "") || /\.pdf$/i.test(d.fileUrl ?? "")) ??
    withFile.find((d) => /cv|application/i.test(`${d.label ?? ""} ${d.code ?? ""}`)) ??
    withFile[0] ??
    null
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function suitabilityLabel(value?: string) {
  if (value === "Suitable") return "Suitable for membership";
  if (value === "Conditional") return "Suitable with conditions";
  if (value === "NotSuitable") return "Not suitable at this time";
  return value || "—";
}

function alignmentLabel(value?: string) {
  if (value === "Aligned") return "Aligned with club interests";
  if (value === "Partial") return "Partially aligned — follow up";
  if (value === "NotAligned") return "Not aligned";
  return value || "—";
}

function exportInterviewPdf(row: MeetingInterview, draft: EvaluationDraft, sitting?: SittingMeta) {
  const date = formatSittingDate(sitting?.meetingDate ?? row.scheduledAt);
  const time = formatSittingTime(sitting?.meetingTime ?? row.scheduledAt);
  const interviewer = row.interviewerName || sitting?.chairName || "—";
  const title = `Short interview · ${row.applicantName}`;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Manrope, "Segoe UI", sans-serif; color: #1f2a32; margin: 32px; background: #fff; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #5b6b75; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #d7e0e6; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { width: 180px; background: #f4f7f8; font-weight: 600; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(row.applicationNo)} · ${escapeHtml(date)} ${escapeHtml(time)} · Aero Club of East Africa</p>
  <table>
    <tr><th>Applicant</th><td>${escapeHtml(row.applicantName)}</td></tr>
    <tr><th>Interviewer</th><td>${escapeHtml(interviewer)}</td></tr>
    <tr><th>Sitting</th><td>${escapeHtml(sitting?.sittingLabel ?? row.sittingLabel ?? "—")}</td></tr>
    <tr><th>Notes</th><td>${escapeHtml(draft.notes || "—")}</td></tr>
    <tr><th>Suitability</th><td>${escapeHtml(suitabilityLabel(draft.suitability))}</td></tr>
    <tr><th>Verbal alignment</th><td>${escapeHtml(alignmentLabel(draft.verbalAlignment))}</td></tr>
    <tr><th>Assessment remarks</th><td>${escapeHtml(draft.recommendation || "—")}</td></tr>
    <tr><th>Outcome</th><td>${escapeHtml(outcomeLabel(draft.outcome))}</td></tr>
    ${
      draft.returnReason
        ? `<tr><th>Required change</th><td>${escapeHtml(draft.returnReason)}</td></tr>`
        : ""
    }
  </table>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Export short interview");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    toast.error("Could not open the print dialog.");
    return;
  }
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  const print = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      cleanup();
    }
  };
  setTimeout(print, 50);
}

function StatusBadge({
  row,
  alreadyMember,
}: {
  row: MeetingInterview;
  alreadyMember: boolean;
}) {
  if (row.outcomeRecorded || row.outcome) {
    return (
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
    );
  }
  if (alreadyMember) {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800" variant="outline">
        Temporary member
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-amber-500 text-white hover:bg-amber-500">
      Awaiting evaluation
    </Badge>
  );
}

function EvaluationFields({
  row,
  draft,
  setDraft,
  locked,
  busy,
  canRecord,
  saveNotesPending,
  saveOutcomePending,
  submitLabel,
  onSaveNotes,
  onSaveOutcome,
  actionsClassName,
}: {
  row: MeetingInterview;
  draft: EvaluationDraft;
  setDraft: (updater: (d: EvaluationDraft) => EvaluationDraft) => void;
  locked: boolean;
  busy: boolean;
  canRecord: boolean;
  saveNotesPending: boolean;
  saveOutcomePending: boolean;
  submitLabel: string;
  onSaveNotes: () => void;
  onSaveOutcome: () => void;
  actionsClassName?: string;
}) {
  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-2">
        <Label htmlFor={`notes-${row.interviewId}`} className="text-sm font-semibold">
          Interview notes and observations
        </Label>
        <Textarea
          id={`notes-${row.interviewId}`}
          disabled={locked}
          placeholder="What the committee observed: manner, aviation interest, questions asked, concerns…"
          className={cn("min-h-[112px] rounded-xl", FIELD)}
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
      </fieldset>

      <fieldset className="grid gap-3">
        <Label className="text-sm font-semibold">Committee assessment</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Suitability</span>
            <Select
              value={draft.suitability || undefined}
              disabled={locked}
              onValueChange={(value) => setDraft((d) => ({ ...d, suitability: value }))}
            >
              <SelectTrigger className={FIELD}>
                <SelectValue placeholder="Applicant suitability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Suitable">Suitable for membership</SelectItem>
                <SelectItem value="Conditional">Suitable with conditions</SelectItem>
                <SelectItem value="NotSuitable">Not suitable at this time</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Verbal alignment</span>
            <Select
              value={draft.verbalAlignment || undefined}
              disabled={locked}
              onValueChange={(value) => setDraft((d) => ({ ...d, verbalAlignment: value }))}
            >
              <SelectTrigger className={FIELD}>
                <SelectValue placeholder="Alignment with club interests" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Aligned">Aligned with club interests</SelectItem>
                <SelectItem value="Partial">Partially aligned</SelectItem>
                <SelectItem value="NotAligned">Not aligned</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <Textarea
          disabled={locked}
          placeholder="Assessment remarks"
          className={cn("min-h-[88px] rounded-xl", FIELD)}
          value={draft.recommendation}
          onChange={(e) => setDraft((d) => ({ ...d, recommendation: e.target.value }))}
        />
      </fieldset>

      <fieldset className="grid gap-2">
        <Label className="text-sm font-semibold">Outcome</Label>
        <Select
          value={draft.outcome || undefined}
          disabled={locked}
          onValueChange={(value) => setDraft((d) => ({ ...d, outcome: value }))}
        >
          <SelectTrigger className={FIELD}>
            <SelectValue placeholder="Select outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Positive">Positive</SelectItem>
            <SelectItem value="Deferred">Deferred</SelectItem>
            <SelectItem value="Negative">Negative</SelectItem>
          </SelectContent>
        </Select>
        {draft.outcome === "Negative" ? (
          <div className="grid gap-1">
            <Label htmlFor={`return-reason-${row.interviewId}`}>Reason — stage change required</Label>
            <p className="text-xs text-muted-foreground">
              Required. The application returns to the previous stage with this change requested.
            </p>
            <Textarea
              id={`return-reason-${row.interviewId}`}
              disabled={locked}
              placeholder="What must change at the previous stage before this applicant can be interviewed again?"
              className={cn("min-h-[80px] rounded-xl", FIELD)}
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
        <div className={cn("flex flex-wrap justify-end gap-2 pt-2", actionsClassName)}>
          <Button type="button" variant="outline" disabled={locked || busy} onClick={onSaveNotes}>
            {saveNotesPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save notes
          </Button>
          <Button type="button" disabled={locked || busy || !canRecord} onClick={onSaveOutcome}>
            {saveOutcomePending ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

function ApplicantIdentity({
  row,
  sitting,
  alreadyMember,
}: {
  row: MeetingInterview;
  sitting?: SittingMeta;
  alreadyMember: boolean;
}) {
  const photo = mediaUrl(row.photoUrl);
  const date = formatSittingDate(sitting?.meetingDate ?? row.scheduledAt);
  const time = formatSittingTime(sitting?.meetingTime ?? row.scheduledAt);
  const interviewer = row.interviewerName || sitting?.chairName || "[Name]";
  const pdf = pickApplicationPdf(row.documents);
  const pdfHref = mediaUrl(pdf?.fileUrl);
  const meetingId = sitting?.meetingId ?? row.committeeMeetingId;

  return (
    <aside className="min-w-0 space-y-5">
      <div className="flex items-start gap-3">
        <Avatar className="size-14 border border-border bg-card shadow-sm">
          {photo ? <AvatarImage src={photo} alt="" /> : null}
          <AvatarFallback className="bg-card text-sm font-semibold text-foreground">
            {applicantInitials(row.applicantName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="truncate text-lg font-semibold leading-tight">{row.applicantName}</p>
            <p className="text-xs text-muted-foreground">{row.applicationNo}</p>
          </div>
          <StatusBadge row={row} alreadyMember={alreadyMember} />
        </div>
      </div>

      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Date:</dt>
          <dd>{date}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Time:</dt>
          <dd>{time}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">Interviewer:</dt>
          <dd>{interviewer}</dd>
        </div>
      </dl>

      {pdfHref ? (
        <a
          href={pdfHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <FileText className="size-4" />
          Application document pdf
        </a>
      ) : (
        <Link
          to="/members/$applicationId"
          params={{ applicationId: String(row.applicationId) }}
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <FileText className="size-4" />
          Application document pdf
        </Link>
      )}

      {meetingId ? (
        <p className="text-sm text-primary">Linked to meeting {meetingId}</p>
      ) : sitting?.sittingLabel ? (
        <p className="text-sm text-muted-foreground">{sitting.sittingLabel}</p>
      ) : null}
    </aside>
  );
}

export function InterviewEvaluationCard({
  row,
  sitting,
  sittingLabel,
  readOnly,
  submitLabel = "Record outcome",
  layout = "compact",
  onChanged,
  exportRef,
}: {
  row: MeetingInterview;
  sitting?: SittingMeta;
  sittingLabel?: string;
  readOnly: boolean;
  submitLabel?: string;
  layout?: "compact" | "workspace";
  onChanged: () => void;
  exportRef?: { current: (() => void) | null };
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EvaluationDraft>(draftFrom(row));
  const resolvedSitting: SittingMeta = sitting ?? { sittingLabel };

  useEffect(() => {
    setDraft(draftFrom(row));
  }, [
    row.interviewId,
    row.notes,
    row.outcome,
    row.form?.suitability,
    row.form?.verbalAlignment,
    row.form?.recommendation,
    row.form?.returnReason,
  ]);

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

  useEffect(() => {
    if (!exportRef) return;
    exportRef.current = () => exportInterviewPdf(row, draft, resolvedSitting);
    return () => {
      exportRef.current = null;
    };
  }, [exportRef, row, draft, resolvedSitting]);

  const fields = (
    <EvaluationFields
      row={row}
      draft={draft}
      setDraft={(updater) => setDraft((d) => updater(d))}
      locked={locked}
      busy={busy}
      canRecord={canRecord}
      saveNotesPending={saveNotes.isPending}
      saveOutcomePending={saveOutcome.isPending}
      submitLabel={submitLabel}
      onSaveNotes={() => saveNotes.mutate()}
      onSaveOutcome={() => saveOutcome.mutate()}
    />
  );

  if (layout === "workspace") {
    return (
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <ApplicantIdentity row={row} sitting={resolvedSitting} alreadyMember={alreadyMember} />
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
          {alreadyMember ? (
            <p className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              This applicant is already a temporary member from a previous positive interview. A second
              outcome is not allowed.
            </p>
          ) : null}
          {fields}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {row.applicantName}{" "}
            <span className="text-xs font-normal text-muted-foreground">{row.applicationNo}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {resolvedSitting.sittingLabel ? `${resolvedSitting.sittingLabel} · ` : ""}
            <span className={interviewStatusClass(row.statusName)}>{row.statusName ?? "Interview"}</span>
            {row.outcomeRecorded || row.outcome
              ? ` · Outcome: ${outcomeLabel(row.outcome)}`
              : alreadyMember
                ? " · Already cleared — do not evaluate again"
                : " · Outcome pending"}
          </p>
        </div>
        <StatusBadge row={row} alreadyMember={alreadyMember} />
      </div>
      {alreadyMember ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          This applicant is already a temporary member from a previous positive interview. A second
          outcome is not allowed.
        </p>
      ) : null}
      {fields}
    </div>
  );
}

export function ShortInterviewStage({
  meetings,
  readOnly,
  onChanged,
  unavailableMessage,
}: {
  meetings: CommitteeMeeting[];
  readOnly?: boolean;
  onChanged: () => void;
  unavailableMessage?: string;
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
        sitting: {
          meetingId: meeting.committeeMeetingId,
          meetingDate: meeting.meetingDate,
          meetingTime: meeting.meetingTime,
          chairName: meeting.chairName,
          sittingLabel: label,
        } satisfies SittingMeta,
        locked: readOnly || (meeting.status !== "SCHEDULED" && meeting.status !== "HELD"),
      }));
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const exportRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((item) => item.row.interviewId === selectedId)) {
      setSelectedId(rows[0].row.interviewId);
    }
  }, [rows, selectedId]);

  const selected = useMemo(
    () => rows.find((item) => item.row.interviewId === selectedId) ?? rows[0],
    [rows, selectedId],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        // title="Short interview"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="bg-card" asChild>
              <Link to="/manage-committee/meetings/waiting">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="bg-card"
              disabled={!selected}
              onClick={() => exportRef.current?.()}
            >
              <FileDown className="size-4" />
              Export to PDF
            </Button>
          </div>
        }
      />

      {unavailableMessage ? (
        <p className="text-sm text-muted-foreground">{unavailableMessage}</p>
      ) : error ? (
        <p className="text-sm text-destructive">{extractErrorMessage(error)}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading interview evaluations…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No applicants are waiting for an interview outcome. Assign them on Waiting for meeting.
          Recorded outcomes appear under Interview history.
        </p>
      ) : (
        <div className="space-y-5">
          {rows.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {rows.map(({ row }) => (
                <Button
                  key={row.interviewId}
                  type="button"
                  size="sm"
                  variant={row.interviewId === selected?.row.interviewId ? "default" : "outline"}
                  className={row.interviewId === selected?.row.interviewId ? undefined : "bg-card"}
                  onClick={() => setSelectedId(row.interviewId)}
                >
                  {row.applicantName}
                </Button>
              ))}
            </div>
          ) : null}
          {selected ? (
            <InterviewEvaluationCard
              key={selected.row.interviewId}
              row={selected.row}
              sitting={selected.sitting}
              readOnly={selected.locked}
              layout="workspace"
              onChanged={onChanged}
              exportRef={exportRef}
            />
          ) : null}
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
        <div className="overflow-x-auto rounded-md border bg-card">
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
                            {retrieve.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Undo2 className="size-4" />
                            )}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update interview outcome</DialogTitle>
            <DialogDescription>
              Deferred and negative records can be corrected. A clearance to temporary status stays
              locked.
            </DialogDescription>
          </DialogHeader>
          {editRow ? (
            <InterviewEvaluationCard
              key={editRow.interviewId}
              row={editRow}
              sittingLabel={editRow.sittingLabel ?? undefined}
              readOnly={false}
              submitLabel="Update"
              layout="compact"
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
