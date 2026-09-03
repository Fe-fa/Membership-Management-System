import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/utils/cn";

export type MetricRow = {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "default" | "muted" | "success" | "warning";
};

export function AdminMetricCard({
  title,
  icon,
  rows,
  cta,
  className,
}: {
  title: string;
  icon: ReactNode;
  rows: MetricRow[];
  cta?: { label: string; to: string };
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex items-start gap-3 px-5 pt-5">
        <div className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
          {icon}
        </div>
        <h2 className="text-base font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h2>
      </header>

      <ul className="flex-1 space-y-4 px-5 py-5 text-sm">
        {rows.map((row) => (
          <li key={row.label} className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {row.label}:
            </p>
            <p
              className={cn(
                "font-medium leading-relaxed",
                row.tone === "muted" && "text-muted-foreground",
                row.tone === "success" && "text-emerald-700",
                row.tone === "warning" && "text-amber-700",
                (!row.tone || row.tone === "default") && "text-foreground",
              )}
            >
              {row.value}
            </p>
            {row.caption ? (
              <p className="text-xs text-muted-foreground">{row.caption}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {cta ? (
        <div className="px-5 pb-5">
          <Link
            to={cta.to}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            {cta.label}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
