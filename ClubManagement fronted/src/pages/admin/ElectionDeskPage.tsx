import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Send, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentCommittee, type CommitteeMember } from "@/pages/admin/committee/committeeDesk";
import {
  FieldLabel,
  InfoTip,
  StatusDot,
  ballotCloseAt,
  formatWhen,
  initials,
  instructionLabel,
  proxyReviewStatus,
  proxyStatusLabel,
  proxyStatusTone,
  useElectionDesk,
  type AgendaTally,
  type Desk,
  type DeskProxy,
  type MemberHit,
  type Nomination,
} from "@/pages/admin/electionDeskShared";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { cn } from "@/utils/cn";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

function PersonChip({
  name,
  photoUrl,
  role,
}: {
  name?: string | null;
  photoUrl?: string | null;
  role?: string | null;
}) {
  if (!name) return <span className="text-muted-foreground">Select</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7">
        {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
        <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">
        {name}
        {role ? <span className="text-muted-foreground"> · {role}</span> : null}
      </span>
    </span>
  );
}

function OfficerSelect({
  label,
  value,
  onChange,
  officers,
  fallbackName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  officers: CommitteeMember[];
  fallbackName?: string | null;
}) {
  const selected = officers.find((m) => String(m.profileId) === value);
  return (
    <label className="grid gap-1 text-sm">
      <Label>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <span className="min-w-0 truncate text-left">
            {selected ? `${selected.profileName} · ${selected.roleName}` : fallbackName || "Select"}
          </span>
        </SelectTrigger>
        <SelectContent>
          {officers.map((m) => (
            <SelectItem key={`${label}-${m.profileId}`} value={String(m.profileId)}>
              {m.profileName} · {m.roleName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function DeskStatus({
  desk,
  current,
  children,
}: {
  desk: ReturnType<typeof useElectionDesk>["desk"];
  current?: Desk;
  children: ReactNode;
}) {
  if (desk.isLoading) {
    return <PageBodyLoading label="Loading election desk…" />;
  }
  if (desk.isError) {
    return <p className="text-sm text-destructive">{extractErrorMessage(desk.error)}</p>;
  }
  if (!current) {
    return <p className="text-sm text-muted-foreground">No general meeting published yet.</p>;
  }
  return <>{children}</>;
}

/** @deprecated Prefer section pages under /election/* */
export function ElectionDeskPage() {
  return <MeetingNoticeDeskPage />;
}

const emptyNoticeForm = () => ({
  meetingType: "AGM",
  meetingDate: kenyaTodayISO(),
  noticeSentDate: kenyaTodayISO(),
  venue: "Clubhouse, Wilson Airport, Nairobi",
  agenda: "",
  papersUrl: "",
});

export function MeetingNoticeDeskPage() {
  const { desk, meetings, current, invalidate } = useElectionDesk();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [notice, setNotice] = useState(emptyNoticeForm);

  const resetForm = () => {
    setEditingId(null);
    setNotice(emptyNoticeForm());
  };

  const startEdit = (row: Desk) => {
    setEditingId(row.meeting.generalMeetingId);
    setNotice({
      meetingType: row.meeting.meetingType || "AGM",
      meetingDate: row.meeting.meetingDate || kenyaTodayISO(),
      noticeSentDate: row.meeting.noticeSentDate || kenyaTodayISO(),
      venue: row.meeting.venue || "Clubhouse, Wilson Airport, Nairobi",
      agenda: row.meeting.agenda || "",
      papersUrl: row.meeting.papersUrl || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const publish = useMutation({
    mutationFn: () =>
      apiRequest("/api/elections", {
        method: "POST",
        body: JSON.stringify(notice),
      }),
    onSuccess: () => {
      toast.success("AGM/EGM notice published.");
      resetForm();
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const update = useMutation({
    mutationFn: () =>
      apiRequest(`/api/elections/meetings/${editingId}/notice`, {
        method: "PUT",
        body: JSON.stringify(notice),
      }),
    onSuccess: () => {
      toast.success("Meeting notice updated.");
      resetForm();
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const saving = publish.isPending || update.isPending;
  const isEditing = editingId != null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isEditing ? "Update meeting notice" : "Publish meeting notice"}
            <InfoTip text="AGM notices need at least 14 clear days; EGMs 21 clear days. Temporary members cannot vote or run for office. Scheduled notices can be edited until the result is declared." />
          </CardTitle>
          <CardDescription>
            {isEditing
              ? `Editing scheduled meeting.`
              : "Date, agenda, papers and meeting type."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <FieldLabel tip="Annual General Meeting or Extraordinary General Meeting.">Meeting type</FieldLabel>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={notice.meetingType}
                onChange={(e) => setNotice((n) => ({ ...n, meetingType: e.target.value }))}
              >
                <option value="AGM">AGM</option>
                <option value="EGM">EGM</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <FieldLabel>Meeting date</FieldLabel>
              <Input
                type="date"
                value={notice.meetingDate}
                onChange={(e) => setNotice((n) => ({ ...n, meetingDate: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <FieldLabel>Notice sent</FieldLabel>
              <Input
                type="date"
                value={notice.noticeSentDate}
                onChange={(e) => setNotice((n) => ({ ...n, noticeSentDate: e.target.value }))}
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <FieldLabel>Venue</FieldLabel>
            <Input value={notice.venue} onChange={(e) => setNotice((n) => ({ ...n, venue: e.target.value }))} />
          </label>
          <label className="grid gap-1 text-sm">
            <FieldLabel>Agenda</FieldLabel>
            <Textarea
              value={notice.agenda}
              onChange={(e) => setNotice((n) => ({ ...n, agenda: e.target.value }))}
            />
            <span className="text-xs text-muted-foreground">{notice.agenda.length} characters</span>
          </label>
          <label className="grid gap-1 text-sm">
            <FieldLabel>Papers URL</FieldLabel>
            <Input
              value={notice.papersUrl}
              onChange={(e) => setNotice((n) => ({ ...n, papersUrl: e.target.value }))}
              placeholder="https://…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={saving}
              onClick={() => (isEditing ? update.mutate() : publish.mutate())}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : isEditing ? <Pencil className="size-4" /> : <Send className="size-4" />}
              {isEditing ? "Save changes" : "Publish notice"}
            </Button>
            {isEditing ? (
              <Button type="button" variant="outline" disabled={saving} onClick={resetForm}>
                <X className="size-4" />
                Cancel
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {desk.isLoading ? (
        <PageBodyLoading label="Loading election desk…" />
      ) : desk.isError ? (
        <p className="text-sm text-destructive">{extractErrorMessage(desk.error)}</p>
      ) : meetings.length > 0 ? (
        <div className="grid gap-3">
          {/* <p className="text-sm text-muted-foreground">
            {meetings.length} published notice{meetings.length === 1 ? "" : "s"}. Officers, tally, proxies and
            nominations use the active scheduled meeting
            {current ? ` (${current.meeting.meetingType} · ${current.meeting.meetingDate})` : ""}.
          </p> */}
          {meetings.map((row) => {
            const status = (row.meeting.status ?? "").toUpperCase();
            const held = status === "HELD";
            const cancelled = status === "CANCELLED";
            const scheduled = !held && !cancelled;
            const badgeClass = held
              ? "bg-slate-600"
              : cancelled
                ? "bg-rose-700"
                : "bg-emerald-600";
            const badgeLabel = held ? "Held" : cancelled ? "Cancelled" : "Scheduled";
            const isActiveEdit = editingId === row.meeting.generalMeetingId;
            return (
              <Card
                key={row.meeting.generalMeetingId}
                className={cn(isActiveEdit && "ring-2 ring-primary/40")}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>
                      {row.meeting.meetingType} · {row.meeting.meetingDate}
                      {row.meeting.venue ? ` · ${row.meeting.venue}` : ""}
                    </CardTitle>
                    <CardDescription>{row.meeting.noticePeriodDetail}</CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {scheduled ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={isActiveEdit ? "default" : "outline"}
                        onClick={() => (isActiveEdit ? resetForm() : startEdit(row))}
                      >
                        <Pencil className="size-3.5" />
                        {isActiveEdit ? "Editing" : "Edit"}
                      </Button>
                    ) : null}
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold text-white", badgeClass)}>
                      {badgeLabel}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{row.meeting.agenda || "No agenda text yet."}</p>
                  {row.meeting.papersUrl ? (
                    <a
                      className="font-medium text-primary"
                      href={row.meeting.papersUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Meeting papers
                    </a>
                  ) : null}
                  {row.resultSummary ? (
                    <p className="rounded-md border bg-muted/40 px-3 py-2">{row.resultSummary}</p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No general meeting published yet.</p>
      )}
    </div>
  );
}

export function OfficersBallotDeskPage() {
  const committee = useCurrentCommittee();
  const officers = committee.data?.members ?? [];
  const { desk, current, meetingId, invalidate } = useElectionDesk();
  const [conductorId, setConductorId] = useState("");
  const [scrutineer1, setScrutineer1] = useState("");
  const [scrutineer2, setScrutineer2] = useState("");

  useEffect(() => {
    if (!current) return;
    if (current.conductorProfileId) setConductorId(String(current.conductorProfileId));
    if (current.scrutineer1ProfileId) setScrutineer1(String(current.scrutineer1ProfileId));
    if (current.scrutineer2ProfileId) setScrutineer2(String(current.scrutineer2ProfileId));
  }, [current]);

  const setWindow = useMutation({
    mutationFn: (open: boolean) =>
      apiRequest(`/api/elections/meetings/${meetingId}/window`, {
        method: "POST",
        body: JSON.stringify({
          open,
          conductorProfileId: open
            ? Number(conductorId) || current?.conductorProfileId || undefined
            : undefined,
        }),
      }),
    onSuccess: (_d, open) => {
      toast.success(
        open
          ? "Electronic balloting window opened. It must close at least 48 hours before the meeting (Article 65)."
          : "Window closed.",
      );
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const appointOfficers = useMutation({
    mutationFn: () =>
      apiRequest(`/api/elections/meetings/${meetingId}/officers`, {
        method: "POST",
        body: JSON.stringify({
          scrutineer1ProfileId: Number(scrutineer1) || undefined,
          scrutineer2ProfileId: Number(scrutineer2) || undefined,
          returningOfficerProfileId: Number(conductorId) || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success("Officers appointed.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const windowTone = current?.resultDeclaredAt
    ? "closed"
    : current?.ballotWindowOpen
      ? "open"
      : "idle";
  const windowLabel = current?.resultDeclaredAt
    ? "Closed"
    : current?.ballotWindowOpen
      ? "Open"
      : "Not yet open";

  return (
    <DeskStatus desk={desk} current={current}>
      {current ? (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Scrutineers &amp; returning officer</CardTitle>
              <CardDescription>
                Officers must be sitting Committee members.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <OfficerSelect
                  label="Scrutineer 1"
                  value={scrutineer1}
                  onChange={setScrutineer1}
                  officers={officers}
                  fallbackName={current.scrutineer1Name}
                />
                <OfficerSelect
                  label="Scrutineer 2"
                  value={scrutineer2}
                  onChange={setScrutineer2}
                  officers={officers}
                  fallbackName={current.scrutineer2Name}
                />
                <OfficerSelect
                  label="Returning officer"
                  value={conductorId}
                  onChange={setConductorId}
                  officers={officers}
                  fallbackName={current.conductorName}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Appointed: {current.scrutineer1Name ?? "—"} and {current.scrutineer2Name ?? "—"} · returning officer{" "}
                {current.conductorName ?? "—"}
              </p>
              <Button type="button" disabled={appointOfficers.isPending} onClick={() => appointOfficers.mutate()}>
                Save officers
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Electronic balloting window
                  <InfoTip text="Electronic votes close at least 48 hours before the meeting. A proxy instrument must be lodged 48 hours before (24 hours for a poll) (Article 65)." />
                </CardTitle>
                <CardDescription>
                  The returning officer must already be appointed.
                </CardDescription>
              </div>
              <StatusDot label={windowLabel} tone={windowTone} />
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1 text-sm">
                  <span className="font-medium">Start time</span>
                  <p className="rounded-md border border-input bg-muted/40 px-3 py-2">
                    {current.ballotOpensAt
                      ? formatWhen(current.ballotOpensAt)
                      : "Set automatically when the window is opened"}
                  </p>
                </div>
                <div className="grid gap-1 text-sm">
                  <span className="font-medium">Close time</span>
                  <p className="rounded-md border border-input bg-muted/40 px-3 py-2">
                    {formatWhen(current.ballotClosesAt ?? ballotCloseAt(current.meeting.meetingDate))}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Returning officer {current.conductorName ?? "not appointed"} · closes 48 hours before the meeting
                (Article 65)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" disabled={setWindow.isPending} onClick={() => setWindow.mutate(true)}>
                  Open window
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={setWindow.isPending}
                  onClick={() => setWindow.mutate(false)}
                >
                  Close window
                </Button>
                {current.ballotWindowOpen ? null : <StatusDot label="Closed" tone="closed" />}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </DeskStatus>
  );
}

export function LiveTallyDeskPage() {
  const { desk, current, meetingId, invalidate } = useElectionDesk();
  const [agendaSubject, setAgendaSubject] = useState("");
  const [detail, setDetail] = useState<AgendaTally | null>(null);

  const addAgenda = useMutation({
    mutationFn: () =>
      apiRequest(`/api/elections/meetings/${meetingId}/agenda`, {
        method: "POST",
        body: JSON.stringify({ subject: agendaSubject, isSpecialBusiness: false }),
      }),
    onSuccess: () => {
      setAgendaSubject("");
      toast.success("Resolution / seat added.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const declare = useMutation({
    mutationFn: () => apiRequest(`/api/elections/meetings/${meetingId}/declare`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Result declared. The Chairman's declaration is final and conclusive (Article 60).");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const quorumNeeded = current?.quorumRequired ?? 20;
  const uniqueVoters = current?.uniqueVoters ?? 0;
  const quorumPct = Math.min(100, (uniqueVoters / Math.max(quorumNeeded, 1)) * 100);

  return (
    <>
      <DeskStatus desk={desk} current={current}>
        {current ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Live tally &amp; results
                <InfoTip text="Quorum is 20 Full, Life, Country or Overseas members. The Chairman's declaration is final and conclusive. Only approved proxies count." />
              </CardTitle>
              <CardDescription>
                Votes for and against each resolution. Temporary members have no vote.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">
                    Quorum {uniqueVoters} of {quorumNeeded}
                  </span>
                  <span className={current.quorumMet ? "text-emerald-700" : "text-red-600"}>
                    {current.quorumMet ? "Quorum met" : "Quorum not met"}
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", current.quorumMet ? "bg-emerald-600" : "bg-red-500")}
                    style={{ width: `${quorumPct}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add resolution or seat"
                  value={agendaSubject}
                  onChange={(e) => setAgendaSubject(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={addAgenda.isPending || agendaSubject.trim().length < 3}
                  onClick={() => addAgenda.mutate()}
                >
                  Add
                </Button>
              </div>
              {current.agenda.length === 0 ? (
                <p className="text-sm text-muted-foreground">No resolutions or seats yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seat</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total votes</TableHead>
                      <TableHead>Results summary</TableHead>
                      <TableHead className="text-right"> </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {current.agenda.map((row) => {
                      const status = current.resultDeclaredAt
                        ? "Published"
                        : current.ballotWindowOpen
                          ? "Open"
                          : "Closed";
                      return (
                        <TableRow key={row.agendaItemId}>
                          <TableCell className="text-muted-foreground">
                            {row.isSpecialBusiness ? "Special" : "Ordinary"}
                          </TableCell>
                          <TableCell className="font-medium">{row.subject}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-semibold text-white",
                                status === "Published" && "bg-emerald-700",
                                status === "Closed" && "bg-emerald-600",
                                status === "Open" && "bg-sky-600",
                              )}
                            >
                              {status}
                            </span>
                          </TableCell>
                          <TableCell>{row.votesCast}</TableCell>
                          <TableCell className="text-muted-foreground">
                            FOR {row.forCount} AGAINST {row.againstCount}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              className="text-sm font-medium text-primary"
                              onClick={() => setDetail(row)}
                            >
                              View details
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <Button
                type="button"
                disabled={declare.isPending || Boolean(current.resultDeclaredAt)}
                onClick={() => declare.mutate()}
              >
                Declare result
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </DeskStatus>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.subject}</DialogTitle>
            <DialogDescription>
              {detail?.isSpecialBusiness ? "Special resolution" : "Ordinary resolution"}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="grid gap-2 text-sm">
              <p>
                <span className="text-emerald-700">For {detail.forCount}</span>
                {" · "}
                <span className="text-red-600">Against {detail.againstCount}</span>
                {" · "}
                <span className="text-muted-foreground">Abstained {detail.abstainCount ?? 0}</span>
              </p>
              <p className="text-muted-foreground">{detail.votesCast} votes cast</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LodgedProxiesDeskPage() {
  const { desk, current, meetingId, invalidate } = useElectionDesk();
  const [rejectProxy, setRejectProxy] = useState<DeskProxy | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const proxies = current?.proxies ?? [];

  const reviewProxy = useMutation({
    mutationFn: (payload: { proxyId: number; decision: "APPROVE" | "REJECT"; reason?: string }) =>
      apiRequest(`/api/elections/meetings/${meetingId}/proxies/${payload.proxyId}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision: payload.decision,
          reason: payload.reason || null,
        }),
      }),
    onSuccess: (_d, payload) => {
      setRejectProxy(null);
      setRejectReason("");
      toast.success(payload.decision === "APPROVE" ? "Proxy approved." : "Proxy rejected.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <>
      <DeskStatus desk={desk} current={current}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Lodged proxies
              <InfoTip text="A proxy must reach the Returning Officer at least 48 hours before the meeting, or 24 hours for a poll (Article 65). On-time instruments await Returning Officer review before they count toward quorum or the tally." />
            </CardTitle>
            <CardDescription>
              Review instruments before they count. Late lodgements skip review and never count.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {proxies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No proxy appointments lodged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Appointing member</TableHead>
                    <TableHead>Proxy</TableHead>
                    <TableHead>Instruction</TableHead>
                    <TableHead>Lodged</TableHead>
                    <TableHead>Notify</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proxies.map((row) => {
                    const status = proxyReviewStatus(row);
                    const pending = status === "PENDING";
                    return (
                      <TableRow key={row.proxyId}>
                        <TableCell>{row.appointingName || "—"}</TableCell>
                        <TableCell>
                          {row.proxyName || "—"}
                          {row.proxyMembershipNo ? (
                            <span className="text-muted-foreground"> · {row.proxyMembershipNo}</span>
                          ) : null}
                          {row.linkedMember ? (
                            <p className="text-xs text-muted-foreground">Linked member</p>
                          ) : null}
                        </TableCell>
                        <TableCell>{instructionLabel(row)}</TableCell>
                        <TableCell>{formatWhen(row.instrumentReceivedAt)}</TableCell>
                        <TableCell>
                          {row.manualContactRequired ? (
                            <span
                              className="rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white"
                              title="No member account linked — notify this person manually"
                            >
                              Manual contact
                            </span>
                          ) : (
                            <span className="rounded-full bg-sky-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                              Notified
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-semibold text-white",
                                proxyStatusTone(status),
                              )}
                            >
                              {proxyStatusLabel(status)}
                            </span>
                            {status === "REJECTED" && row.reviewReason ? (
                              <p className="text-xs text-muted-foreground">{row.reviewReason}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {pending ? (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={reviewProxy.isPending}
                                onClick={() =>
                                  reviewProxy.mutate({ proxyId: row.proxyId, decision: "APPROVE" })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={reviewProxy.isPending}
                                onClick={() => {
                                  setRejectReason("");
                                  setRejectProxy(row);
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </DeskStatus>

      <Dialog
        open={Boolean(rejectProxy)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectProxy(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject proxy?</DialogTitle>
            <DialogDescription>
              Rejected proxies do not count toward quorum or the vote tally. This decision cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Reason (optional)</span>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. signature mismatch, appointing member not in good standing"
              rows={3}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectProxy(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reviewProxy.isPending || !rejectProxy}
              onClick={() => {
                if (!rejectProxy) return;
                reviewProxy.mutate({
                  proxyId: rejectProxy.proxyId,
                  decision: "REJECT",
                  reason: rejectReason.trim() || undefined,
                });
              }}
            >
              {reviewProxy.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Reject proxy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NominationsDeskPage() {
  const { desk, current, meetingId, invalidate } = useElectionDesk();
  const [nomSearch, setNomSearch] = useState("");
  const [nomination, setNomination] = useState({
    nomineeProfileId: 0,
    proposerProfileId: 0,
    seconderProfileId: 0,
    roleStandingFor: "",
  });

  const hits = useQuery({
    queryKey: ["elections", "members", nomSearch],
    queryFn: () =>
      apiRequest<MemberHit[]>(`/api/elections/members?search=${encodeURIComponent(nomSearch.trim())}`),
    enabled: nomSearch.trim().length >= 2,
  });

  const nominate = useMutation({
    mutationFn: () =>
      apiRequest(`/api/elections/meetings/${meetingId}/nominations`, {
        method: "POST",
        body: JSON.stringify(nomination),
      }),
    onSuccess: () => {
      toast.success("Nomination recorded.");
      setNomination({ nomineeProfileId: 0, proposerProfileId: 0, seconderProfileId: 0, roleStandingFor: "" });
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const pick = (field: "nomineeProfileId" | "proposerProfileId" | "seconderProfileId", hit: MemberHit) => {
    if (!hit.eligibleToNominate) {
      toast.error(
        "Must be Life/Full/Country/Overseas with ≥3 years (Article 20). Temporary members cannot nominate (Bye-Laws).",
      );
      return;
    }
    setNomination((n) => ({ ...n, [field]: hit.profileId }));
  };

  const nominatedNames = useMemo(() => {
    const map = new Map<number, string>();
    (hits.data ?? []).forEach((hit) => map.set(hit.profileId, hit.name));
    return map;
  }, [hits.data]);

  const nominationsByRole = useMemo(() => {
    const groups = new Map<string, Nomination[]>();
    for (const row of current?.nominations ?? []) {
      const key = row.roleStandingFor.trim() || "Committee member";
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [current?.nominations]);

  return (
    <DeskStatus desk={desk} current={current}>
      {current ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Nominations &amp; committee positions
              <InfoTip text="Nominations must be submitted at least 14 days before the meeting, signed by a proposer and seconder who are Life, Full, Country or Overseas members of at least three consecutive years (Article 20)." />
            </CardTitle>
            <CardDescription>
              Deadline {current.nominationDeadline ?? "—"}.{" "}
              {current.nominationsOpen ? "Nominations are open." : "Nominations are closed."} Temporary members
              cannot run for office.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="space-y-3">
              {nominationsByRole.length === 0 ? (
                <p className="text-sm text-muted-foreground">No nominations yet.</p>
              ) : (
                nominationsByRole.map(([role, rows]) => (
                  <div key={role} className="rounded-xl border border-border p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {role}
                    </p>
                    <div className="mt-3 space-y-3">
                      {rows.map((row) => (
                        <div key={row.electionNominationId} className="rounded-lg bg-muted/40 p-3">
                          <PersonChip name={row.nomineeName} photoUrl={row.photoUrl} />
                          <p className="mt-2 text-xs text-muted-foreground">
                            Proposed by {row.proposerName}
                            <br />
                            Seconded by {row.seconderName}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="grid gap-3">
              <Input
                placeholder="Search nominee / proposer / seconder"
                value={nomSearch}
                onChange={(e) => setNomSearch(e.target.value)}
              />
              {nomSearch.trim().length >= 2 ? (
                <ul className="max-h-56 divide-y overflow-auto rounded-lg border text-sm">
                  {(hits.data ?? []).map((hit) => (
                    <li key={hit.profileId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>
                        {hit.name} · {hit.membershipNo} · {hit.classCode} · {hit.continuousYears} yrs
                        {!hit.eligibleToNominate ? " · not eligible" : ""}
                      </span>
                      <span className="flex gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => pick("nomineeProfileId", hit)}>
                          Nominee
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => pick("proposerProfileId", hit)}
                        >
                          Proposer
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => pick("seconderProfileId", hit)}
                        >
                          Seconder
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Input
                placeholder="Position standing for"
                value={nomination.roleStandingFor}
                onChange={(e) => setNomination((n) => ({ ...n, roleStandingFor: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Nominee {nominatedNames.get(nomination.nomineeProfileId) ?? (nomination.nomineeProfileId || "—")} ·
                Proposer {nominatedNames.get(nomination.proposerProfileId) ?? (nomination.proposerProfileId || "—")} ·
                Seconder {nominatedNames.get(nomination.seconderProfileId) ?? (nomination.seconderProfileId || "—")}
              </p>
              <Button
                type="button"
                disabled={nominate.isPending || current.nominationsOpen === false}
                onClick={() => nominate.mutate()}
              >
                Record nomination
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </DeskStatus>
  );
}
