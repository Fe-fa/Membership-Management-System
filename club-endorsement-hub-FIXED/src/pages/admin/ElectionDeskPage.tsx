import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

type Notice = {
  generalMeetingId: number;
  meetingType: string;
  meetingDate: string;
  noticeSentDate?: string | null;
  agenda?: string | null;
  papersUrl?: string | null;
  venue?: string | null;
  status: string;
  requiredClearDays: number;
  actualClearDays: number;
  noticePeriodMet: boolean;
  noticePeriodDetail: string;
};

type AgendaTally = {
  agendaItemId: number;
  subject: string;
  isSpecialBusiness: boolean;
  forCount: number;
  againstCount: number;
  votesCast: number;
};

type Nomination = {
  electionNominationId: number;
  nomineeName: string;
  nomineeMembershipNo?: string | null;
  proposerName: string;
  seconderName: string;
  roleStandingFor: string;
};

type Desk = {
  meeting: Notice;
  ballotWindowOpen: boolean;
  ballotClosesAt?: string | null;
  conductorProfileId?: number | null;
  conductorName?: string | null;
  resultDeclaredAt?: string | null;
  resultSummary?: string | null;
  nominationDeadline?: string | null;
  nominationsOpen: boolean;
  uniqueVoters: number;
  quorumRequired: number;
  quorumMet: boolean;
  scrutineer1ProfileId?: number | null;
  scrutineer1Name?: string | null;
  scrutineer2ProfileId?: number | null;
  scrutineer2Name?: string | null;
  agenda: AgendaTally[];
  nominations: Nomination[];
};

type MemberHit = {
  profileId: number;
  name: string;
  membershipNo?: string | null;
  classCode: string;
  continuousYears: number;
  eligibleToNominate: boolean;
};

type CommitteeMember = {
  profileId: number;
  profileName: string;
  roleName: string;
};

type CommitteeDetail = {
  members: CommitteeMember[];
};

export function ElectionDeskPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState({
    meetingType: "AGM",
    meetingDate: kenyaTodayISO(),
    noticeSentDate: kenyaTodayISO(),
    venue: "Clubhouse, Wilson Airport, Nairobi",
    agenda: "",
    papersUrl: "",
  });
  const [agendaSubject, setAgendaSubject] = useState("");
  const [nomSearch, setNomSearch] = useState("");
  const [nomination, setNomination] = useState({
    nomineeProfileId: 0,
    proposerProfileId: 0,
    seconderProfileId: 0,
    roleStandingFor: "",
  });
  const [conductorId, setConductorId] = useState("");
  const [scrutineer1, setScrutineer1] = useState("");
  const [scrutineer2, setScrutineer2] = useState("");

  const desk = useQuery({
    queryKey: ["elections", "desk"],
    queryFn: () => apiRequest<Desk[]>("/api/elections"),
  });
  const committee = useQuery({
    queryKey: ["committee", "current", "main"],
    queryFn: () => apiRequest<CommitteeDetail>("/api/committees/current?type=main"),
  });
  const hits = useQuery({
    queryKey: ["elections", "members", nomSearch],
    queryFn: () =>
      apiRequest<MemberHit[]>(`/api/elections/members?search=${encodeURIComponent(nomSearch.trim())}`),
    enabled: nomSearch.trim().length >= 2,
  });

  const current = desk.data?.[0];
  const meetingId = current?.meeting.generalMeetingId;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["elections"] });

  const publish = useMutation({
    mutationFn: () =>
      apiRequest<Desk>("/api/elections", {
        method: "POST",
        body: JSON.stringify(notice),
      }),
    onSuccess: () => {
      toast.success("AGM/EGM notice published.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

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
      toast.success(open ? "Electronic balloting window opened (closes 2 days before the AGM)." : "Window closed.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
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

  const declare = useMutation({
    mutationFn: () => apiRequest(`/api/elections/meetings/${meetingId}/declare`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Result declared. The Chairman's declaration is final and conclusive (Article 60).");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const pick = (field: "nomineeProfileId" | "proposerProfileId" | "seconderProfileId", hit: MemberHit) => {
    if (!hit.eligibleToNominate) {
      toast.error("Must be Life/Full/Country/Overseas with ≥3 years (Article 20).");
      return;
    }
    setNomination((n) => ({ ...n, [field]: hit.profileId }));
  };

  return (
    <PageFrame width="lg">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="AGM/EGM Election"
        description="Publish notices (Article 52), accept Committee nominations 14 days before the meeting (Article 20), appoint two scrutineers (Article 55) and the returning officer (Article 65), watch the live tally and quorum of 20 (Article 56), then the Chairman declares the result (Article 60)."
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Publish an AGM/EGM notice</CardTitle>
            <CardDescription>Date, agenda, papers, meeting type. Notice period is checked automatically.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <Label>Meeting type</Label>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={notice.meetingType}
                  onChange={(e) => setNotice((n) => ({ ...n, meetingType: e.target.value }))}
                >
                  <option value="AGM">AGM (≥14 clear days)</option>
                  <option value="EGM">EGM (≥21 clear days)</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <Label>Meeting date</Label>
                <Input
                  type="date"
                  value={notice.meetingDate}
                  onChange={(e) => setNotice((n) => ({ ...n, meetingDate: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <Label>Notice sent</Label>
                <Input
                  type="date"
                  value={notice.noticeSentDate}
                  onChange={(e) => setNotice((n) => ({ ...n, noticeSentDate: e.target.value }))}
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <Label>Venue</Label>
              <Input
                value={notice.venue}
                onChange={(e) => setNotice((n) => ({ ...n, venue: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <Label>Agenda</Label>
              <Textarea value={notice.agenda} onChange={(e) => setNotice((n) => ({ ...n, agenda: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-sm">
              <Label>Papers URL</Label>
              <Input
                value={notice.papersUrl}
                onChange={(e) => setNotice((n) => ({ ...n, papersUrl: e.target.value }))}
                placeholder="https://…"
              />
            </label>
            <Button type="button" disabled={publish.isPending} onClick={() => publish.mutate()}>
              {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Publish notice
            </Button>
          </CardContent>
        </Card>

        {current ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  {current.meeting.meetingType} · {current.meeting.meetingDate}
                  {current.meeting.venue ? ` · ${current.meeting.venue}` : ""}
                </CardTitle>
                <CardDescription>{current.meeting.noticePeriodDetail}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{current.meeting.agenda || "No agenda text yet."}</p>
                {current.meeting.papersUrl ? (
                  <a className="text-primary underline" href={current.meeting.papersUrl} target="_blank" rel="noreferrer">
                    Meeting papers
                  </a>
                ) : null}
                {current.resultSummary ? (
                  <p className="rounded-md border bg-muted/40 px-3 py-2">{current.resultSummary}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scrutineers and returning officer</CardTitle>
                <CardDescription>
                  Two scrutineers are required (Article 55). One sitting Committee member is the electronic-ballot
                  returning officer (Article 65).
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <Label>Scrutineer 1</Label>
                    <select
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      value={scrutineer1}
                      onChange={(e) => setScrutineer1(e.target.value)}
                    >
                      <option value="">{current.scrutineer1Name ?? "Select"}</option>
                      {(committee.data?.members ?? []).map((m) => (
                        <option key={`s1-${m.profileId}`} value={m.profileId}>
                          {m.profileName} · {m.roleName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <Label>Scrutineer 2</Label>
                    <select
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      value={scrutineer2}
                      onChange={(e) => setScrutineer2(e.target.value)}
                    >
                      <option value="">{current.scrutineer2Name ?? "Select"}</option>
                      {(committee.data?.members ?? []).map((m) => (
                        <option key={`s2-${m.profileId}`} value={m.profileId}>
                          {m.profileName} · {m.roleName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <Label>Returning officer</Label>
                    <select
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      value={conductorId}
                      onChange={(e) => setConductorId(e.target.value)}
                    >
                      <option value="">{current.conductorName ?? "Select"}</option>
                      {(committee.data?.members ?? []).map((m) => (
                        <option key={`ro-${m.profileId}`} value={m.profileId}>
                          {m.profileName} · {m.roleName}
                        </option>
                      ))}
                    </select>
                  </label>
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
              <CardHeader>
                <CardTitle>Electronic balloting window</CardTitle>
                <CardDescription>
                  Closes 2 days before the AGM (Article 65). The returning officer must already be appointed.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  {current.ballotWindowOpen
                    ? `Open${current.ballotClosesAt ? ` · closes ${current.ballotClosesAt}` : ""}${
                        current.conductorName ? ` · returning officer ${current.conductorName}` : ""
                      }`
                    : "Closed"}
                </p>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Live tally / results</CardTitle>
                <CardDescription>
                  Votes for and against each resolution. Quorum is 20 Full/Life/Country/Overseas members present
                  (Article 56). The Chairman's declaration is final and conclusive (Article 60).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  Unique voters: {current.uniqueVoters ?? 0} of {current.quorumRequired ?? 20}.{" "}
                  {current.quorumMet ? "Quorum met." : "Quorum not met."}
                </p>
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
                  <ul className="divide-y rounded-lg border text-sm">
                    {current.agenda.map((row) => (
                      <li key={row.agendaItemId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="font-medium">{row.subject}</span>
                        <span className="text-muted-foreground">
                          FOR {row.forCount} · AGAINST {row.againstCount} · {row.votesCast} votes
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  type="button"
                  disabled={declare.isPending || Boolean(current.resultDeclaredAt)}
                  onClick={() => declare.mutate()}
                >
                  Declare result (Chairman — Article 60)
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Nominations received</CardTitle>
                <CardDescription>
                  Must be submitted at least 14 days before the AGM, signed by a proposer and seconder who are
                  Life/Full/Country/Overseas members of ≥3 years (Article 20). Deadline{" "}
                  {current.nominationDeadline ?? "—"}. {current.nominationsOpen ? "Nominations are open." : "Nominations are closed."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Input
                  placeholder="Search members to fill nominee / proposer / seconder"
                  value={nomSearch}
                  onChange={(e) => setNomSearch(e.target.value)}
                />
                {nomSearch.trim().length >= 2 ? (
                  <ul className="divide-y rounded-lg border text-sm">
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
                          <Button type="button" size="sm" variant="outline" onClick={() => pick("proposerProfileId", hit)}>
                            Proposer
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => pick("seconderProfileId", hit)}>
                            Seconder
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Input
                  placeholder="Role standing for"
                  value={nomination.roleStandingFor}
                  onChange={(e) => setNomination((n) => ({ ...n, roleStandingFor: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Nominee #{nomination.nomineeProfileId || "—"} · Proposer #{nomination.proposerProfileId || "—"} ·
                  Seconder #{nomination.seconderProfileId || "—"}
                </p>
                <Button type="button" disabled={nominate.isPending || current.nominationsOpen === false} onClick={() => nominate.mutate()}>
                  Record nomination
                </Button>
                {current.nominations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No nominations yet.</p>
                ) : (
                  <ul className="divide-y rounded-lg border text-sm">
                    {current.nominations.map((n) => (
                      <li key={n.electionNominationId} className="px-3 py-2">
                        <p className="font-medium">
                          {n.nomineeName} for {n.roleStandingFor}
                        </p>
                        <p className="text-muted-foreground">
                          Proposed by {n.proposerName}, seconded by {n.seconderName}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No general meeting published yet.</p>
        )}
      </div>
    </PageFrame>
  );
}
