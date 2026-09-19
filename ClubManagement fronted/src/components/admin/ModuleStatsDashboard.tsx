import { useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Label,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ModuleDashboardModel } from "@/services/admin/moduleDashboard";
import { cn } from "@/utils/cn";
import { formatDate } from "@/utils/format";

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 28 - ((value - min) / Math.max(max - min, 0.01)) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" className={cn("h-8 w-24", className)} aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={points} />
    </svg>
  );
}

const KPI_TONE = {
  violet: "bg-violet-100 text-violet-600",
  sky: "bg-sky-100 text-sky-600",
  emerald: "bg-emerald-100 text-emerald-600",
  rose: "bg-rose-100 text-rose-600",
} as const;

const ACTION_TONE = {
  update: "bg-emerald-100 text-emerald-700",
  create: "bg-sky-100 text-sky-700",
  delete: "bg-rose-100 text-rose-700",
} as const;

function ChartCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80", className)}>
      <h2 className="mb-3 text-center text-sm font-semibold text-slate-700">{title}</h2>
      <div className="h-[240px]">{children}</div>
    </section>
  );
}

export function ModuleStatsDashboard({ model }: { model: ModuleDashboardModel }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const pageSize = 5;

  const ratioTotal = model.ratio.reduce((sum, slice) => sum + slice.value, 0);
  const activity = useMemo(() => {
    const term = query.trim().toLowerCase();
    return model.activity.filter((row) => {
      if (!term) return true;
      return `${row.action} ${row.staff} ${row.by}`.toLowerCase().includes(term);
    });
  }, [model.activity, query]);
  const pages = Math.max(1, Math.ceil(activity.length / pageSize));
  const safePage = Math.min(page, pages);
  const rows = activity.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {model.kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article key={kpi.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80">
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", KPI_TONE[kpi.tone])}>
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-semibold leading-none text-slate-800">{kpi.value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{kpi.label}</p>
              </div>
              <Sparkline
                values={kpi.spark}
                className={
                  kpi.tone === "rose" ? "text-rose-400" : kpi.tone === "emerald" ? "text-emerald-400" : "text-sky-400"
                }
              />
            </article>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <ChartCard title={model.ratioTitle}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={model.ratio}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={1}
              >
                {model.ratio.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
                <Label
                  value={ratioTotal}
                  position="center"
                  className="fill-slate-800 text-2xl font-semibold"
                />
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" iconType="square" />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={model.movementTitle}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={model.months} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="primary" name={model.movementPrimary} fill="#2563eb" radius={[2, 2, 0, 0]} barSize={18} />
              <Bar dataKey="secondary" name={model.movementSecondary} fill="#ef4444" radius={[2, 2, 0, 0]} barSize={18} />
              <Line type="monotone" dataKey="trend" name="Total" stroke="#334155" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={model.breakdownTitle}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.breakdown} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={96} tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={model.rankingTitle}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.ranking} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
          <div className="flex items-center justify-between bg-slate-950 px-4 py-2.5 text-white">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
          </div>
          <div className="flex justify-end px-3 py-2">
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search"
              className="h-8 w-40"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Staff</th>
                  <th className="px-3 py-2 font-semibold">By</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row, index) => (
                    <tr key={`${row.action}-${row.staff}-${index}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", ACTION_TONE[row.tone])}>
                          {row.action}
                        </span>
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-slate-600">{row.staff}</td>
                      <td className="px-3 py-2 text-slate-500">{row.by}</td>
                      <td className="px-3 py-2 text-slate-500">{formatDate(row.date)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      No activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <button type="button" className="disabled:opacity-40" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            {Array.from({ length: Math.min(pages, 5) }, (_, index) => index + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={cn("grid size-6 place-items-center rounded", n === safePage ? "bg-cyan-500 text-white" : "hover:bg-slate-100")}
              >
                {n}
              </button>
            ))}
            <button type="button" className="disabled:opacity-40" disabled={safePage >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </section>
      </div>

      {expanded ? (
        <ChartCard title={model.extraBreakdownTitle} className="xl:col-span-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.extraBreakdown} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}

      <div className="flex justify-center pb-2">
        <Button
          type="button"
          className="rounded-full bg-cyan-500 px-5 text-white hover:bg-cyan-400"
          onClick={() => setExpanded((value) => !value)}
        >
          <Plus className="size-4" />
          {expanded ? "Hide extra statistics" : "Load More Statistics"}
        </Button>
      </div>
    </div>
  );
}
