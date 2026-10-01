import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, EmptyState, Field, StatusBadge, combineLocal, formatEventDate, formatEventTime, localDateTime } from "@/components/events/eventUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractErrorMessage, uploadFile } from "@/services/membership/api";
import {
  eventsApi,
  needsForceDelete,
  type ClubEvent,
  type SaveEventInput,
} from "@/services/events/api";

type FormState = {
  title: string;
  description: string;
  categoryCode: string;
  imageUrl: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  capacity: string;
  deadline: string;
  fee: string;
  requireRegistration: boolean;
  requireApproval: boolean;
  allowGuest: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  categoryCode: "",
  imageUrl: "",
  date: "",
  startTime: "",
  endTime: "",
  venue: "",
  capacity: "",
  deadline: "",
  fee: "",
  requireRegistration: true,
  requireApproval: false,
  allowGuest: false,
};

function validateForm(form: FormState) {
  if (form.title.trim().length < 3) return "Event title is required.";
  if (!form.categoryCode) return "Choose an event category.";
  if (!form.date || !form.startTime || !form.endTime) return "Enter the event date, start time, and end time.";
  if (!form.venue.trim()) return "Enter a venue.";
  const capacity = Number(form.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) return "Capacity must be greater than zero.";
  const start = new Date(`${form.date}T${form.startTime}`);
  const end = new Date(`${form.date}T${form.endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Date cannot be invalid.";
  if (end <= start) return "End time must be after the start time.";
  if (form.deadline) {
    const deadline = new Date(form.deadline);
    if (Number.isNaN(deadline.getTime())) return "Registration deadline is invalid.";
    if (deadline > start) return "Registration deadline cannot be after the event date.";
  }
  if (form.fee && Number(form.fee) < 0) return "Event fee cannot be negative.";
  return "";
}

function toPayload(form: FormState, status: "DRAFT" | "PUBLISHED"): SaveEventInput {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    categoryCode: form.categoryCode,
    imageUrl: form.imageUrl || null,
    startsAt: combineLocal(form.date, form.startTime),
    endsAt: combineLocal(form.date, form.endTime),
    venue: form.venue.trim(),
    capacity: Number(form.capacity),
    registrationDeadline: form.deadline ? new Date(form.deadline).toISOString() : null,
    fee: form.fee ? Number(form.fee) : 0,
    requireRegistration: form.requireRegistration,
    requireApproval: form.requireApproval,
    allowGuestRegistration: form.allowGuest,
    status,
  };
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof CalendarDays }) {
  return (
    <article className="rounded-xl border bg-card px-3 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-xs font-medium leading-4 text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </article>
  );
}

function dayKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function AdminEventsDashboard({ section }: { section: string }) {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const [calView, setCalView] = useState<"month" | "week" | "day">("month");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tableSearch, setTableSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [regSearch, setRegSearch] = useState("");
  const [regStatus, setRegStatus] = useState("");
  const [attendSearch, setAttendSearch] = useState("");
  const [ticketCode, setTicketCode] = useState("");
  const [history, setHistory] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "delete" | "cancel"; event: ClubEvent } | null>(null);

  const summary = useQuery({ queryKey: ["admin-events", "summary"], queryFn: eventsApi.adminSummary });
  const list = useQuery({
    queryKey: ["admin-events", "list", tableSearch, statusFilter],
    queryFn: () => eventsApi.adminList({ search: tableSearch, status: statusFilter }),
  });
  const categories = useQuery({ queryKey: ["events", "categories"], queryFn: eventsApi.categories });
  const registrations = useQuery({
    queryKey: ["admin-events", "registrations", selectedId, regSearch, regStatus],
    queryFn: () => eventsApi.registrations({ eventId: selectedId ?? undefined, search: regSearch, status: regStatus }),
    enabled: selectedId != null,
  });
  const attendance = useQuery({
    queryKey: ["admin-events", "attendance", selectedId, attendSearch, history],
    queryFn: () => eventsApi.attendance({ eventId: history ? undefined : selectedId ?? undefined, search: attendSearch, history }),
  });
  const reports = useQuery({
    queryKey: ["admin-events", "reports"],
    queryFn: eventsApi.reports,
    enabled: section === "reports",
  });

  const events = list.data ?? [];
  const selected = events.find((event) => event.id === selectedId) ?? events[0] ?? null;

  useEffect(() => {
    if (selectedId == null && events[0]) setSelectedId(events[0].id);
  }, [events, selectedId]);

  useEffect(() => {
    if (!section || section === "home") return;
    document.getElementById(`event-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [section]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    await queryClient.invalidateQueries({ queryKey: ["events"] });
  }

  const save = useMutation({
    mutationFn: (status: "DRAFT" | "PUBLISHED") => {
      const message = validateForm(form);
      if (message) throw new Error(message);
      const body = toPayload(form, status);
      return editingId ? eventsApi.update(editingId, body) : eventsApi.create(body);
    },
    onSuccess: async (_row, status) => {
      toast.success(status === "PUBLISHED" ? "Event published successfully." : "Draft saved.");
      setForm(EMPTY_FORM);
      setEditingId(null);
      await refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const act = useMutation({
    mutationFn: async (action: { type: string; event: ClubEvent; force?: boolean }) => {
      if (action.type === "publish") return eventsApi.publish(action.event.id);
      if (action.type === "unpublish") return eventsApi.unpublish(action.event.id);
      if (action.type === "cancel") return eventsApi.cancel(action.event.id);
      return eventsApi.remove(action.event.id, action.force);
    },
    onSuccess: async (_row, action) => {
      const labels: Record<string, string> = {
        publish: "Event published successfully.",
        unpublish: "Event moved back to draft.",
        cancel: "Event cancelled.",
        delete: "Event deleted.",
      };
      toast.success(labels[action.type] ?? "Updated.");
      setConfirm(null);
      await refresh();
    },
    onError: (err, action) => {
      if (action.type === "delete" && needsForceDelete(err)) {
        setConfirm({ kind: "delete", event: action.event });
        return;
      }
      toast.error(extractErrorMessage(err));
    },
  });

  const registrationAct = useMutation({
    mutationFn: (input: { id: number; action: "approve" | "reject" | "cancel" }) =>
      eventsApi.registrationAction(input.id, input.action),
    onSuccess: async () => {
      toast.success("Registration updated.");
      await refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const checkIn = useMutation({
    mutationFn: (body: { accountId?: number; ticketCode?: string; status: string }) => {
      if (!selected) throw new Error("Choose an event first.");
      return eventsApi.markAttendance(selected.id, body);
    },
    onSuccess: async () => {
      toast.success("Attendance updated.");
      setTicketCode("");
      await refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const saveCategory = useMutation({
    mutationFn: () => eventsApi.saveCategory({ name: categoryName, isActive: true }),
    onSuccess: async () => {
      toast.success("Category saved.");
      setCategoryName("");
      await queryClient.invalidateQueries({ queryKey: ["events", "categories"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const sendNote = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Choose an event first.");
      return eventsApi.announce(selected.id, announce, "registrants");
    },
    onSuccess: () => {
      toast.success("Announcement sent.");
      setAnnounce("");
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  function beginEdit(event: ClubEvent) {
    const start = localDateTime(event.startsAt);
    const end = localDateTime(event.endsAt);
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description ?? "",
      categoryCode: event.categoryCode ?? "",
      imageUrl: event.imageUrl ?? "",
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      venue: event.venue ?? "",
      capacity: event.capacity ? String(event.capacity) : "",
      deadline: event.registrationDeadline ? localDateTime(event.registrationDeadline).date + "T" + localDateTime(event.registrationDeadline).time : "",
      fee: event.fee ? String(event.fee) : "",
      requireRegistration: event.requireRegistration,
      requireApproval: event.requireApproval,
      allowGuest: event.allowGuestRegistration,
    });
    document.getElementById("event-create")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const stats = summary.data;
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [cursor]);

  const visibleDays = calView === "month"
    ? cells
    : calView === "week"
      ? cells.filter((day) => {
          const start = new Date(cursor);
          start.setDate(cursor.getDate() - cursor.getDay());
          const end = new Date(start);
          end.setDate(start.getDate() + 6);
          return day >= start && day <= end && day.getMonth() === cursor.getMonth();
        }).concat(
          Array.from({ length: 7 }, (_, index) => {
            const day = new Date(cursor);
            day.setDate(cursor.getDate() - cursor.getDay() + index);
            return day;
          }),
        ).filter((day, index, all) => all.findIndex((item) => dayKey(item) === dayKey(day)) === index)
      : [new Date(cursor)];

  function eventsOn(day: Date) {
    const key = dayKey(day);
    return events.filter((event) => dayKey(new Date(event.startsAt)) === key);
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Events Management</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage club events, registrations, attendance, venues, and event communication.
          </p>
        </div>
        <Button type="button" onClick={() => document.getElementById("event-create")?.scrollIntoView({ behavior: "smooth" })}>
          <Plus /> Create event
        </Button>
      </header>

      {summary.isError || list.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {extractErrorMessage(summary.error ?? list.error)}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Total events" value={stats?.totalEvents ?? 0} icon={CalendarDays} />
        <Stat label="Upcoming events" value={stats?.upcomingEvents ?? 0} icon={CalendarCheck} />
        <Stat label="Ongoing events" value={stats?.ongoingEvents ?? 0} icon={Clock} />
        <Stat label="Completed events" value={stats?.completedEvents ?? 0} icon={CalendarCheck} />
        <Stat label="Total registrations" value={stats?.totalRegistrations ?? 0} icon={Users} />
        <Stat label="Pending registrations" value={stats?.pendingRegistrations ?? 0} icon={ClipboardList} />
        <Stat label="Today's events" value={stats?.todaysEvents ?? 0} icon={CalendarDays} />
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <div className="rounded-xl border bg-card p-4 shadow-sm xl:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Recent events</h2>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input className="h-9 w-40 pl-8" placeholder="Search" value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} />
              </div>
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                {["DRAFT", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED"].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>
          {list.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading events…</p> : null}
          {!list.isLoading && events.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No events have been created yet." detail="Create the first club event to open registrations and attendance." />
            </div>
          ) : null}
          <div className="mt-3 hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Event</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="hidden py-2 pr-3 font-medium lg:table-cell">Venue</th>
                  <th className="py-2 pr-3 font-medium">Registered</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-t border-border">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.categoryName ?? "Uncategorised"} · {event.createdByName ?? "Staff"}</p>
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <p>{formatEventDate(event.startsAt)}</p>
                      <p className="text-xs text-muted-foreground">{formatEventTime(event.startsAt, event.endsAt)}</p>
                    </td>
                    <td className="hidden py-3 pr-3 lg:table-cell">{event.venue ?? "—"}</td>
                    <td className="py-3 pr-3 tabular-nums">{event.registeredCount}/{event.capacity ?? "—"}</td>
                    <td className="py-3 pr-3"><StatusBadge value={event.displayStatus} /></td>
                    <td className="py-3">
                      <select
                        className="h-8 max-w-36 rounded-md border border-input bg-background px-2 text-xs"
                        value=""
                        onChange={(change) => {
                          const value = change.target.value;
                          if (value === "view" || value === "registrations" || value === "attendance") {
                            setSelectedId(event.id);
                            document.getElementById(value === "view" ? "event-registrations" : `event-${value}`)?.scrollIntoView({ behavior: "smooth" });
                          } else if (value === "edit") beginEdit(event);
                          else if (value === "delete") setConfirm({ kind: "delete", event });
                          else if (value === "cancel") setConfirm({ kind: "cancel", event });
                          else if (value === "publish" || value === "unpublish") act.mutate({ type: value, event });
                        }}
                      >
                        <option value="">Manage</option>
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                        <option value="publish">Publish</option>
                        <option value="unpublish">Unpublish</option>
                        <option value="cancel">Cancel</option>
                        <option value="delete">Delete</option>
                        <option value="registrations">Manage registrations</option>
                        <option value="attendance">Manage attendance</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-3 md:hidden">
            {events.map((event) => (
              <article key={event.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{event.title}</p>
                  <StatusBadge value={event.displayStatus} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{formatEventDate(event.startsAt)} · {event.venue ?? "Venue to be confirmed"}</p>
                <p className="mt-1 text-sm">{event.registeredCount}/{event.capacity ?? "—"} registered</p>
                <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => beginEdit(event)}>Edit</Button>
              </article>
            ))}
          </div>
        </div>

        <div id="event-calendar" className="rounded-xl border bg-card p-4 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </h2>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon" variant="ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
                <ChevronLeft />
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="mt-2 flex gap-1">
            {(["month", "week", "day"] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={calView === view ? "rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground" : "rounded-full px-2.5 py-1 text-xs text-muted-foreground"}
                onClick={() => setCalView(view)}
              >
                {view}
              </button>
            ))}
          </div>
          {calView === "month" ? (
            <>
              <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-muted-foreground">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((day) => {
                  const items = eventsOn(day);
                  const outside = day.getMonth() !== cursor.getMonth();
                  return (
                    <button
                      key={dayKey(day)}
                      type="button"
                      className={`min-h-12 rounded-md border border-transparent p-1 text-left text-xs ${outside ? "text-muted-foreground/50" : "hover:border-border hover:bg-muted/60"}`}
                      onClick={() => { setCursor(day); setCalView("day"); }}
                    >
                      <span>{day.getDate()}</span>
                      <span className="mt-1 flex flex-wrap gap-0.5">
                        {items.slice(0, 3).map((event) => (
                          <span key={event.id} className={`size-1.5 rounded-full ${event.displayStatus === "CANCELLED" ? "bg-destructive" : event.displayStatus === "ONGOING" ? "bg-accent" : event.displayStatus === "COMPLETED" ? "bg-muted-foreground" : "bg-primary"}`} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <ul className="mt-3 space-y-2">
              {visibleDays.map((day) => (
                <li key={dayKey(day)} className="rounded-lg border border-border p-2">
                  <p className="text-xs font-medium text-muted-foreground">{formatEventDate(day.toISOString())}</p>
                  {eventsOn(day).length === 0 ? <p className="mt-1 text-sm text-muted-foreground">No events.</p> : eventsOn(day).map((event) => (
                    <button key={event.id} type="button" className="mt-1 block w-full rounded-md bg-primary/5 px-2 py-1 text-left text-sm" onClick={() => { setSelectedId(event.id); beginEdit(event); }}>
                      <span className="font-medium">{event.title}</span>
                      <StatusBadge value={event.displayStatus} />
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-primary" /> Upcoming</span>
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-accent" /> Ongoing</span>
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-muted-foreground" /> Completed</span>
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-destructive" /> Cancelled</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form
          id="event-create"
          className="rounded-xl border bg-card p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate("PUBLISHED");
          }}
        >
          <h2 className="text-base font-semibold">{editingId ? "Edit event" : "Create new event"}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Event title">
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            </Field>
            <Field label="Category">
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.categoryCode} onChange={(event) => setForm({ ...form, categoryCode: event.target.value })} required>
                <option value="">Select category</option>
                {(categories.data ?? []).filter((category) => category.isActive).map((category) => (
                  <option key={category.code} value={category.code}>{category.name}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>
            </div>
            <Field label="Event date">
              <Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start time"><Input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /></Field>
              <Field label="End time"><Input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required /></Field>
            </div>
            <Field label="Venue">
              <Input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} required />
            </Field>
            <Field label="Maximum capacity">
              <Input type="number" min={1} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} required />
            </Field>
            <Field label="Registration deadline">
              <Input type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
            </Field>
            <Field label="Event fee">
              <Input type="number" min={0} step="0.01" value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} placeholder="0" />
            </Field>
            <Field label="Event image">
              <Input type="file" accept="image/*" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const uploaded = await uploadFile(file, "eventImage");
                  setForm((current) => ({ ...current, imageUrl: uploaded.url }));
                  toast.success("Image added.");
                } catch (err) {
                  toast.error(extractErrorMessage(err));
                }
              }} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.requireRegistration} onChange={(event) => setForm({ ...form, requireRegistration: event.target.checked })} /> Require registration</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.requireApproval} onChange={(event) => setForm({ ...form, requireApproval: event.target.checked })} /> Require approval</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.allowGuest} onChange={(event) => setForm({ ...form, allowGuest: event.target.checked })} /> Allow guest registration</label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate("DRAFT")}>Save draft</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Publish event"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setForm(EMPTY_FORM); setEditingId(null); }}>Cancel</Button>
          </div>
        </form>

        <div id="event-registrations" className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Registration management</h2>
            <select className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm" value={selected?.id ?? ""} onChange={(event) => setSelectedId(Number(event.target.value))}>
              {events.length === 0 ? <option value="">No events</option> : null}
              {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
            </select>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Registered", registrations.data?.totalRegistered ?? 0],
              ["Approved", registrations.data?.approved ?? 0],
              ["Pending", registrations.data?.pending ?? 0],
              ["Rejected", registrations.data?.rejected ?? 0],
              ["Cancelled", registrations.data?.cancelled ?? 0],
              ["Seats left", registrations.data?.availableSeats ?? "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-muted/70 px-2 py-2 text-center">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Name, email, phone, or membership no." value={regSearch} onChange={(event) => setRegSearch(event.target.value)} />
            </div>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={regStatus} onChange={(event) => setRegStatus(event.target.value)}>
              <option value="">All</option>
              {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          {!selected ? <div className="mt-4"><EmptyState title="No events have been created yet." /></div> : null}
          {selected && registrations.data?.rows.length === 0 ? <div className="mt-4"><EmptyState title="No pending registrations." detail="Approved, rejected, and cancelled rows appear here when members register." /></div> : null}
          <ul className="mt-3 space-y-2">
            {(registrations.data?.rows ?? []).map((row) => (
              <li key={row.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.memberName}</p>
                    <p className="text-xs text-muted-foreground">{row.membershipNo ?? "No membership no."} · {row.email ?? "No email"} · {row.phone ?? "No phone"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatEventDate(row.registeredAt)} · {row.paymentStatus.replaceAll("_", " ")}</p>
                  </div>
                  <StatusBadge value={row.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => { window.location.assign(`/existing-members/${row.accountId}`); }}>View member</Button>
                  {row.status === "PENDING" ? <Button type="button" size="sm" onClick={() => registrationAct.mutate({ id: row.id, action: "approve" })}>Approve</Button> : null}
                  {row.status === "PENDING" ? <Button type="button" size="sm" variant="outline" onClick={() => registrationAct.mutate({ id: row.id, action: "reject" })}>Reject</Button> : null}
                  {row.status === "PENDING" || row.status === "APPROVED" ? <Button type="button" size="sm" variant="ghost" onClick={() => registrationAct.mutate({ id: row.id, action: "cancel" })}>Cancel registration</Button> : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Announcement to registered members" value={announce} onChange={(event) => setAnnounce(event.target.value)} />
            <Button type="button" variant="outline" disabled={sendNote.isPending || !selected} onClick={() => sendNote.mutate()}>Send</Button>
          </div>
        </div>
      </section>

      <section id="event-attendance" className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Attendance</h2>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={history} onChange={(event) => setHistory(event.target.checked)} />
            View attendance history
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Expected", attendance.data?.expected ?? 0],
            ["Registered", attendance.data?.registered ?? 0],
            ["Checked in", attendance.data?.checkedIn ?? 0],
            ["Absent", attendance.data?.absent ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-muted/70 px-3 py-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input className="sm:max-w-xs" placeholder="Search member" value={attendSearch} onChange={(event) => setAttendSearch(event.target.value)} />
          <Input className="sm:max-w-xs" placeholder="Ticket code" value={ticketCode} onChange={(event) => setTicketCode(event.target.value)} />
          <Button type="button" disabled={!ticketCode || checkIn.isPending} onClick={() => checkIn.mutate({ ticketCode, status: "PRESENT" })}>Check in code</Button>
        </div>
        {attendance.data?.rows.length === 0 ? <div className="mt-4"><EmptyState title="No registered attendees yet." detail="Attendance can only be recorded for members with an approved registration." /></div> : null}
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">
          {(attendance.data?.rows ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
              <div>
                <p className="font-medium">{row.memberName}</p>
                <p className="text-xs text-muted-foreground">{row.membershipNo ?? "—"} · {row.checkedInAt ? formatEventTime(row.checkedInAt) : "Not checked in"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={row.attendanceStatus ?? "REGISTERED"} />
                <Button type="button" size="sm" onClick={() => checkIn.mutate({ accountId: row.accountId, status: "PRESENT" })}>Present</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => checkIn.mutate({ accountId: row.accountId, status: "ABSENT" })}>Absent</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="event-categories" className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold">Event categories</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input placeholder="New category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
          <Button type="button" variant="outline" disabled={saveCategory.isPending} onClick={() => saveCategory.mutate()}>Add category</Button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(categories.data ?? []).map((category) => (
            <li key={category.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span>{category.name}<span className="ml-2 text-xs text-muted-foreground">{category.eventCount}</span></span>
              <Button type="button" size="sm" variant="ghost" onClick={() => eventsApi.saveCategory({ name: category.name, isActive: !category.isActive }, category.id).then(() => queryClient.invalidateQueries({ queryKey: ["events", "categories"] })).catch((err) => toast.error(extractErrorMessage(err)))}>
                {category.isActive ? "Hide" : "Show"}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section id="event-reports" className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold">Reports</h2>
        {section !== "reports" ? <p className="mt-2 text-sm text-muted-foreground">Open Reports in the events menu to load attendance rates and registration trends.</p> : null}
        {reports.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading reports…</p> : null}
        {reports.data ? (
          <div className="mt-3 space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {reports.data.registrationTrend.map((point) => (
                <div key={point.month} className="rounded-lg bg-muted/70 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{point.month}</p>
                  <p className="text-lg font-semibold">{point.registrations} registrations</p>
                </div>
              ))}
              {reports.data.registrationTrend.length === 0 ? <p className="text-sm text-muted-foreground">No registration trend yet.</p> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 font-medium">Registrations</th>
                    <th className="py-2 pr-3 font-medium">Present</th>
                    <th className="py-2 pr-3 font-medium">Attendance</th>
                    <th className="py-2 font-medium">No-show</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.data.events.map((row) => (
                    <tr key={row.eventId} className="border-t border-border">
                      <td className="py-2 pr-3">{row.title}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.registrations}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.present}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.attendanceRate}%</td>
                      <td className="py-2 tabular-nums">{row.noShowRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirm != null}
        title={confirm?.kind === "delete" ? "Delete this event?" : "Cancel this event?"}
        description={confirm?.kind === "delete"
          ? "Deleting an event removes it together with its registrations and attendance. This cannot be undone."
          : "Members will be notified and the event will stop accepting registrations."}
        confirmLabel={confirm?.kind === "delete" ? "Delete event" : "Cancel event"}
        pending={act.isPending}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (!confirm) return;
          act.mutate({ type: confirm.kind === "delete" ? "delete" : "cancel", event: confirm.event, force: confirm.kind === "delete" });
        }}
      />
    </div>
  );
}
