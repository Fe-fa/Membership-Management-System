import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Search, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import heroImage from "@/assets/acea-hero.jpg";
import { EmptyState, StatusBadge, formatEventDate, formatEventTime, formatMoney } from "@/components/events/eventUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { eventsApi, type ClubEvent } from "@/services/events/api";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "registered", label: "Registered" },
  { id: "attended", label: "Attended" },
  { id: "cancelled", label: "Cancelled" },
] as const;

type Notice = {
  notificationId: number;
  typeCode: string;
  title: string;
  body: string;
  relatedEntityType?: string | null;
};

function downloadIcs(event: ClubEvent) {
  const stamp = (iso?: string | null) => {
    const date = new Date(iso || event.startsAt);
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `SUMMARY:${event.title}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `LOCATION:${event.venue ?? ""}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

function dayKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function MemberEventsDashboard({ section }: { section: string }) {
  const user = readUser();
  const queryClient = useQueryClient();
  const [bucket, setBucket] = useState("upcoming");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [mineTab, setMineTab] = useState("upcoming");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [guestName, setGuestName] = useState("");
  const [cursor, setCursor] = useState(() => new Date());

  useEffect(() => {
    if (section === "mine") {
      setMineTab("registered");
      document.getElementById("member-mine")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (section === "calendar") {
      document.getElementById("member-calendar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [section]);

  const summary = useQuery({ queryKey: ["member-events", "summary"], queryFn: eventsApi.memberSummary });
  const categories = useQuery({ queryKey: ["member-events", "categories"], queryFn: eventsApi.memberCategories });
  const list = useQuery({
    queryKey: ["member-events", "list", bucket, category, search, from],
    queryFn: () => {
      const params: {
        bucket?: string;
        category?: string;
        search?: string;
        from?: string;
      } = {
        bucket,
        ...(category ? { category } : {}),
        ...(search ? { search } : {}),
        ...(from ? { from: new Date(from).toISOString() } : {}),
      };

      return eventsApi.memberList(params);
    },
  });
  const mine = useQuery({
    queryKey: ["member-events", "mine", mineTab],
    queryFn: () => eventsApi.memberMine(mineTab),
  });
  const notices = useQuery({
    queryKey: ["member-events", "notices"],
    queryFn: () => apiRequest<Notice[]>("/api/members/me/notifications"),
  });
  const detail = useQuery({
    queryKey: ["member-events", "detail", selectedId],
    queryFn: () => eventsApi.memberGet(selectedId as number),
    enabled: selectedId != null,
  });

  const events = list.data ?? [];
  const focus = detail.data ?? events.find((event) => event.id === selectedId) ?? events[0] ?? null;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["member-events"] });
  }

  const register = useMutation({
    mutationFn: (id: number) => eventsApi.register(id, guestName),
    onSuccess: async () => {
      toast.success("You are registered for this event.");
      setGuestName("");
      await refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err) || "Unable to register for this event. Please try again."),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => eventsApi.cancelOwn(id),
    onSuccess: async () => {
      toast.success("Registration cancelled.");
      await refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [cursor]);

  const eventNotes = (notices.data ?? []).filter((note) =>
    note.relatedEntityType === "EVENT" || note.typeCode.startsWith("EVENT"));

  const firstName = user?.fullName?.split(" ")[0] || "member";
  const stats = summary.data;

  function buttonFor(event: ClubEvent) {
    const mineReg = event.myRegistration;
    if (mineReg && (mineReg.status === "PENDING" || mineReg.status === "APPROVED")) {
      return <Button type="button" variant="secondary" disabled>Registered</Button>;
    }
    if (event.registrationBlockReason) {
      const closed = /closed|full|cancelled|completed|not open/i.test(event.registrationBlockReason);
      return <Button type="button" variant="outline" disabled>{closed ? "Registration closed" : "Unavailable"}</Button>;
    }
    return <Button type="button" onClick={() => register.mutate(event.id)} disabled={register.isPending}>Register</Button>;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <section className="relative overflow-hidden rounded-2xl">
        <img src={heroImage} alt="" className="h-56 w-full object-cover sm:h-64" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)", opacity: 0.92 }} />
        <div className="absolute inset-0 flex flex-col justify-between p-5 text-primary-foreground sm:p-7">
          <div>
            <p className="text-sm text-white/80">Welcome, {firstName}</p>
            <h1 className="mt-1 font-sans text-2xl font-semibold sm:text-3xl">Discover Events</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              Discover upcoming club events, register, and stay connected with the club community.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Upcoming events", stats?.upcomingEvents ?? 0],
              ["My registrations", stats?.myRegistrations ?? 0],
              ["Attended events", stats?.attendedEvents ?? 0],
              ["Pending", stats?.pendingRegistrations ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-wide text-white/75">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {list.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {extractErrorMessage(list.error)}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={bucket === filter.id ? "rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground" : "rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground"}
              onClick={() => setBucket(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8 sm:w-56" placeholder="Search event" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Input type="date" className="sm:w-40" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-xl border bg-card p-3 shadow-sm">
          <h2 className="px-2 text-sm font-semibold">Categories</h2>
          <button type="button" className={`mt-2 block w-full rounded-lg px-2 py-1.5 text-left text-sm ${category === "" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`} onClick={() => setCategory("")}>All events</button>
          {(categories.data ?? []).map((item) => (
            <button key={item.code} type="button" className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${category === item.code ? "bg-primary/10 text-primary" : "text-muted-foreground"}`} onClick={() => setCategory(item.code)}>
              {item.name}
            </button>
          ))}
        </aside>

        <div>
          <h2 className="mb-3 text-base font-semibold">Upcoming events</h2>
          {list.isLoading ? <p className="text-sm text-muted-foreground">Loading events…</p> : null}
          {!list.isLoading && events.length === 0 ? (
            <EmptyState
              title={bucket === "registered" ? "You haven't registered for any events yet." : "No upcoming events found."}
              detail="Published club events will appear here."
            />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <article key={event.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="relative h-36 bg-primary/15">
                  {event.imageUrl ? <img src={event.imageUrl} alt="" className="h-full w-full object-cover" /> : (
                    <div className="flex h-full items-end p-3 text-primary" style={{ background: "var(--gradient-brand)" }}>
                      <CalendarDays className="size-8 text-primary-foreground" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-md bg-card/95 px-2 py-1 text-xs font-medium text-foreground">{formatEventDate(event.startsAt)}</span>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{event.title}</h3>
                    <StatusBadge value={event.myRegistration?.status ?? event.displayStatus} />
                  </div>
                  <p className="text-xs text-muted-foreground">{event.categoryName ?? "Club event"}</p>
                  <p className="text-sm text-muted-foreground">{formatEventTime(event.startsAt, event.endsAt)}</p>
                  <p className="inline-flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-3.5" /> {event.venue ?? "Venue to be confirmed"}</p>
                  <p className="text-sm">{event.registeredCount} registered · {event.availableSeats ?? "—"} seats left</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" variant="outline" onClick={() => setSelectedId(event.id)}>View details</Button>
                    {buttonFor(event)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="member-calendar" className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</h2>
          <div className="flex gap-1">
            <Button type="button" size="icon" variant="ghost" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight /></Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day) => {
            const key = dayKey(day);
            const items = events.filter((event) => dayKey(new Date(event.startsAt)) === key);
            const firstItem = items[0];
            return (
              <div key={key} className={`min-h-14 rounded-md p-1 text-xs ${day.getMonth() === cursor.getMonth() ? "bg-muted/40" : "text-muted-foreground/40"}`}>
                <span>{day.getDate()}</span>
                {firstItem ? <button type="button" className="mt-1 block truncate text-left text-primary" onClick={() => setSelectedId(firstItem.id)}>{firstItem.title}</button> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section id="member-mine" className="grid gap-4 xl:grid-cols-5">
        <div className="rounded-xl border bg-card p-4 shadow-sm xl:col-span-3">
          <h2 className="text-base font-semibold">My events</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {["upcoming", "registered", "attended", "cancelled"].map((tab) => (
              <button key={tab} type="button" className={mineTab === tab ? "rounded-full bg-primary px-3 py-1 text-sm capitalize text-primary-foreground" : "rounded-full border border-border px-3 py-1 text-sm capitalize text-muted-foreground"} onClick={() => setMineTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
          {mine.data?.length === 0 ? (
            <div className="mt-4">
              <EmptyState title={mineTab === "attended" ? "You have not attended an event yet." : "You haven't registered for any events yet."} />
            </div>
          ) : null}
          <ul className="mt-3 space-y-2">
            {(mine.data ?? []).map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{formatEventDate(event.startsAt)} · {event.venue ?? "Venue to be confirmed"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={event.myRegistration?.status ?? event.displayStatus} />
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(event.id)}>View</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <article className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold">Event details</h2>
            {!focus ? <p className="mt-3 text-sm text-muted-foreground">No upcoming events found.</p> : (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-lg font-semibold">{focus.title}</p>
                <p className="text-muted-foreground">{focus.description || "The club will share more details closer to the date."}</p>
                <p>{focus.categoryName ?? "Club event"}</p>
                <p>{formatEventDate(focus.startsAt)}</p>
                <p>{formatEventTime(focus.startsAt, focus.endsAt)}</p>
                <p>{focus.venue ?? "Venue to be confirmed"}</p>
                <p>Deadline: {focus.registrationDeadline ? formatEventDate(focus.registrationDeadline) : "None"}</p>
                <p>Fee: {formatMoney(focus.fee)}</p>
                <p>{focus.registeredCount} registered · {focus.availableSeats ?? "—"} seats left · capacity {focus.capacity ?? "—"}</p>
                {focus.allowGuestRegistration && !focus.myRegistration ? (
                  <Input placeholder="Guest name, if you are bringing one" value={guestName} onChange={(event) => setGuestName(event.target.value)} />
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">{buttonFor(focus)}</div>
              </div>
            )}
          </article>

          <article className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold">My registration</h2>
            {!focus?.myRegistration ? (
              <p className="mt-2 text-sm text-muted-foreground">You are not registered for {focus?.title ?? "an event"} yet.</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <p className="font-medium text-primary">You are registered</p>
                <p>Registered {formatEventDate(focus.myRegistration.registeredAt)}</p>
                <p className="flex items-center gap-2">Status <StatusBadge value={focus.myRegistration.status} /></p>
                <p className="flex items-center gap-2">Payment <StatusBadge value={focus.myRegistration.paymentStatus} /></p>
                {focus.myRegistration.ticketCode ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-primary"><Ticket className="size-3.5" /> Ticket</p>
                    <p className="mt-1 font-mono text-sm tracking-wide">{focus.myRegistration.ticketCode}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {focus.myRegistration.status === "PENDING" || focus.myRegistration.status === "APPROVED" ? (
                    <Button type="button" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(focus.id)}>Cancel registration</Button>
                  ) : null}
                  <Button type="button" variant="ghost" onClick={() => downloadIcs(focus)}>Add to calendar</Button>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold">Event notifications</h2>
            {eventNotes.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No event notices yet.</p> : (
              <ul className="mt-3 space-y-2">
                {eventNotes.slice(0, 4).map((note) => (
                  <li key={note.notificationId} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <p className="font-medium">{note.title}</p>
                    <p className="text-muted-foreground">{note.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
