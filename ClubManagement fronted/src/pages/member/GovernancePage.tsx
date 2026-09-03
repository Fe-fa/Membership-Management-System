import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Mail } from "lucide-react";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isStaff, readUser } from "@/lib/auth";
import { API_BASE, ApiError, apiRequest } from "@/services/membership/api";

type CommitteeMember = {
  committeeMemberId: number;
  profileName: string;
  roleName: string;
  roleSortOrder: number;
  membershipNo?: string | null;
  photoUrl?: string | null;
  contactEmail?: string | null;
};

type CommitteeMeeting = {
  committeeMeetingId: number;
  meetingName?: string | null;
  meetingTypeName: string;
  meetingDate: string;
  meetingTime?: string | null;
  status: string;
  minutesUrl?: string | null;
};

type CommitteeDetail = {
  committeeId: number;
  committeeName: string;
  termStart?: string | null;
  termEnd?: string | null;
  isActive: boolean;
  members: CommitteeMember[];
  meetings: CommitteeMeeting[];
  nextMeeting?: CommitteeMeeting | null;
};

function mediaUrl(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function contactMailto(email: string, roleName: string, committeeName: string) {
  const subject = encodeURIComponent(`${committeeName} — ${roleName}`);
  const body = encodeURIComponent(
    `Dear ${roleName},\n\nI am writing regarding a Club matter for your attention.\n\n`,
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

/** Member-facing current committee view (Election is a separate page). */
export function GovernancePage() {
  const user = readUser();
  const staff = isStaff(user);

  const committee = useQuery({
    queryKey: ["committee", "current", "main", "member-view"],
    queryFn: async () => {
      try {
        return await apiRequest<CommitteeDetail>("/api/committees/current?type=main");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

  const current = committee.data;
  const today = new Date().toISOString().slice(0, 10);
  const pastWithMinutes =
    current?.meetings.filter((m) => {
      if (!m.minutesUrl?.trim()) return false;
      const held = m.status.toUpperCase() === "HELD";
      const past = m.meetingDate < today;
      return held || past;
    }) ?? [];

  return (
    <PageFrame>
      {staff ? <PageBackLink to="/admin" label="Back to admin dashboard" /> : null}
      <PageHeader
        title="Committee"
        description="Officers and members of the active term, plus the next scheduled sitting."
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{current?.committeeName ?? "Current committee"}</CardTitle>
            {current?.isActive ? (
              <Badge variant="secondary" className="font-normal">
                Active
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            {current
              ? `${
                  current.termStart || current.termEnd
                    ? `${current.termStart ?? "…"} → ${current.termEnd ?? "…"}`
                    : "Active term"
                }`
              : "No active committee published yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {committee.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading committee…</p>
          ) : !current ? (
            <p className="text-sm text-muted-foreground">
              When the Club publishes the sitting committee, members and the next meeting appear
              here.
            </p>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Members
                  </p>
                  <ul className="divide-y rounded-lg border">
                    {current.members.map((m) => {
                      const photo = mediaUrl(m.photoUrl);
                      const email = m.contactEmail?.trim();
                      return (
                        <li
                          key={m.committeeMemberId}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm"
                        >
                          <Avatar className="size-9 border border-border">
                            {photo ? <AvatarImage src={photo} alt="" /> : null}
                            <AvatarFallback className="text-[11px] font-medium">
                              {initials(m.profileName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{m.profileName}</p>
                            {m.membershipNo ? (
                              <p className="text-xs text-muted-foreground">{m.membershipNo}</p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-muted-foreground">{m.roleName}</span>
                          {email ? (
                            <a
                              href={contactMailto(
                                email,
                                m.roleName,
                                current.committeeName,
                              )}
                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              title={`Message ${m.roleName}`}
                              aria-label={`Message ${m.profileName} (${m.roleName})`}
                            >
                              <Mail className="size-4" />
                            </a>
                          ) : (
                            <span className="size-8 shrink-0" aria-hidden />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Next meeting
                    </p>
                    {current.nextMeeting ? (
                      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                        <p className="font-medium">
                          {current.nextMeeting.meetingName ||
                            current.nextMeeting.meetingTypeName}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {current.nextMeeting.meetingDate}
                          {current.nextMeeting.meetingTime
                            ? ` · ${current.nextMeeting.meetingTime}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {current.nextMeeting.meetingTypeName} · {current.nextMeeting.status}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No upcoming scheduled meeting.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Past meetings
                    </p>
                    {pastWithMinutes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Published minutes will appear here when available for inspection.
                      </p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {pastWithMinutes.map((m) => {
                          const href = mediaUrl(m.minutesUrl)!;
                          const label =
                            m.meetingName || m.meetingTypeName || "Meeting";
                          return (
                            <li key={m.committeeMeetingId}>
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium">{label}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {m.meetingDate}
                                    {m.meetingTime ? ` · ${m.meetingTime}` : ""}
                                    {" · "}
                                    {m.status}
                                  </p>
                                </div>
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                                  Minutes
                                  <ExternalLink className="size-3.5" />
                                </span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageFrame>
  );
}
