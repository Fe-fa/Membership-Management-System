import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { isStaff, readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatMembershipDate } from "@/services/admin/membershipDesk";

type ClubEvent = {
  id: number;
  title: string;
  location?: string | null;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  kind: string;
};

type EventBoard = {
  current: ClubEvent[];
  upcoming: ClubEvent[];
  past: ClubEvent[];
};

function when(event: ClubEvent) {
  const start = formatMembershipDate(event.startsAt);
  return event.location ? `${start} · ${event.location}` : start;
}

function EventList({ title, events, empty }: { title: string; events: ClubEvent[]; empty: string }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {events.map((event) => (
            <li key={`${event.kind}-${event.id}`} className="rounded-lg border border-border px-3 py-3">
              <p className="font-medium">{event.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{when(event)}</p>
              {event.description ? <p className="mt-2 text-sm">{event.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EventsPage() {
  const user = readUser();
  const staff = isStaff(user);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: "", location: "", description: "", startsAt: "", endsAt: "" });
  const events = useQuery({
    queryKey: ["club-events"],
    queryFn: () => apiRequest<EventBoard>("/api/events"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          location: form.location || null,
          description: form.description || null,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        }),
      }),
    onSuccess: async () => {
      toast.success("Event published.");
      setForm({ title: "", location: "", description: "", startsAt: "", endsAt: "" });
      await queryClient.invalidateQueries({ queryKey: ["club-events"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const board = events.data;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Current, upcoming and past club events.</p>
        </div>
      </div>
      {events.isLoading ? <p className="text-sm text-muted-foreground">Loading events…</p> : null}
      {events.isError ? <p className="text-sm text-destructive">{extractErrorMessage(events.error)}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <EventList title="Current" events={board?.current ?? []} empty="Nothing on today." />
        <EventList title="Upcoming" events={board?.upcoming ?? []} empty="No upcoming events." />
        <EventList title="Past" events={board?.past ?? []} empty="No past events yet." />
      </div>
      {staff ? (
        <form
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="sm:col-span-2 text-base font-semibold">Add an event</h2>
          <label className="text-sm">
            Title
            <input required className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="text-sm">
            Location
            <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="text-sm">
            Starts
            <input required type="datetime-local" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </label>
          <label className="text-sm">
            Ends
            <input type="datetime-local" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </label>
          <label className="text-sm sm:col-span-2">
            Details
            <textarea className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <Button type="submit" disabled={create.isPending} className="sm:col-span-2 w-fit">
            {create.isPending ? "Saving…" : "Publish event"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
