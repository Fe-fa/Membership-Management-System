
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

type VisitRow = {
  visitId: number;
  guestName: string;
  visitDate: string;
  timeIn?: string | null;
  isCurrent: boolean;
  entryNo?: string | null;
};

export function GuestsPage() {
  const [guestName, setGuestName] = useState("");
  const visits = useQuery({
    queryKey: ["guest-visits"],
    queryFn: () => apiRequest<VisitRow[]>("/api/guests/visits"),
  });

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiRequest("/api/guests/visits", {
        method: "POST",
        body: JSON.stringify({
          guestName,
          visitDate: new Date().toISOString().slice(0, 10),
          timeIn: new Date().toISOString().slice(11, 19),
        }),
      });
      setGuestName("");
      toast.success("Guest signed in.");
      await visits.refetch();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  async function signOut(visitId: number) {
    try {
      await apiRequest(`/api/guests/visits/${visitId}/sign-out`, {
        method: "POST",
        body: JSON.stringify({ timeOut: new Date().toISOString().slice(11, 19) }),
      });
      await visits.refetch();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  return (
    <PageFrame>
      <PageHeader title="Guests & reciprocation" description="Maximum six guests at a time. The same guest may not be introduced more than twice a month or twelve times a year." />
      <form onSubmit={signIn} className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        <input className="min-w-56 flex-1 rounded-md border border-input bg-background px-3 py-2" placeholder="Guest name" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
        <Button type="submit">Sign in guest</Button>
      </form>
      <div className="rounded-xl border border-border bg-card">
        {(visits.data ?? []).map((row) => (
          <div key={row.visitId} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0">
            <div>
              <p className="font-medium">{row.guestName}</p>
              <p className="text-sm text-muted-foreground">{row.visitDate} {row.isCurrent ? "Â· currently signed in" : ""}</p>
            </div>
            {row.isCurrent ? (
              <Button variant="outline" size="sm" onClick={() => void signOut(row.visitId)}>Sign out</Button>
            ) : null}
          </div>
        ))}
      </div>
      <ReciprocalPanel />
    </PageFrame>
  );
}

function ReciprocalPanel() {
  const summary = useQuery({
    queryKey: ["member-reciprocal"],
    queryFn: () =>
      apiRequest<{
        daysUsedIn12Months: number;
        maxDays: number;
        visits: { reciprocalUsageId: number; homeClubName: string; visitDate: string; daysUsed: number }[];
        clubs: { clubId: number; clubName: string }[];
      }>("/api/members/me/reciprocal"),
  });
  const [clubId, setClubId] = useState("");
  const [days, setDays] = useState("1");

  async function record(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiRequest("/api/guests/reciprocal", {
        method: "POST",
        body: JSON.stringify({
          homeClubId: Number(clubId),
          visitDate: new Date().toISOString().slice(0, 10),
          daysUsed: Number(days),
        }),
      });
      toast.success("Reciprocal visit recorded.");
      await summary.refetch();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  const data = summary.data;
  return (
    <div className="space-y-3">
      <PageHeader title="Reciprocal clubs" description={`30 days in any 12 months. Used: ${data?.daysUsedIn12Months ?? 0} / ${data?.maxDays ?? 30}.`} />
      <form onSubmit={(e) => void record(e)} className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        <select className="min-w-56 flex-1 rounded-md border border-input bg-background px-3 py-2" value={clubId} onChange={(e) => setClubId(e.target.value)} required>
          <option value="">Home club</option>
          {(data?.clubs ?? []).map((club) => (
            <option key={club.clubId} value={club.clubId}>
              {club.clubName}
            </option>
          ))}
        </select>
        <input className="w-24 rounded-md border border-input bg-background px-3 py-2" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
        <Button type="submit">Record visit</Button>
      </form>
    </div>
  );
}
