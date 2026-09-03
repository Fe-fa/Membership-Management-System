import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ChevronDown, ChevronRight, Loader2, Paperclip, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { loadSittingAttendance, saveSittingPresent } from "@/services/admin/committeeSitting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { API_BASE } from "@/config/env";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

import {
  type CommitteeMeeting,
  type InterviewCandidate,
  type MeetingInterview,
  type MeetingTypeOption,
  useCurrentCommittee,
  useInvalidateCommittee,
} from "./committee/committeeDesk";
import {
  InterviewHistory,
  ShortInterviewStage,
  interviewStatusClass,
  isWaitingForMeeting,
} from "./committee/ShortInterviewEvaluation";

function MeetingDeskShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (committee: NonNullable<ReturnType<typeof useCurrentCommittee>["data"]>) => ReactNode;
}) {
  const current = useCurrentCommittee();
  const committee = current.data;

  return (
    <PageFrame>
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader title={title} description={description} />
      {!committee ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {current.isLoading ? "Loading…" : "Create a committee term first to schedule meetings."}
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardContent className="grid gap-4 pt-6">{children(committee)}</CardContent>
        </Card>
      )}
    </PageFrame>
  );
}

export function MeetingPendingPage() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCommittee();
  const current = useCurrentCommittee();
  const committee = current.data;
  const [bannerOpen, setBannerOpen] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    meetingTypeId: "",
    meetingDate: kenyaTodayISO(),
    meetingTime: "10:00",
    meetingName: "",
    meetingLink: "",
    applicationIds: [] as number[],
  });

  const meetingTypes = useQuery({
    queryKey: ["committee", "meeting-types"],
    queryFn: () => apiRequest<MeetingTypeOption[]>("/api/committees/meta/meeting-types"),
  });

  const interviewQueue = useQuery({
    queryKey: ["committee", "interview-queue"],
    queryFn: () => apiRequest<InterviewCandidate[]>("/api/committees/interview-queue"),
  });

  const createMeeting = useMutation({
    mutationFn: (applicationIds: number[]) => {
      if (!committee) throw new Error("No active committee.");
      return apiRequest(`/api/committees/${committee.committeeId}/meetings`, {
        method: "POST",
        body: JSON.stringify({
          meetingTypeId: Number(meetingForm.meetingTypeId),
          meetingDate: meetingForm.meetingDate,
          meetingTime: meetingForm.meetingTime,
          meetingName: meetingForm.meetingName.trim() || null,
          meetingLink: meetingForm.meetingLink.trim() || null,
          applicationIds,
        }),
      });
    },
    onSuccess: (_data, applicationIds) => {
      toast.success(
        applicationIds.length > 0
          ? "Sitting scheduled. Applicant moved to Waiting for meeting."
          : "Meeting scheduled.",
      );
      setMeetingForm((f) => ({ ...f, meetingName: "", meetingLink: "", applicationIds: [] }));
      setScheduleOpen(false);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["committee", "interview-queue"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const attach = useMutation({
    mutationFn: ({ meetingId, applicationId }: { meetingId: number; applicationId: number }) =>
      apiRequest(`/api/committees/meetings/${meetingId}/interviews`, {
        method: "POST",
        body: JSON.stringify({ applicationId }),
      }),
    onSuccess: () => {
      toast.success("Applicant attached. They moved to Waiting for meeting.");
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["committee", "interview-queue"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const pendingAttach = (interviewQueue.data ?? []).filter((a) => !isWaitingForMeeting(a));
  const openSittings = (committee?.meetings ?? []).filter(
    (m) => m.status === "SCHEDULED" || m.status === "HELD",
  );
  const targetSitting = pickOpenSitting(openSittings);

  function toggleApplicant(applicationId: number, selected: boolean) {
    setMeetingForm((f) => ({
      ...f,
      applicationIds: selected
        ? [...f.applicationIds, applicationId]
        : f.applicationIds.filter((id) => id !== applicationId),
    }));
  }

  function attachApplicants(ids: number[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      toast.error("Select an applicant to attach.");
      return;
    }
    if (targetSitting) {
      unique.forEach((applicationId) =>
        attach.mutate({ meetingId: targetSitting.committeeMeetingId, applicationId }),
      );
      setMeetingForm((f) => ({ ...f, applicationIds: [] }));
      return;
    }
    if (!meetingForm.meetingTypeId || !meetingForm.meetingDate) {
      toast.error("Schedule a sitting first, then attach applicants.");
      setScheduleOpen(true);
      return;
    }
    createMeeting.mutate(unique);
  }

  const busy = createMeeting.isPending || attach.isPending;

  return (
    <PageFrame>
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Pending application"
        description=""
        actions={
          committee ? (
            <Button type="button" onClick={() => setScheduleOpen(true)}>
              <Plus className="size-4" />
              Add
            </Button>
          ) : null
        }
      />
      {!committee ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {current.isLoading ? "Loading…" : "Create a committee term first to schedule meetings."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 pb-24">
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Schedule sitting</DialogTitle>
                <DialogDescription>
                  Choose the sitting type, date, and time. Applicants you attach afterwards move to
                  Waiting for meeting.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <Label>Sitting type</Label>
                    <Select
                      value={meetingForm.meetingTypeId}
                      onValueChange={(v) => setMeetingForm((f) => ({ ...f, meetingTypeId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Meeting type" />
                      </SelectTrigger>
                      <SelectContent>
                        {(meetingTypes.data ?? []).map((t) => (
                          <SelectItem key={t.meetingTypeId} value={String(t.meetingTypeId)}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <Label>Name</Label>
                    <Input
                      value={meetingForm.meetingName}
                      onChange={(e) => setMeetingForm((f) => ({ ...f, meetingName: e.target.value }))}
                      placeholder="Optional title"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={meetingForm.meetingDate}
                      onChange={(e) => setMeetingForm((f) => ({ ...f, meetingDate: e.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={meetingForm.meetingTime}
                      onChange={(e) => setMeetingForm((f) => ({ ...f, meetingTime: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  <Label>Online meeting link (optional)</Label>
                  <Input
                    value={meetingForm.meetingLink}
                    onChange={(e) => setMeetingForm((f) => ({ ...f, meetingLink: e.target.value }))}
                    placeholder="https://meet.google.com/… — shared with applicant and committee"
                  />
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy || !meetingForm.meetingTypeId || !meetingForm.meetingDate}
                  onClick={() => createMeeting.mutate(meetingForm.applicationIds)}
                >
                  {createMeeting.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Schedule
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="space-y-3">
            {interviewQueue.isError ? (
              <p className="text-sm text-destructive">
                Could not load pending applicants. {extractErrorMessage(interviewQueue.error)}
              </p>
            ) : interviewQueue.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading applicants…</p>
            ) : pendingAttach.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  No pending applicants to attach.
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-2">
                {pendingAttach.map((a) => {
                  const checked = meetingForm.applicationIds.includes(a.applicationId);
                  return (
                    <li key={a.applicationId}>
                      <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 shadow-sm">
                        <ApplicantPhoto name={a.applicantName} photoUrl={a.photoUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold leading-tight">{a.applicantName}</p>
                          <p className="text-xs text-muted-foreground">{a.applicationNo}</p>
                        </div>
                        <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                          {a.statusName || "Awaiting Interview"}
                        </Badge>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleApplicant(a.applicationId, value === true)}
                          aria-label={`Select ${a.applicantName}`}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => attachApplicants([a.applicationId])}
                        >
                          <Paperclip className="size-3.5" />
                          Attach
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {committee && bannerOpen ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-4xl items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg">
            <p className="min-w-0 flex-1">
              Applicants not yet scheduled for interview. Create a sitting and assign them; they then
              move to Waiting for meeting.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={busy || meetingForm.applicationIds.length === 0}
              onClick={() => attachApplicants(meetingForm.applicationIds)}
            >
              Attach
            </Button>
            <button
              type="button"
              className="rounded-md p-1 text-amber-800 hover:bg-amber-100"
              aria-label="Dismiss"
              onClick={() => setBannerOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </PageFrame>
  );
}

function isActiveInterviewSitting(m: CommitteeMeeting) {
  const hay = `${m.meetingTypeCode} ${m.meetingTypeName} ${m.meetingName ?? ""}`.toLowerCase();
  const interviewDesk =
    hay.includes("interview") || (m.linkedInterviewCount ?? 0) > 0;
  if (!interviewDesk) return false;
  if (m.status === "CANCELLED" || m.status === "ARCHIVED") return false;
  if ((m.pendingOutcomeCount ?? 0) > 0) return true;
  return m.status === "SCHEDULED";
}

function pickOpenSitting(meetings: CommitteeMeeting[]) {
  if (meetings.length === 0) return null;
  return [...meetings].sort((a, b) => {
    const left = `${a.meetingDate} ${a.meetingTime ?? ""}`;
    const right = `${b.meetingDate} ${b.meetingTime ?? ""}`;
    return right.localeCompare(left);
  })[0];
}

function applicantPhotoSrc(url?: string | null) {
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

function ApplicantPhoto({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const src = applicantPhotoSrc(photoUrl);
  return (
    <Avatar className="size-11 border border-border">
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className="text-xs font-semibold">{applicantInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function MeetingWaitingPage() {
  const invalidate = useInvalidateCommittee();
  return (
    <MeetingDeskShell
      title="Waiting for meeting"
      description="Interview sittings that still need an outcome."
    >
      {(desk) => {
        const active = desk.meetings.filter(isActiveInterviewSitting);
        return (
          <>
            <InterviewAssignmentQueue
              kind="waiting"
              meetings={active.filter((m) => m.status === "SCHEDULED" || m.status === "HELD")}
              onChanged={invalidate}
            />
            <MeetingSittingsPanel meetings={active} onChanged={invalidate} />
          </>
        );
      }}
    </MeetingDeskShell>
  );
}

export function MeetingInterviewPage() {
  const invalidate = useInvalidateCommittee();
  return (
    <MeetingDeskShell
      title="Interview"
      description=""
    >
      {(desk) => <ShortInterviewStage meetings={desk.meetings} onChanged={invalidate} />}
    </MeetingDeskShell>
  );
}

export function MeetingHistoryPage() {
  return (
    <PageFrame>
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Interview history"
        description="..."
      />
      <Card>
        <CardContent className="pt-6">
          <InterviewHistory />
        </CardContent>
      </Card>
    </PageFrame>
  );
}

function MeetingSittingsPanel({
  meetings,
  onChanged,
}: {
  meetings: CommitteeMeeting[];
  onChanged: () => void;
}) {
  const [minutesDraft, setMinutesDraft] = useState<Record<number, string>>({});
  const [expandedMeetingId, setExpandedMeetingId] = useState<number | null>(null);

  const setStatus = useMutation({
    mutationFn: ({
      meetingId,
      status,
      force,
    }: {
      meetingId: number;
      status: string;
      force?: boolean;
    }) =>
      apiRequest(`/api/committees/meetings/${meetingId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, force: Boolean(force) }),
      }),
    onSuccess: () => {
      toast.success("Meeting status updated.");
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const setMinutes = useMutation({
    mutationFn: ({ meetingId, minutesUrl }: { meetingId: number; minutesUrl: string }) =>
      apiRequest(`/api/committees/meetings/${meetingId}/minutes`, {
        method: "PATCH",
        body: JSON.stringify({ minutesUrl }),
      }),
    onSuccess: () => {
      toast.success("Minutes link saved on this sitting.");
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const busy = setStatus.isPending || setMinutes.isPending;

  return (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-8" />
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Name / type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Link</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {meetings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        No meetings scheduled.
                      </td>
                    </tr>
                  ) : (
                    [...meetings].map((m) => {
                      const expanded = expandedMeetingId === m.committeeMeetingId;
                      const canExpand = m.status === "SCHEDULED" || m.status === "HELD";
                      const hasInterviews = (m.linkedInterviewCount ?? 0) > 0;
                      return (
                        <Fragment key={m.committeeMeetingId}>
                          <tr className="border-t align-top">
                            <td className="px-2 py-2">
                              {canExpand ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8"
                                  onClick={() =>
                                    setExpandedMeetingId(expanded ? null : m.committeeMeetingId)
                                  }
                                  title="Interviews"
                                >
                                  {expanded ? (
                                    <ChevronDown className="size-4" />
                                  ) : (
                                    <ChevronRight className="size-4" />
                                  )}
                                </Button>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {m.meetingDate}
                              {m.meetingTime ? ` · ${m.meetingTime}` : ""}
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-medium">{m.meetingName || m.meetingTypeName}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.meetingTypeName}
                                {(m.linkedInterviewCount ?? 0) > 0
                                  ? ` · ${m.linkedInterviewCount} interview(s)`
                                  : ""}
                                {(m.pendingOutcomeCount ?? 0) > 0
                                  ? ` · ${m.pendingOutcomeCount} pending outcome`
                                  : ""}
                              </p>
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={
                                  m.status === "SCHEDULED"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : m.status === "HELD"
                                      ? "border-sky-200 bg-sky-50 text-sky-800"
                                      : ""
                                }
                              >
                                {m.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-2">
                                <Input
                                  className="h-8"
                                  placeholder="Meeting / minutes link"
                                  value={minutesDraft[m.committeeMeetingId] ?? m.minutesUrl ?? ""}
                                  onChange={(e) =>
                                    setMinutesDraft((d) => ({
                                      ...d,
                                      [m.committeeMeetingId]: e.target.value,
                                    }))
                                  }
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    setMinutes.mutate({
                                      meetingId: m.committeeMeetingId,
                                      minutesUrl:
                                        minutesDraft[m.committeeMeetingId] ?? m.minutesUrl ?? "",
                                    })
                                  }
                                >
                                  Save & share
                                </Button>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {m.status === "SCHEDULED" ? (
                                <div className="flex flex-wrap gap-1">
                                  {!hasInterviews ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={busy}
                                      onClick={() =>
                                        setStatus.mutate({
                                          meetingId: m.committeeMeetingId,
                                          status: "HELD",
                                        })
                                      }
                                    >
                                      Held
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() =>
                                      setStatus.mutate({
                                        meetingId: m.committeeMeetingId,
                                        status: "CANCELLED",
                                      })
                                    }
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="border-t bg-muted/20">
                              <td colSpan={6} className="px-4 py-4">
                                <MeetingInterviewsPanel
                                  meetingId={m.committeeMeetingId}
                                  readOnly={m.status !== "SCHEDULED" && m.status !== "HELD"}
                                  onChanged={onChanged}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
  );
}

function InterviewAssignmentQueue({
  kind,
  meetings,
  onChanged,
}: {
  kind: "pending" | "waiting";
  meetings: CommitteeMeeting[];
  onChanged: () => void;
}) {
  const [pickedMeeting, setPickedMeeting] = useState<Record<number, string>>({});

  const queue = useQuery({
    queryKey: ["committee", "interview-queue"],
    queryFn: () => apiRequest<InterviewCandidate[]>("/api/committees/interview-queue"),
  });

  const attach = useMutation({
    mutationFn: ({ meetingId, applicationId }: { meetingId: number; applicationId: number }) =>
      apiRequest(`/api/committees/meetings/${meetingId}/interviews`, {
        method: "POST",
        body: JSON.stringify({ applicationId }),
      }),
    onSuccess: () => {
      toast.success("Interview sitting updated. Applicant and committee were notified.");
      onChanged();
      void queue.refetch();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const rows = (queue.data ?? []).filter((row) =>
    kind === "waiting" ? isWaitingForMeeting(row) : !isWaitingForMeeting(row),
  );

  return (
      <ApplicantSittingTable
        title={kind === "pending" ? "Pending applicants" : "Waiting for meeting"}
        description={
          kind === "pending"
            ? "Not yet scheduled. Assign a sitting. After they are scheduled they move to Waiting for meeting."
            : "Scheduled for an interview sitting. Record the outcome on Short interview. Deferred applicants return to Pending for a new sitting."
        }
        empty={
          kind === "pending"
            ? "No pending applicants to schedule."
            : "No applicants waiting for a sitting."
        }
        rows={rows}
        meetings={meetings}
        pickedMeeting={pickedMeeting}
        setPickedMeeting={setPickedMeeting}
        attach={attach}
        loading={queue.isLoading}
        error={queue.error}
        assignLabel={kind === "pending" ? "Assign to meeting" : "Update meeting"}
      />
  );
}

function ApplicantSittingTable({
  title,
  description,
  empty,
  rows,
  meetings,
  pickedMeeting,
  setPickedMeeting,
  attach,
  loading,
  error,
  assignLabel,
}: {
  title: string;
  description: string;
  empty: string;
  rows: InterviewCandidate[];
  meetings: CommitteeMeeting[];
  pickedMeeting: Record<number, string>;
  setPickedMeeting: Dispatch<SetStateAction<Record<number, string>>>;
  attach: {
    isPending: boolean;
    mutate: (vars: { meetingId: number; applicationId: number }) => void;
  };
  loading: boolean;
  error: unknown;
  assignLabel: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">
          Could not load applicants. {extractErrorMessage(error)}
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading applicants…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : meetings.length === 0 ? (
        <p className="text-sm text-amber-800">
          Schedule a sitting above, then assign applicants to it.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Applicant</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Current sitting</th>
                <th className="px-3 py-2">Assign / update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected =
                  pickedMeeting[row.applicationId] ??
                  (row.linkedMeetingId ? String(row.linkedMeetingId) : "");
                const meetingId = Number(selected);
                const sameSitting = row.linkedMeetingId != null && row.linkedMeetingId === meetingId;
                return (
                  <tr key={row.applicationId} className="border-t">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.applicantName}</p>
                      <p className="text-xs text-muted-foreground">{row.applicationNo}</p>
                    </td>
                    <td className={`px-3 py-2 ${interviewStatusClass(row.statusName)}`}>
                      {row.statusName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.linkedMeetingLabel ?? "Not scheduled"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={selected || undefined}
                          onValueChange={(value) =>
                            setPickedMeeting((m) => ({ ...m, [row.applicationId]: value }))
                          }
                        >
                          <SelectTrigger className="h-8 w-[220px]">
                            <SelectValue placeholder="Choose sitting" />
                          </SelectTrigger>
                          <SelectContent>
                            {meetings.map((m) => (
                              <SelectItem
                                key={m.committeeMeetingId}
                                value={String(m.committeeMeetingId)}
                              >
                                {(m.meetingName || m.meetingTypeName) +
                                  ` · ${m.meetingDate}` +
                                  (m.meetingTime ? ` ${m.meetingTime}` : "")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!meetingId || sameSitting || attach.isPending}
                          onClick={() =>
                            attach.mutate({ meetingId, applicationId: row.applicationId })
                          }
                        >
                          {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                          {assignLabel}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MeetingInterviewsPanel({
  meetingId,
  readOnly,
  onChanged,
}: {
  meetingId: number;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(null);

  const interviews = useQuery({
    queryKey: ["committee", "meeting-interviews", meetingId],
    queryFn: () =>
      apiRequest<MeetingInterview[]>(`/api/committees/meetings/${meetingId}/interviews`),
  });

  const sitting = useQuery({
    queryKey: ["committee", "sitting-attendance", meetingId],
    queryFn: () => loadSittingAttendance(meetingId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const setPresent = useMutation({
    mutationFn: (body: { committeeMemberId: number; present: boolean }) =>
      saveSittingPresent(meetingId, body.committeeMemberId, body.present, sitting.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["committee", "sitting-attendance"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const candidates = useQuery({
    queryKey: ["committee", "interview-candidates", meetingId, search],
    queryFn: () =>
      apiRequest<InterviewCandidate[]>(
        `/api/committees/meetings/${meetingId}/interview-candidates?search=${encodeURIComponent(search.trim())}`,
      ),
    enabled: !readOnly,
  });

  const attach = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/committees/meetings/${meetingId}/interviews`, {
        method: "POST",
        body: JSON.stringify({ applicationId }),
      }),
    onSuccess: () => {
      toast.success("Applicant attached. Email and in-app notice sent to attend.");
      setSearch("");
      setPickedId(null);
      onChanged();
      void interviews.refetch();
      void queryClient.invalidateQueries({ queryKey: ["committee", "interview-queue"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const rows = interviews.data ?? [];
  const hits = candidates.data ?? [];
  const attendance = sitting.data?.members ?? [];

  return (
    <div className="space-y-4">
      {attendance.length > 0 ? (
        <div className="rounded-md border bg-background p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Present at this sitting</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {attendance.map((member) => (
              <li key={member.committeeMemberId}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={member.present}
                    disabled={readOnly || setPresent.isPending}
                    onCheckedChange={(v) =>
                      setPresent.mutate({
                        committeeMemberId: member.committeeMemberId,
                        present: v === true,
                      })
                    }
                  />
                  <span>
                    {member.name}
                    <span className="ml-1 text-xs text-muted-foreground">{member.roleName}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Link authorized applications</span>
          <Input
            value={search}
            disabled={readOnly}
            placeholder="Search name or APP-no (empty lists unlinked)"
            onChange={(e) => {
              setSearch(e.target.value);
              setPickedId(null);
            }}
          />
        </label>
        <div className="flex items-end">
          <Button
            type="button"
            disabled={readOnly || pickedId == null || attach.isPending}
            onClick={() => pickedId != null && attach.mutate(pickedId)}
          >
            {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Link selected
          </Button>
        </div>
      </div>
      {!readOnly ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
          {candidates.isLoading ? (
            <li className="text-muted-foreground">Loading authorized applicants…</li>
          ) : hits.length === 0 ? (
            <li className="text-muted-foreground">No authorized applicants to link.</li>
          ) : (
            hits.map((c) => (
              <li key={c.applicationId}>
                <button
                  type="button"
                  disabled={c.alreadyLinked}
                  className={`w-full rounded px-2 py-1.5 text-left ${
                    pickedId === c.applicationId ? "bg-secondary" : "hover:bg-muted"
                  } ${c.alreadyLinked ? "cursor-not-allowed opacity-50" : ""}`}
                  onClick={() => setPickedId(c.applicationId)}
                >
                  {c.applicantName} · {c.applicationNo}
                  {c.alreadyLinked
                    ? " (on this sitting)"
                    : c.linkedMeetingLabel
                      ? ` (currently: ${c.linkedMeetingLabel})`
                      : ""}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {interviews.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading interviews…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applicants linked to this sitting yet.</p>
      ) : (
        <ul className="space-y-2 rounded-md border bg-background p-3 text-sm">
          {rows.map((row) => (
            <li key={row.interviewId} className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="font-medium">{row.applicantName}</span>{" "}
                <span className="text-xs text-muted-foreground">{row.applicationNo}</span>
              </span>
              <span className={interviewStatusClass(row.statusName)}>
                {row.outcome
                  ? row.outcome === "Positive"
                    ? "Cleared for temporary status"
                    : row.outcome
                  : "Evaluate on Short interview"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
