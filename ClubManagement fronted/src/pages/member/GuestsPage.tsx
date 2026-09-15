import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, Building2, Search, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { readUser } from "@/lib/auth";
import {
  VISIT_PURPOSES,
  isOtherVisitPurpose,
  resolveVisitPurpose,
} from "@/pages/admin/reception/types";
import { useMemberDashboard } from "@/services/member/dashboard";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";
import { formatKenyaDate, kenyaTodayISO } from "@/utils/kenyaDate";

type GuestPolicy = {
  maxActiveGuests: number;
  activeGuestCount: number;
  maxVisitsPerGuestMonth: number;
  maxVisitsPerGuestYear: number;
};

type VisitRow = {
  visitId: number;
  guestId?: number;
  guestName: string;
  visitDate: string;
  timeIn?: string | null;
  timeOut?: string | null;
  isCurrent: boolean;
  entryNo?: string | null;
  purpose?: string | null;
  hasPendingArrivalAlert?: boolean;
};

type GuestSummary = {
  key: string;
  guestId?: number;
  guestName: string;
  visitCount: number;
  lastVisitDate: string;
  isCurrent: boolean;
  currentVisitId?: number;
  hasPendingArrivalAlert?: boolean;
  visits: VisitRow[];
};

type StatusFilter = "all" | "current" | "signed-out";
type DateFilter = "all" | "today" | "week";

type ReciprocalSummary = {
  daysUsedIn12Months: number;
  maxDays: number;
  visits: { reciprocalUsageId: number; homeClubName: string; visitDate: string; daysUsed: number }[];
  clubs: { clubId: number; clubName: string }[];
};

export function GuestsPage() {
  const user = readUser();
  const dashboard = useMemberDashboard();
  const hostName = dashboard.data?.fullName ?? user?.fullName ?? "You";
  const membershipNo = dashboard.data?.membershipNo;

  const [addOpen, setAddOpen] = useState(false);
  const [reciprocalOpen, setReciprocalOpen] = useState(false);
  const [detailGuest, setDetailGuest] = useState<GuestSummary | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<{ visitId: number; guestName: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const visits = useQuery({
    queryKey: ["guest-visits"],
    queryFn: () => apiRequest<VisitRow[]>("/api/guests/visits"),
  });

  const policy = useQuery({
    queryKey: ["guest-policy"],
    queryFn: () => apiRequest<GuestPolicy>("/api/guests/policy"),
  });

  const maxActive = policy.data?.maxActiveGuests ?? 6;
  const maxMonth = policy.data?.maxVisitsPerGuestMonth ?? 2;
  const maxYear = policy.data?.maxVisitsPerGuestYear ?? 12;

  const today = kenyaTodayISO();
  const rows = visits.data ?? [];
  const guests = useMemo(() => groupVisitsByGuest(rows), [rows]);

  const onSiteGuests = useMemo(() => guests.filter((guest) => guest.isCurrent && guest.currentVisitId), [guests]);

  const stats = useMemo(() => {
    const onSite = policy.data?.activeGuestCount ?? onSiteGuests.length;
    const todayCount = rows.filter((row) => row.visitDate.slice(0, 10) === today).length;
    return {
      onSite,
      remaining: Math.max(0, maxActive - onSite),
      todayCount,
      uniqueGuests: guests.length,
    };
  }, [guests.length, onSiteGuests.length, rows, today, maxActive, policy.data?.activeGuestCount]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return guests.filter((guest) => {
      if (statusFilter === "current" && !guest.isCurrent) return false;
      if (statusFilter === "signed-out" && guest.isCurrent) return false;
      if (dateFilter === "today" && !guest.visits.some((v) => v.visitDate.slice(0, 10) === today)) return false;
      if (dateFilter === "week" && !guest.visits.some((v) => withinDays(v.visitDate, 7))) return false;
      if (!needle) return true;
      return guest.guestName.toLowerCase().includes(needle);
    });
  }, [guests, search, statusFilter, dateFilter, today]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  async function signOut(visitId: number) {
    try {
      await apiRequest(`/api/guests/visits/${visitId}/sign-out`, {
        method: "POST",
        body: JSON.stringify({ timeOut: new Date().toISOString().slice(11, 19) }),
      });
      toast.success("Guest signed out.");
      const refreshed = await visits.refetch();
      void policy.refetch();
      if (detailGuest) {
        const next = groupVisitsByGuest(refreshed.data ?? []).find((g) => g.key === detailGuest.key) ?? null;
        setDetailGuest(next);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  async function notifyReception(visitId: number, message?: string) {
    try {
      await apiRequest(`/api/guests/visits/${visitId}/notify-reception`, {
        method: "POST",
        body: JSON.stringify({ message: message?.trim() || null }),
      });
      toast.success("Reception has been notified.");
      const refreshed = await visits.refetch();
      if (detailGuest) {
        const next = groupVisitsByGuest(refreshed.data ?? []).find((g) => g.key === detailGuest.key) ?? null;
        setDetailGuest(next);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  return (
    <PageFrame>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title=""
          description={`Maximum ${maxActive} guests at a time. The same guest may not be introduced more than ${maxMonth} time${maxMonth === 1 ? "" : "s"} a month or ${maxYear} times a calendar year.`}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setReciprocalOpen(true)}>
            <Building2 className="size-4" />
            Reciprocal clubs
          </Button>
          <Button type="button" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" />
            Add guest
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="On site now" value={stats.onSite} hint={`of ${maxActive} allowed`} />
        <StatCard
          label="Slots remaining"
          value={stats.remaining}
          hint="Concurrent guests"
          tone={stats.remaining === 0 ? "amber" : undefined}
        />
        <StatCard label="Visits today" value={stats.todayCount} />
        <StatCard label="Guests" value={stats.uniqueGuests} hint="Unique people introduced" />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Bell className="size-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Notify reception</h2>
          </div>
        </div>
        {onSiteGuests.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted-foreground">
            No guests are signed in right now. 
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {onSiteGuests.map((guest) => (
              <li key={guest.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{guest.guestName}</p>
                  <p className="text-sm text-muted-foreground">Signed in · on site now</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {guest.hasPendingArrivalAlert ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                      <Bell className="size-3" />
                      Reception notified
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        setNotifyTarget({ visitId: guest.currentVisitId!, guestName: guest.guestName })
                      }
                    >
                      <Bell className="size-3.5" />
                      Notify reception
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void signOut(guest.currentVisitId!)}
                  >
                    Sign out
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex min-h-[24rem] flex-col rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <span className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search guest name"
            />
          </span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="all">Any status</option>
            <option value="current">On site</option>
            <option value="signed-out">Signed out</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={dateFilter}
            onChange={(event) => {
              setDateFilter(event.target.value as DateFilter);
              setPage(1);
            }}
            aria-label="Filter by date"
          >
            <option value="all">Any date</option>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
          </select>
        </div>

        <div className="flex-1">
          {visits.isLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">Loading guests…</p>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <Users className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {guests.length === 0 ? "No guests yet. Add a guest to start the book." : "No guests match these filters."}
              </p>
            </div>
          ) : (
            pageRows.map((guest) => (
              <div
                key={guest.key}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">{guest.guestName}</p>
                  <p className="text-sm text-muted-foreground">
                    {guest.visitCount} visit{guest.visitCount === 1 ? "" : "s"} · last {formatKenyaDate(guest.lastVisitDate)}
                    {guest.isCurrent ? " · currently signed in" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDetailGuest(guest)}>
                    View details
                  </Button>
                  {guest.isCurrent && guest.currentVisitId ? (
                    <>
                      {guest.hasPendingArrivalAlert ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          <Bell className="size-3" />
                          Reception notified
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setNotifyTarget({ visitId: guest.currentVisitId!, guestName: guest.guestName })
                          }
                        >
                          <Bell className="size-3.5" />
                          Notify reception
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={() => void signOut(guest.currentVisitId!)}>
                        Sign out
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-3 py-2">
          <ListPagination
            page={safePage}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      </section>

      <NotifyReceptionDialog
        target={notifyTarget}
        onClose={() => setNotifyTarget(null)}
        onSend={async (visitId, message) => {
          await notifyReception(visitId, message);
          setNotifyTarget(null);
        }}
      />

      <AddGuestDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        hostName={hostName}
        membershipNo={membershipNo}
        onRegistered={async () => {
          await visits.refetch();
          void policy.refetch();
          setAddOpen(false);
        }}
      />

      <GuestDetailSheet
        guest={detailGuest}
        onClose={() => setDetailGuest(null)}
        onSignOut={(visitId) => void signOut(visitId)}
        onNotifyReception={(visitId, guestName) => setNotifyTarget({ visitId, guestName })}
      />

      <Sheet open={reciprocalOpen} onOpenChange={setReciprocalOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Reciprocal clubs</SheetTitle>
            <SheetDescription>Record visits under reciprocal arrangements with partner clubs.</SheetDescription>
          </SheetHeader>
          <ReciprocalPanel />
        </SheetContent>
      </Sheet>
    </PageFrame>
  );
}

function NotifyReceptionDialog({
  target,
  onClose,
  onSend,
}: {
  target: { visitId: number; guestName: string } | null;
  onClose: () => void;
  onSend: (visitId: number, message?: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) {
          setMessage("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notify reception</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Let reception know <span className="font-medium text-foreground">{target?.guestName}</span> is at the club
          and you have not arrived yet.
        </p>
        <Field label="Optional message">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Guest arrived before host member."
            maxLength={500}
          />
        </Field>
        <Button
          type="button"
          className="w-full"
          disabled={sending || !target}
          onClick={() => {
            if (!target) return;
            setSending(true);
            void onSend(target.visitId, message).finally(() => setSending(false));
          }}
        >
          {sending ? "Sending…" : "Send notification to reception"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function GuestDetailSheet({
  guest,
  onClose,
  onSignOut,
  onNotifyReception,
}: {
  guest: GuestSummary | null;
  onClose: () => void;
  onSignOut: (visitId: number) => void;
  onNotifyReception: (visitId: number, guestName: string) => void;
}) {
  return (
    <Sheet open={Boolean(guest)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{guest?.guestName ?? "Guest"}</SheetTitle>
          <SheetDescription>
            {guest
              ? `${guest.visitCount} visit${guest.visitCount === 1 ? "" : "s"} on record`
              : "Visit history"}
          </SheetDescription>
        </SheetHeader>

        {guest ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Total visits</p>
                <p className="text-lg font-semibold">{guest.visitCount}</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-lg font-semibold">{guest.isCurrent ? "On site" : "Signed out"}</p>
              </div>
            </div>

            {guest.isCurrent && guest.currentVisitId ? (
              <div className="space-y-2">
                {guest.hasPendingArrivalAlert ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Reception has been notified that this guest arrived before you.
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => onNotifyReception(guest.currentVisitId!, guest.guestName)}
                  >
                    <Bell className="size-4" />
                    Notify reception — guest arrived first
                  </Button>
                )}
                <Button type="button" variant="outline" className="w-full" onClick={() => onSignOut(guest.currentVisitId!)}>
                  Sign out now
                </Button>
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 text-sm font-medium">Visit history</h3>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {guest.visits.map((visit) => (
                  <li key={visit.visitId} className="px-3 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium">{formatKenyaDate(visit.visitDate)}</p>
                        <p className="text-xs text-muted-foreground">
                          {visit.timeIn ? `In ${formatTime(visit.timeIn)}` : "Time in not recorded"}
                          {visit.timeOut ? ` · Out ${formatTime(visit.timeOut)}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Reason: {visit.purpose?.trim() || "Not specified"}
                        </p>
                        {visit.entryNo ? (
                          <p className="text-xs text-muted-foreground">
                            Application no: {visit.entryNo}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          visit.isCurrent ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {visit.isCurrent ? "On site" : "Signed out"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AddGuestDialog({
  open,
  onOpenChange,
  hostName,
  membershipNo,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostName: string;
  membershipNo?: string | null;
  onRegistered: () => Promise<void>;
}) {
  const [guest, setGuest] = useState({
    firstName: "",
    surname: "",
    email: "",
    visitDate: kenyaTodayISO(),
    purpose: "",
    purposeOther: "",
    status: "On site",
    signatureName: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const register = useMutation({
    mutationFn: () =>
      apiRequest("/api/guests/register", {
        method: "POST",
        body: JSON.stringify({
          firstName: guest.firstName.trim(),
          surname: guest.surname.trim(),
          email: guest.email.trim() || null,
          visitDate: guest.visitDate,
          purpose: resolveVisitPurpose(guest.purpose, guest.purposeOther),
          signature: `typed:${guest.signatureName.trim()}`,
          status: guest.status,
        }),
      }),
    onSuccess: async () => {
      toast.success("Guest registered.");
      setGuest({
        firstName: "",
        surname: "",
        email: "",
        visitDate: kenyaTodayISO(),
        purpose: "",
        purposeOther: "",
        status: "On site",
        signatureName: "",
      });
      setErrors({});
      await onRegistered();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  function validate() {
    const next: Record<string, string> = {};
    if (!guest.firstName.trim()) next.firstName = "Required.";
    if (!guest.surname.trim()) next.surname = "Required.";
    if (guest.email.trim() && !guest.email.includes("@")) next.email = "Enter a valid email.";
    if (!guest.visitDate) next.visitDate = "Required.";
    if (!guest.signatureName.trim()) next.signature = "Type the guest's name.";
    if (isOtherVisitPurpose(guest.purpose) && !guest.purposeOther.trim()) {
      next.purposeOther = "Please describe the reason for the visit.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setErrors({});
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Guest entry</DialogTitle>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!validate()) return;
            register.mutate();
          }}
        >
          <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
            <p className="font-medium">{hostName}</p>
            <p className="text-xs text-muted-foreground">
              {membershipNo && membershipNo !== "AC pending" ? membershipNo : "Assigned automatically"}
            </p>
          </div>

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="col-span-2 text-xs font-medium text-muted-foreground">Guest details</legend>
            <Field label="First name" error={errors.firstName}>
              <Input
                required
                value={guest.firstName}
                onChange={(event) => setGuest({ ...guest, firstName: event.target.value })}
              />
            </Field>
            <Field label="Surname" error={errors.surname}>
              <Input
                required
                value={guest.surname}
                onChange={(event) => setGuest({ ...guest, surname: event.target.value })}
              />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input
                type="email"
                value={guest.email}
                onChange={(event) => setGuest({ ...guest, email: event.target.value })}
                placeholder="Optional"
              />
            </Field>
            <Field label="Reason for club visit">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={guest.purpose}
                onChange={(event) => {
                  const purpose = event.target.value;
                  setGuest({
                    ...guest,
                    purpose,
                    purposeOther: isOtherVisitPurpose(purpose) ? guest.purposeOther : "",
                  });
                }}
              >
                <option value="">Not specified</option>
                {VISIT_PURPOSES.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </Field>
            {isOtherVisitPurpose(guest.purpose) ? (
              <Field label="Please specify" error={errors.purposeOther} className="col-span-2">
                <Input
                  value={guest.purposeOther}
                  onChange={(event) => setGuest({ ...guest, purposeOther: event.target.value })}
                  placeholder="Describe the reason for the visit"
                />
              </Field>
            ) : null}
            <Field label="Visit date" error={errors.visitDate}>
              <Input
                type="date"
                required
                value={guest.visitDate}
                onChange={(event) => setGuest({ ...guest, visitDate: event.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={guest.status}
                onChange={(event) => setGuest({ ...guest, status: event.target.value })}
              >
                <option>On site</option>
                <option>Signed out</option>
              </select>
            </Field>
          </fieldset>

          <Field label="Guest signature (type name)" error={errors.signature}>
            <Input
              value={guest.signatureName}
              onChange={(event) => setGuest({ ...guest, signatureName: event.target.value })}
              placeholder="Type the guest's full name"
              autoComplete="off"
            />
          </Field>

          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending
              ? "Registering…"
              : guest.status === "Signed out"
                ? "Register visit"
                : "Register & sign in"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReciprocalPanel() {
  const summary = useQuery({
    queryKey: ["member-reciprocal"],
    queryFn: () => apiRequest<ReciprocalSummary>("/api/members/me/reciprocal"),
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
          visitDate: kenyaTodayISO(),
          daysUsed: Number(days),
        }),
      });
      toast.success("Reciprocal visit recorded.");
      setClubId("");
      setDays("1");
      await summary.refetch();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  const data = summary.data;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        30 days in any 12 months. Used: {data?.daysUsedIn12Months ?? 0} / {data?.maxDays ?? 30}.
      </p>

      <form onSubmit={(e) => void record(e)} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Home club</span>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            required
          >
            <option value="">Select club</option>
            {(data?.clubs ?? []).map((club) => (
              <option key={club.clubId} value={club.clubId}>
                {club.clubName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Days used</span>
          <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} required />
        </label>
        <Button type="submit" className="w-full">
          Record visit
        </Button>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Recent reciprocal visits</h3>
        {(data?.visits ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No reciprocal visits recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {(data?.visits ?? []).slice(0, 12).map((visit) => (
              <li key={visit.reciprocalUsageId} className="px-3 py-2 text-sm">
                <p className="font-medium">{visit.homeClubName}</p>
                <p className="text-xs text-muted-foreground">
                  {visit.visitDate.slice(0, 10)} · {visit.daysUsed} day{visit.daysUsed === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "amber" ? "border-amber-200 bg-amber-50/70" : "border-border bg-card",
      )}
    >
      <p
        className={cn(
          "text-xs uppercase tracking-wide",
          tone === "amber" ? "text-amber-900/70" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold", tone === "amber" ? "text-amber-950" : "text-foreground")}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("grid gap-1 text-sm", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function groupVisitsByGuest(rows: VisitRow[]): GuestSummary[] {
  const map = new Map<string, GuestSummary>();

  for (const row of rows) {
    const key =
      row.guestId && row.guestId > 0
        ? `id:${row.guestId}`
        : `name:${row.guestName.trim().toLowerCase().replace(/\s+/g, " ")}`;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        guestId: row.guestId,
        guestName: row.guestName,
        visitCount: 1,
        lastVisitDate: row.visitDate,
        isCurrent: row.isCurrent,
        currentVisitId: row.isCurrent ? row.visitId : undefined,
        hasPendingArrivalAlert: row.isCurrent && row.hasPendingArrivalAlert,
        visits: [row],
      });
      continue;
    }

    existing.visits.push(row);
    existing.visitCount += 1;
    if (row.isCurrent) {
      existing.isCurrent = true;
      existing.currentVisitId = row.visitId;
      if (row.hasPendingArrivalAlert) existing.hasPendingArrivalAlert = true;
    }
    if (row.visitDate.slice(0, 10) > existing.lastVisitDate.slice(0, 10)) {
      existing.lastVisitDate = row.visitDate;
      existing.guestName = row.guestName;
    }
  }

  return [...map.values()]
    .map((guest) => ({
      ...guest,
      visits: [...guest.visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate) || b.visitId - a.visitId),
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastVisitDate.localeCompare(a.lastVisitDate);
    });
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const raw = value.length >= 5 ? value.slice(0, 5) : value;
  return raw;
}

function withinDays(isoDate: string, days: number) {
  const day = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const visit = new Date(`${day}T12:00:00`);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return visit >= cutoff;
}
