import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/membership/api";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

export type NmCollectionPeriod = "today" | "week" | "month" | "year" | "custom";

export type NmRevenueSummary = {
  collectionTotal: number;
  openItems: number;
  period: string;
  from: string;
  to: string;
};

export const NM_PAYMENT_METHODS = [
  { value: "MPESA_EXPRESS", label: "M-Pesa Express (STK Push)" },
  { value: "MPESA_MANUAL", label: "M-Pesa Manual Reference" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Credit / Debit Card" },
] as const;

const PERIOD_OPTIONS: { value: NmCollectionPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Date range" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function useNmSummary(
  period: NmCollectionPeriod = "month",
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: ["nm-billing-summary", period, from ?? "", to ?? ""],
    queryFn: () => {
      const params = new URLSearchParams({ period });
      if (period === "custom") {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }
      return apiRequest<NmRevenueSummary>(`/api/finance/non-membership/summary?${params}`);
    },
  });
}

export function invalidateNmSummary(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ["nm-billing-summary"] });
}

export function NmRevenueSummaryCards() {
  const [period, setPeriod] = useState<NmCollectionPeriod>("month");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [appliedFrom, setAppliedFrom] = useState(todayIso());
  const [appliedTo, setAppliedTo] = useState(todayIso());

  const summary = useNmSummary(
    period,
    period === "custom" ? appliedFrom : undefined,
    period === "custom" ? appliedTo : undefined,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Collection</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {summary.data ? formatKes(summary.data.collectionTotal) : "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Period</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={period}
                onChange={(e) => setPeriod(e.target.value as NmCollectionPeriod)}
              >
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {period === "custom" ? (
              <>
                <label className="grid gap-1 text-xs">
                  <span className="text-muted-foreground">From</span>
                  <input
                    type="date"
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="text-muted-foreground">To</span>
                  <input
                    type="date"
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex h-8 items-center rounded-md bg-secondary px-2.5 text-xs font-medium text-secondary-foreground"
                  onClick={() => {
                    setAppliedFrom(from || todayIso());
                    setAppliedTo(to || from || todayIso());
                  }}
                >
                  Apply
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Stat label="Open items" value={summary.data?.openItems ?? "—"} tone="amber" />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
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
      <p
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "amber" ? "text-amber-950" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function NmFilterBar({
  search,
  status,
  method,
  from,
  to,
  statusOptions,
  onSearch,
  onStatus,
  onMethod,
  onFrom,
  onTo,
  onApply,
  actions,
}: {
  search: string;
  status: string;
  method: string;
  from: string;
  to: string;
  statusOptions: { value: string; label: string }[];
  onSearch: (v: string) => void;
  onStatus: (v: string) => void;
  onMethod: (v: string) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onApply: () => void;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={from}
            onChange={(e) => onFrom(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={to}
            onChange={(e) => onTo(e.target.value)}
          />
        </label>
        <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Name, receipt, room…"
            onKeyDown={(e) => {
              if (e.key === "Enter") onApply();
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => onStatus(e.target.value)}
          >
            <option value="">All</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Method</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={method}
            onChange={(e) => onMethod(e.target.value)}
          >
            <option value="">All</option>
            {NM_PAYMENT_METHODS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground"
          onClick={onApply}
        >
          Apply filters
        </button>
        {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
