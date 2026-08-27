import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ApiError, apiRequest, extractErrorMessage } from "@/services/membership/api";

type CommitteeMember = {
  committeeMemberId: number;
  profileId: number;
  profileName: string;
  membershipNo?: string | null;
  committeeRoleId: number;
  roleCode: string;
  roleName: string;
  roleSortOrder: number;
  canApproveCredit: boolean;
  isAviationAffiliated: boolean;
  appointedDate?: string | null;
  isActive: boolean;
};

type CommitteeMeeting = {
  committeeMeetingId: number;
  meetingTypeId: number;
  meetingTypeCode: string;
  meetingTypeName: string;
  meetingDate: string;
  meetingTime?: string | null;
  meetingName?: string | null;
  chairProfileId?: number | null;
  chairName?: string | null;
  status: string;
  minutesUrl?: string | null;
  linkedInterviewCount?: number;
  pendingOutcomeCount?: number;
};

type MeetingInterview = {
  interviewId: number;
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  statusCode?: string | null;
  statusName?: string | null;
  outcome?: string | null;
  notes?: string | null;
  attendedFlag: boolean;
  outcomeRecorded: boolean;
  conductedAt?: string | null;
};

type InterviewCandidate = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  statusCode?: string | null;
  statusName?: string | null;
  alreadyLinked: boolean;
};

type CommitteeDetail = {
  committeeId: number;
  committeeName: string;
  type: string;
  termStart?: string | null;
  termEnd?: string | null;
  isActive: boolean;
  members: CommitteeMember[];
  meetings: CommitteeMeeting[];
  nextMeeting?: CommitteeMeeting | null;
  nonOfficerCount: number;
  aviationActiveNonOfficers: number;
  aviationRuleMet: boolean;
};

type RoleOption = {
  committeeRoleId: number;
  code: string;
  name: string;
  sortOrder: number;
  canApproveCredit: boolean;
  isOfficer: boolean;
};

type MeetingTypeOption = {
  meetingTypeId: number;
  code: string;
  name: string;
  sortOrder: number;
};

type ProfileHit = {
  profileId: number;
  name: string;
  membershipNo?: string | null;
  isAviationAffiliated: boolean;
};

export function ManageCommitteePage() {
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { section?: string };
  const [termForm, setTermForm] = useState({
    committeeName: "",
    termStart: "",
    termEnd: "",
  });
  const [editForm, setEditForm] = useState({
    committeeName: "",
    termStart: "",
    termEnd: "",
  });
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [appointedDate, setAppointedDate] = useState(kenyaTodayISO());
  const [meetingForm, setMeetingForm] = useState({
    meetingTypeId: "",
    meetingDate: kenyaTodayISO(),
    meetingTime: "10:00",
    meetingName: "",
  });
  const [minutesDraft, setMinutesDraft] = useState<Record<number, string>>({});
  const [expandedMeetingId, setExpandedMeetingId] = useState<number | null>(null);

  const current = useQuery({
    queryKey: ["committee", "current", "main"],
    queryFn: async () => {
      try {
        return await apiRequest<CommitteeDetail>("/api/committees/current?type=main");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

  const roles = useQuery({
    queryKey: ["committee", "roles"],
    queryFn: () => apiRequest<RoleOption[]>("/api/committees/meta/roles"),
  });

  const meetingTypes = useQuery({
    queryKey: ["committee", "meeting-types"],
    queryFn: () => apiRequest<MeetingTypeOption[]>("/api/committees/meta/meeting-types"),
  });

  const profileHits = useQuery({
    queryKey: ["committee", "profiles", memberSearch],
    queryFn: () =>
      apiRequest<ProfileHit[]>(
        `/api/committees/meta/profiles?search=${encodeURIComponent(memberSearch.trim())}`,
      ),
    enabled: memberSearch.trim().length >= 2,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["committee"] });
  };

  const createTerm = useMutation({
    mutationFn: () =>
      apiRequest<CommitteeDetail>("/api/committees", {
        method: "POST",
        body: JSON.stringify({
          committeeName: termForm.committeeName.trim(),
          termStart: termForm.termStart || null,
          termEnd: termForm.termEnd || null,
          type: "main",
        }),
      }),
    onSuccess: (data) => {
      toast.success(`Created “${data.committeeName}”. Previous active term was closed.`);
      setTermForm({ committeeName: "", termStart: "", termEnd: "" });
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const updateTerm = useMutation({
    mutationFn: () => {
      if (!current.data) throw new Error("No active committee.");
      return apiRequest<CommitteeDetail>(`/api/committees/${current.data.committeeId}`, {
        method: "PUT",
        body: JSON.stringify({
          committeeName: editForm.committeeName.trim(),
          termStart: editForm.termStart || null,
          termEnd: editForm.termEnd || null,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Committee term updated.");
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const addMember = useMutation({
    mutationFn: () => {
      if (!current.data || !selectedProfileId || !selectedRoleId) {
        throw new Error("Select a member and role.");
      }
      return apiRequest(`/api/committees/${current.data.committeeId}/members`, {
        method: "POST",
        body: JSON.stringify({
          profileId: selectedProfileId,
          committeeRoleId: Number(selectedRoleId),
          appointedDate,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Member appointed.");
      setSelectedProfileId(null);
      setMemberSearch("");
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const removeMember = useMutation({
    mutationFn: (committeeMemberId: number) => {
      if (!current.data) throw new Error("No active committee.");
      return apiRequest(
        `/api/committees/${current.data.committeeId}/members/${committeeMemberId}`,
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      toast.success("Member removed from this term.");
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const createMeeting = useMutation({
    mutationFn: () => {
      if (!current.data) throw new Error("No active committee.");
      return apiRequest(`/api/committees/${current.data.committeeId}/meetings`, {
        method: "POST",
        body: JSON.stringify({
          meetingTypeId: Number(meetingForm.meetingTypeId),
          meetingDate: meetingForm.meetingDate,
          meetingTime: meetingForm.meetingTime,
          meetingName: meetingForm.meetingName.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Meeting scheduled.");
      setMeetingForm((f) => ({ ...f, meetingName: "" }));
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

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
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  function markHeld(meeting: CommitteeMeeting) {
    const pending = meeting.pendingOutcomeCount ?? 0;
    if (pending > 0) {
      const ok = window.confirm(
        `${pending} linked interview(s) still have no outcome. Mark this meeting Held anyway?`,
      );
      if (!ok) return;
      setStatus.mutate({ meetingId: meeting.committeeMeetingId, status: "HELD", force: true });
      return;
    }
    setStatus.mutate({ meetingId: meeting.committeeMeetingId, status: "HELD" });
  }

  const setMinutes = useMutation({
    mutationFn: ({ meetingId, minutesUrl }: { meetingId: number; minutesUrl: string }) =>
      apiRequest(`/api/committees/meetings/${meetingId}/minutes`, {
        method: "PATCH",
        body: JSON.stringify({ minutesUrl }),
      }),
    onSuccess: () => {
      toast.success("Link saved and shared with committee members and applicants.");
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const committee = current.data;
  const busy =
    createTerm.isPending ||
    updateTerm.isPending ||
    addMember.isPending ||
    removeMember.isPending ||
    createMeeting.isPending ||
    setStatus.isPending ||
    setMinutes.isPending;

  useEffect(() => {
    if (committee) {
      setEditForm({
        committeeName: committee.committeeName,
        termStart: committee.termStart ?? "",
        termEnd: committee.termEnd ?? "",
      });
    }
  }, [committee?.committeeId, committee?.committeeName, committee?.termStart, committee?.termEnd]);

  useEffect(() => {
    const section = search.section || "new-term";
    const el = document.getElementById(`section-${section}`);
    if (el) {
      window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [search.section, committee?.committeeId]);

  return (
    <PageFrame>
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Committee manage"
        description="Create a term, appoint officers and members (Article 19), and schedule Committee meetings. Membership admission ballots are on Committee Ballot."
      />

      <div className="space-y-10">
        <section id="section-new-term" className="scroll-mt-24 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Committee manage
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">New committee term</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Creating a new term deactivates the previous active committee of the same type.
            </p>
          </div>
          <Card>
            <CardContent className="grid gap-3 pt-6">
              <label className="grid gap-1 text-sm">
                <Label htmlFor="new-name">Committee name</Label>
                <Input
                  id="new-name"
                  value={termForm.committeeName}
                  onChange={(e) => setTermForm((f) => ({ ...f, committeeName: e.target.value }))}
                  placeholder="e.g. Main Committee 2026–2027"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <Label htmlFor="new-start">Term start</Label>
                  <Input
                    id="new-start"
                    type="date"
                    value={termForm.termStart}
                    onChange={(e) => setTermForm((f) => ({ ...f, termStart: e.target.value }))}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <Label htmlFor="new-end">Term end</Label>
                  <Input
                    id="new-end"
                    type="date"
                    value={termForm.termEnd}
                    onChange={(e) => setTermForm((f) => ({ ...f, termEnd: e.target.value }))}
                  />
                </label>
              </div>
              <Button
                type="button"
                disabled={busy || termForm.committeeName.trim().length < 3}
                onClick={() => createTerm.mutate()}
              >
                {createTerm.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create term
              </Button>
            </CardContent>
          </Card>
        </section>

        <section id="section-current-term" className="scroll-mt-24 space-y-4 border-t border-border pt-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Current term</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {committee
                ? `${committee.committeeName}${committee.termStart ? ` · ${committee.termStart}` : ""}${
                    committee.termEnd ? ` → ${committee.termEnd}` : ""
                  }`
                : "No active committee yet."}
            </p>
          </div>
          <Card>
            <CardContent className="grid gap-3 pt-6">
              {current.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !committee ? (
                <p className="text-sm text-muted-foreground">Create a term to begin.</p>
              ) : (
                <>
                  <label className="grid gap-1 text-sm">
                    <Label htmlFor="edit-name">Committee name</Label>
                    <Input
                      id="edit-name"
                      value={editForm.committeeName}
                      onChange={(e) => setEditForm((f) => ({ ...f, committeeName: e.target.value }))}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <Label htmlFor="edit-start">Term start</Label>
                      <Input
                        id="edit-start"
                        type="date"
                        value={editForm.termStart}
                        onChange={(e) => setEditForm((f) => ({ ...f, termStart: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label htmlFor="edit-end">Term end</Label>
                      <Input
                        id="edit-end"
                        type="date"
                        value={editForm.termEnd}
                        onChange={(e) => setEditForm((f) => ({ ...f, termEnd: e.target.value }))}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Non-officer members: {committee.nonOfficerCount}/8 · Aviation-active:{" "}
                    {committee.aviationActiveNonOfficers}
                    {committee.aviationRuleMet ? "" : " — Article 19 not met yet"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || editForm.committeeName.trim().length < 3}
                    onClick={() => updateTerm.mutate()}
                  >
                    {updateTerm.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Save term details
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section id="section-members" className="scroll-mt-24 space-y-4 border-t border-border pt-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Members</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Officers first by role sort order. Soft-remove sets end date — records are kept.
            </p>
          </div>
          {!committee ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Create a committee term first to appoint members.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="grid gap-4 pt-6">
                <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_auto_auto]">
                  <label className="grid gap-1 text-sm">
                    <Label>Search member</Label>
                    <Input
                      value={memberSearch}
                      onChange={(e) => {
                        setMemberSearch(e.target.value);
                        setSelectedProfileId(null);
                      }}
                      placeholder="Name or membership no."
                    />
                    {profileHits.data && profileHits.data.length > 0 ? (
                      <div className="max-h-40 overflow-auto rounded-md border bg-background">
                        {profileHits.data.map((hit) => (
                          <button
                            key={hit.profileId}
                            type="button"
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                              selectedProfileId === hit.profileId ? "bg-muted" : ""
                            }`}
                            onClick={() => {
                              setSelectedProfileId(hit.profileId);
                              setMemberSearch(
                                `${hit.name}${hit.membershipNo ? ` (${hit.membershipNo})` : ""}`,
                              );
                            }}
                          >
                            <span>{hit.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {hit.membershipNo ?? "—"}
                              {hit.isAviationAffiliated ? " · aviation" : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </label>
                  <label className="grid gap-1 text-sm">
                    <Label>Role</Label>
                    <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {(roles.data ?? []).map((role) => (
                          <SelectItem key={role.committeeRoleId} value={String(role.committeeRoleId)}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <Label>Appointed</Label>
                    <Input
                      type="date"
                      value={appointedDate}
                      onChange={(e) => setAppointedDate(e.target.value)}
                    />
                  </label>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      disabled={busy || !selectedProfileId || !selectedRoleId}
                      onClick={() => addMember.mutate()}
                    >
                      {addMember.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      Add
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Member</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">Aviation</th>
                        <th className="px-3 py-2">Appointed</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {committee.members.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                            No members appointed yet.
                          </td>
                        </tr>
                      ) : (
                        committee.members.map((m) => (
                          <tr key={m.committeeMemberId} className="border-t">
                            <td className="px-3 py-2">
                              <p className="font-medium">{m.profileName}</p>
                              <p className="text-xs text-muted-foreground">{m.membershipNo ?? "—"}</p>
                            </td>
                            <td className="px-3 py-2">{m.roleName}</td>
                            <td className="px-3 py-2">
                              {m.roleCode === "COMMITTEE_MEMBER"
                                ? m.isAviationAffiliated
                                  ? "Yes"
                                  : "No"
                                : "—"}
                            </td>
                            <td className="px-3 py-2">{m.appointedDate ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 text-destructive"
                                disabled={busy}
                                onClick={() => {
                                  if (window.confirm(`Remove ${m.profileName} from this term?`)) {
                                    removeMember.mutate(m.committeeMemberId);
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <section id="section-meetings" className="scroll-mt-24 space-y-4 border-t border-border pt-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Meetings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Schedule sittings, link applications under Interviews, record outcomes, then mark Held.
              Positive → Temporary Member; Negative → Not Elected.
            </p>
          </div>
          {!committee ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Create a committee term first to schedule meetings.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="grid gap-4 pt-6">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_1.2fr_auto]">
                  <label className="grid gap-1 text-sm">
                    <Label>Type</Label>
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
                  <label className="grid gap-1 text-sm">
                    <Label>Name</Label>
                    <Input
                      value={meetingForm.meetingName}
                      onChange={(e) => setMeetingForm((f) => ({ ...f, meetingName: e.target.value }))}
                      placeholder="Optional title"
                    />
                  </label>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      disabled={busy || !meetingForm.meetingTypeId || !meetingForm.meetingDate}
                      onClick={() => createMeeting.mutate()}
                    >
                      {createMeeting.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      Schedule
                    </Button>
                  </div>
                </div>

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
                      {committee.meetings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                            No meetings scheduled.
                          </td>
                        </tr>
                      ) : (
                        committee.meetings.map((m) => {
                          const expanded = expandedMeetingId === m.committeeMeetingId;
                          const canExpand = m.status === "SCHEDULED" || m.status === "HELD";
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
                                <td className="px-3 py-2">{m.status}</td>
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
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => markHeld(m)}
                                      >
                                        Held
                                      </Button>
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
                                      onChanged={invalidate}
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
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

function MeetingInterviewsPanel({
  meetingId,
  readOnly,
  onChanged,
}: {
  meetingId: number;
  readOnly?: boolean;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<
    Record<number, { outcome: string; notes: string; attended: boolean }>
  >({});

  const interviews = useQuery({
    queryKey: ["committee", "meeting-interviews", meetingId],
    queryFn: () =>
      apiRequest<MeetingInterview[]>(`/api/committees/meetings/${meetingId}/interviews`),
  });

  const candidates = useQuery({
    queryKey: ["committee", "interview-candidates", meetingId, search],
    queryFn: () =>
      apiRequest<InterviewCandidate[]>(
        `/api/committees/meetings/${meetingId}/interview-candidates?search=${encodeURIComponent(search.trim())}`,
      ),
    enabled: search.trim().length >= 2 && !readOnly,
  });

  const attach = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/committees/meetings/${meetingId}/interviews`, {
        method: "POST",
        body: JSON.stringify({ applicationId }),
      }),
    onSuccess: () => {
      toast.success("Application linked to this meeting.");
      setSearch("");
      void interviews.refetch();
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const saveOutcome = useMutation({
    mutationFn: ({
      interviewId,
      outcome,
      notes,
      attended,
    }: {
      interviewId: number;
      outcome: string;
      notes: string;
      attended: boolean;
    }) =>
      apiRequest(`/api/committees/interviews/${interviewId}/outcome`, {
        method: "PATCH",
        body: JSON.stringify({ outcome, notes, attended }),
      }),
    onSuccess: (_data, vars) => {
      const label =
        vars.outcome === "Positive"
          ? "Positive — Temporary Member"
          : vars.outcome === "Negative"
            ? "Negative — Not Elected"
            : "Deferred";
      toast.success(`Outcome saved (${label}).`);
      void interviews.refetch();
      onChanged();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  useEffect(() => {
    const next: Record<number, { outcome: string; notes: string; attended: boolean }> = {};
    for (const row of interviews.data ?? []) {
      next[row.interviewId] = {
        outcome: row.outcome || "",
        notes: row.notes || "",
        attended: row.attendedFlag,
      };
    }
    setDrafts(next);
  }, [interviews.data]);

  const rows = interviews.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Interviews</p>
          <p className="text-xs text-muted-foreground">
            Link applications to this sitting, then record Positive / Negative / Deferred.
          </p>
        </div>
      </div>

      {!readOnly ? (
        <div className="grid gap-2">
          <Label>Add application</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by applicant name or application no."
          />
          {candidates.data && candidates.data.length > 0 ? (
            <div className="max-h-40 overflow-auto rounded-md border bg-background">
              {candidates.data.map((c) => (
                <button
                  key={c.applicationId}
                  type="button"
                  disabled={c.alreadyLinked || attach.isPending}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() => attach.mutate(c.applicationId)}
                >
                  <span>
                    <span className="font-medium">{c.applicantName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.applicationNo}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.alreadyLinked ? "Linked" : c.statusName ?? c.statusCode}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {interviews.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading interviews…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications linked yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Applicant</th>
                <th className="px-3 py-2">App status</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.interviewId] ?? {
                  outcome: row.outcome || "",
                  notes: row.notes || "",
                  attended: row.attendedFlag,
                };
                return (
                  <tr key={row.interviewId} className="border-t align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.applicantName}</p>
                      <p className="text-xs text-muted-foreground">{row.applicationNo}</p>
                    </td>
                    <td className="px-3 py-2">{row.statusName ?? row.statusCode ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={draft.outcome || undefined}
                        onValueChange={(value) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.interviewId]: { ...draft, outcome: value },
                          }))
                        }
                        disabled={readOnly || saveOutcome.isPending}
                      >
                        <SelectTrigger className="h-8 w-[140px]">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Positive">Positive</SelectItem>
                          <SelectItem value="Negative">Negative</SelectItem>
                          <SelectItem value="Deferred">Deferred</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-8"
                        value={draft.notes}
                        disabled={readOnly || saveOutcome.isPending}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.interviewId]: { ...draft, notes: e.target.value },
                          }))
                        }
                        placeholder="Notes"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {!readOnly ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={saveOutcome.isPending || !draft.outcome}
                          onClick={() =>
                            saveOutcome.mutate({
                              interviewId: row.interviewId,
                              outcome: draft.outcome,
                              notes: draft.notes,
                              attended: draft.attended,
                            })
                          }
                        >
                          {saveOutcome.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Save
                        </Button>
                      ) : null}
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
