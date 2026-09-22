import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Check,
  CircleHelp,
  FileText,
  Lock,
  Plus,
  Settings,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

import { PageFrame } from "@/components/layout/PageFrame";
import { PageDataGate } from "@/components/layout/PageLoading";
import { Button } from "@/components/ui/button";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";
import { supportDashboard } from "@/services/support";
import { cn } from "@/utils/cn";

const STATS = [
  { id: "open", label: "Open tickets", key: "open" as const, className: "bg-sky-500" },
  { id: "progress", label: "In Progress", key: "inProgress" as const, className: "bg-amber-400", icon: Settings },
  { id: "resolved", label: "Resolved", key: "resolved" as const, className: "bg-emerald-500", icon: Check },
  { id: "closed", label: "Closed", key: "closed" as const, className: "bg-violet-500", icon: Lock },
  { id: "today", label: "Submitted Today", key: "submittedToday" as const, className: "bg-cyan-500", icon: Calendar },
  { id: "total", label: "Total All Time", key: "total" as const, className: "bg-rose-500", icon: FileText },
];

export function HelpdeskDashboardPage() {
  const user = readUser();
  const deskScope = isStaff(user) && readPortalMode(user) === "admin" ? "inbox" : "mine";
  const dash = useQuery({
    queryKey: ["support-dashboard"],
    queryFn: supportDashboard,
  });

  return (
    <PageFrame width="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Helpdesk Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your support tickets</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              toast.message("Tour", {
                description:
                  "Create a ticket and pick a category (Chairman, Treasurer, General Manager, and so on). That role’s email is shown, and the ticket appears on their helpdesk. Your own tickets stay on this dashboard.",
              })
            }
          >
            <CircleHelp className="size-4" />
            Tour Guide
          </Button> */}
          <Button asChild size="sm">
            <Link to="/support/tickets" search={{ scope: "mine" }}>
              <Ticket className="size-4" />
              View My tickets
            </Link>
          </Button>
        </div>
      </div>

      <PageDataGate loading={dash.isLoading} label="Loading helpdesk…" minHeightClassName="min-h-[16rem]">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.id}
                className={cn("rounded-xl px-4 py-5 text-white shadow-sm", stat.className)}
              >
                <p className="text-3xl font-semibold tabular-nums">{dash.data?.[stat.key] ?? 0}</p>
                <div className="mt-6 flex items-center justify-between text-sm/5 text-white/90">
                  <span>{stat.label}</span>
                  {Icon ? <Icon className="size-4 opacity-80" /> : <Settings className="size-4 opacity-80" />}
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="My Tickets by Category" rows={dash.data?.byCategory ?? []} />
          <ChartCard title="My Tickets by Priority" rows={dash.data?.byPriority ?? []} />
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/support/tickets" search={{ scope: deskScope }}>
                <Ticket className="size-4" />
                All My Tickets
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/support/new">
                <Plus className="size-4" />
                Create New Ticket
              </Link>
            </Button>
          </div>
        </section>
      </PageDataGate>
    </PageFrame>
  );
}

function ChartCard({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No ticket data yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.name} className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{row.name}</span>
                <span>{row.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
