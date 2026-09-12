import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageBackLink, PageFrame } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { canOperateReception, canViewAllReceptionVisits, isReceptionistOnly, readUser } from "@/lib/auth";
import { emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";
import { formatKenyaDate, kenyaTodayISO } from "@/utils/kenyaDate";

import { RegisterGuestCard } from "./reception/RegisterGuestCard";
import type { ReceptionHost, ReceptionVisitRow } from "./reception/types";

const routeApi = getRouteApi("/reception");
const VISIT_PAGE_SIZE = 50;

type DateFilter = "all" | "today" | "week";

export function ReceptionDashboardPage() {
  const user = readUser();
  const canOperate = canOperateReception(user);
  const canViewAll = canViewAllReceptionVisits(user);
  const receptionHome = isReceptionistOnly(user);
  const searchParams = routeApi.useSearch();
  const section = "section" in searchParams ? String(searchParams.section ?? "") : "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<ReceptionVisitRow | null>(null);
  const [historyHost, setHistoryHost] = useState<ReceptionHost | null>(null);

  const onSiteVisits = useQuery({
    queryKey: ["reception-visits", "onsite"],
    queryFn: () =>
      apiRequest<PagedResult<ReceptionVisitRow>>(
        `/api/reception/visits?${pagedQuery({ page: 1, pageSize: 50 })}&currentOnly=true`,
      ),
    enabled: section !== "visit",
  });

  const signOut = useMutation({
    mutationFn: (visitId: number) =>
      apiRequest<ReceptionVisitRow>(`/api/reception/visits/${visitId}/sign-out`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Guest signed out.");
      void queryClient.invalidateQueries({ queryKey: ["reception-visits"] });
      void queryClient.invalidateQueries({ queryKey: ["reception-host-visits"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  useEffect(() => {
    if (section === "visit" && !canViewAll) {
      void navigate({ to: "/reception", search: {} });
    }
  }, [section, canViewAll, navigate]);

  const onSite = onSiteVisits.data?.items ?? [];

  function openHostHistory(row: ReceptionVisitRow) {
    setHistoryHost({
      profileId: row.accompanyingProfileId,
      membershipNo: "",
      fullName: row.accompanyingMemberName || "Host member",
    });
    setViewing(null);
    if (section === "visit") void navigate({ to: "/reception", search: {} });
  }

  if (section === "visit" && canViewAll) {
    return (
      <AllVisitsPage
        canOperate={canOperate}
        onView={setViewing}
        onHostHistory={openHostHistory}
        onSignOut={(row) => signOut.mutate(row.visitId)}
        signingOut={signOut.isPending}
        drawer={<VisitDrawer visit={viewing} onClose={() => setViewing(null)} onHostHistory={openHostHistory} canBrowseHistory />}
      />
    );
  }

  const directory = (
    <section className="flex min-h-[28rem] flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">On site</h2>
          <p className="text-xs text-muted-foreground">
            {onSite.length} guest{onSite.length === 1 ? "" : "s"} in the club now
          </p>
        </div>
        {canViewAll ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void navigate({ to: "/reception", search: { section: "visit" } })}>
            View all visits
          </Button>
        ) : null}
      </div>
      {canViewAll ? null : <GuestLookup />}
      <VisitTable
        rows={onSite}
        emptyLabel={onSiteVisits.isFetching ? "Checking who is on site…" : "No guests currently on site."}
        canOperate={canOperate}
        canBrowseHistory={canViewAll}
        signingOut={signOut.isPending}
        onView={setViewing}
        onHostHistory={openHostHistory}
        onSignOut={(row) => signOut.mutate(row.visitId)}
      />
    </section>
  );

  if (!canOperate) {
    return (
      <PageFrame width="lg" className="max-w-none">
        <PageBackLink to="/admin" label="Back to admin dashboard" />
        <header>
          <h1 className="text-xl font-semibold">Guests on site</h1>
          <p className="text-sm text-muted-foreground">Only guests currently in the club. Open all visits when you need the full book.</p>
        </header>
        {directory}
        <VisitDrawer visit={viewing} onClose={() => setViewing(null)} onHostHistory={openHostHistory} canBrowseHistory={canViewAll} />
      </PageFrame>
    );
  }

  return (
    <PageFrame width="lg" className="max-w-none">
      {receptionHome ? null : <PageBackLink to="/admin" label="Back to admin dashboard" />}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(20rem,2fr)_minmax(0,3fr)]">
        <RegisterGuestCard
          requestedHost={historyHost}
          onRegistered={(visit) => {
            toast.success(`${visit.guestName} registered.`);
            void queryClient.invalidateQueries({ queryKey: ["reception-visits"] });
            void queryClient.invalidateQueries({ queryKey: ["reception-host-visits"] });
          }}
        />
        {directory}
      </div>

      <VisitDrawer visit={viewing} onClose={() => setViewing(null)} onHostHistory={openHostHistory} canBrowseHistory={canViewAll} />
    </PageFrame>
  );
}

function AllVisitsPage({
  canOperate,
  signingOut,
  onView,
  onHostHistory,
  onSignOut,
  drawer,
}: {
  canOperate: boolean;
  signingOut: boolean;
  onView: (row: ReceptionVisitRow) => void;
  onHostHistory: (row: ReceptionVisitRow) => void;
  onSignOut: (row: ReceptionVisitRow) => void;
  drawer: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(VISIT_PAGE_SIZE);

  const visits = useQuery({
    queryKey: ["reception-visits", "all", page, pageSize],
    queryFn: () =>
      apiRequest<PagedResult<ReceptionVisitRow>>(
        `/api/reception/visits?${pagedQuery({ page, pageSize })}`,
      ),
  });

  const pageData = visits.data ?? emptyPage<ReceptionVisitRow>(page, pageSize);
  const today = kenyaTodayISO();
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pageData.items.filter((row) => {
      if (dateFilter === "today" && row.visitDate.slice(0, 10) !== today) return false;
      if (dateFilter === "week" && !withinDays(row.visitDate, 7)) return false;
      if (!needle) return true;
      return [row.guestName, row.accompanyingMemberName, row.email, row.purpose]
        .some((value) => (value ?? "").toLowerCase().includes(needle));
    });
  }, [pageData.items, query, dateFilter, today]);

  return (
    <PageFrame width="lg" className="max-w-none">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => void navigate({ to: "/reception", search: {} })}>
            Back to reception
          </Button>
          <h1 className="text-xl font-semibold">All visits</h1>
          <p className="text-sm text-muted-foreground">The full guest book, loaded only when you open this page.</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-md">
          <span className="relative min-w-[10rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search guest or host"
            />
          </span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            aria-label="Filter by date"
          >
            <option value="all">Any date</option>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
          </select>
        </div>
      </div>

      <section className="flex min-h-[28rem] flex-col rounded-xl border border-border bg-card">
        <VisitTable
          rows={filtered}
          emptyLabel={visits.isFetching ? "Loading the guest book…" : "No visits match this filter."}
          canOperate={canOperate}
          canBrowseHistory
          signingOut={signingOut}
          onView={onView}
          onHostHistory={onHostHistory}
          onSignOut={onSignOut}
        />
        <div className="border-t border-border px-2 py-1">
          <ListPagination
            page={page}
            pageSize={pageSize}
            totalCount={pageData.totalCount}
            totalPages={pageData.totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </section>
      {drawer}
    </PageFrame>
  );
}

function GuestLookup() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState("");

  const lookup = useQuery({
    queryKey: ["reception-visit-lookup", submitted],
    queryFn: () =>
      apiRequest<ReceptionVisitRow[]>(`/api/reception/visits/lookup?name=${encodeURIComponent(submitted)}`),
    enabled: open && submitted.length >= 2,
  });

  const matches = lookup.data ?? [];

  return (
    <div className="border-b border-border px-4 py-3">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setName("");
            setSubmitted("");
          }
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto">
            <Search className="size-3.5" />
            Look up guest
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Guest lookup</DialogTitle>
            <DialogDescription>
              Search by guest name to see visit date, host, purpose, and guest book entry number.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(name.trim());
            }}
          >
            <span className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Guest name"
                aria-label="Guest name"
                autoFocus
              />
            </span>
            <Button type="submit" size="sm" disabled={name.trim().length < 2 || lookup.isFetching}>
              {lookup.isFetching ? "Looking up…" : "Look up"}
            </Button>
          </form>
          {submitted.length >= 2 ? (
            <div className="space-y-2">
              {lookup.isError ? (
                <p className="text-sm text-destructive">Could not look up that name. Try again.</p>
              ) : lookup.isFetching ? (
                <p className="text-sm text-muted-foreground">Searching visits…</p>
              ) : matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visit found for that name.</p>
              ) : (
                matches.map((row) => (
                  <div key={row.visitId} className="rounded-md border border-border px-3 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{row.guestName}</p>
                      <StatusBadge current={row.isCurrent} label={row.status} />
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                      Guest book entry:{" "}
                      <span className="font-mono tracking-wide">{row.guestBookEntryNo || "—"}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Host {row.accompanyingMemberName || "—"}
                      {" · "}
                      {formatKenyaDate(row.visitDate)}
                      {row.timeIn ? ` · in ${formatTime(row.timeIn)}` : ""}
                      {row.timeOut ? ` · out ${formatTime(row.timeOut)}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.purpose || "Purpose not recorded"}</p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Enter at least two letters of the guest name.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VisitTable({
  rows,
  emptyLabel,
  canOperate,
  canBrowseHistory,
  signingOut,
  onView,
  onHostHistory,
  onSignOut,
}: {
  rows: ReceptionVisitRow[];
  emptyLabel: string;
  canOperate: boolean;
  canBrowseHistory: boolean;
  signingOut: boolean;
  onView: (row: ReceptionVisitRow) => void;
  onHostHistory: (row: ReceptionVisitRow) => void;
  onSignOut: (row: ReceptionVisitRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Guest</th>
            <th className="px-3 py-2 font-medium">Host</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">When</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.visitId} className="border-b border-border last:border-0">
              <td className="px-3 py-2.5">
                <p className="font-medium">{row.guestName}</p>
                <p className="text-xs text-muted-foreground">{canBrowseHistory ? row.email || row.purpose || "—" : row.purpose || "—"}</p>
              </td>
              <td className="px-3 py-2.5">{row.accompanyingMemberName || "—"}</td>
              <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                {formatKenyaDate(row.visitDate)}
                {row.timeIn ? ` · ${formatTime(row.timeIn)}` : ""}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge current={row.isCurrent} label={row.status} />
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-1">
                  {row.isCurrent && canOperate ? (
                    <Button type="button" size="sm" variant="outline" disabled={signingOut} onClick={() => onSignOut(row)}>
                      Sign out
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.guestName}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onView(row)}>View details</DropdownMenuItem>
                      {canBrowseHistory ? (
                        <DropdownMenuItem onSelect={() => onHostHistory(row)}>Host history</DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ current, label }: { current: boolean; label?: string | null }) {
  const text = label || (current ? "On site" : "Signed out");
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        current ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
      )}
    >
      {text}
    </span>
  );
}

function VisitDrawer({
  visit,
  onClose,
  onHostHistory,
  canBrowseHistory,
}: {
  visit: ReceptionVisitRow | null;
  onClose: () => void;
  onHostHistory: (row: ReceptionVisitRow) => void;
  canBrowseHistory: boolean;
}) {
  const detail = useQuery({
    queryKey: ["reception-visit", visit?.visitId],
    queryFn: () => apiRequest<ReceptionVisitRow>(`/api/reception/visits/${visit?.visitId}`),
    enabled: Boolean(visit?.visitId),
  });
  const shown = detail.data ?? visit;

  return (
    <Sheet open={Boolean(visit)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{shown?.guestName ?? "Visit"}</SheetTitle>
        </SheetHeader>
        {shown ? (
          <div className="mt-4 space-y-4 text-sm">
            <dl className="grid gap-3">
              <Detail label="Host" value={shown.accompanyingMemberName || "—"} />
              <Detail label="Date" value={`${formatKenyaDate(shown.visitDate)}${shown.timeIn ? ` · in ${formatTime(shown.timeIn)}` : ""}${shown.timeOut ? ` · out ${formatTime(shown.timeOut)}` : ""}`} />
              {canBrowseHistory ? <Detail label="Email" value={shown.email || "—"} /> : null}
              <Detail label="Purpose" value={shown.purpose || "—"} />
              <Detail label="Guest book entry" value={shown.guestBookEntryNo || "—"} />
              <Detail label="Status" value={shown.status || (shown.isCurrent ? "On site" : "Signed out")} />
            </dl>
            {canBrowseHistory ? (
              <div>
                <p className="text-xs text-muted-foreground">Signature</p>
                <div className="mt-1">
                  {detail.isFetching ? (
                    <p className="text-muted-foreground">Loading signature…</p>
                  ) : shown.signature?.startsWith("data:image") ? (
                    <img src={shown.signature} alt="Guest signature" className="h-24 rounded-md border border-border bg-background" />
                  ) : shown.signature?.startsWith("typed:") ? (
                    <p className="font-serif text-lg">{shown.signature.slice(6)}</p>
                  ) : (
                    <p className="text-muted-foreground">{shown.hasSignature ? "Signed" : "No signature stored"}</p>
                  )}
                </div>
              </div>
            ) : null}
            {canBrowseHistory ? (
              <Button type="button" variant="outline" onClick={() => onHostHistory(shown)}>
                View this host's history
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function withinDays(value: string, days: number) {
  const day = value.slice(0, 10);
  const then = new Date(`${day}T00:00:00`);
  if (Number.isNaN(then.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return then >= start;
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const [hours, minutes] = value.split(":");
  const hour = Number(hours);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes ?? "00"} ${suffix}`;
}
