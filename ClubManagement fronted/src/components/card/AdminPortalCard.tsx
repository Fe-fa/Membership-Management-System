import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import type { AdminModuleTone } from "@/services/admin/modules";
import { cn } from "@/utils/cn";

const TONE: Record<AdminModuleTone, string> = {
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-500",
};

export function AdminPortalCard({
  title,
  description,
  icon: Icon,
  to,
  search,
  tone,
  locked = false,
  badgeCount,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  to?: string;
  search?: Record<string, string>;
  tone: AdminModuleTone;
  locked?: boolean;
  badgeCount?: number;
}) {
  const body = (
    <div
      className={cn(
        "relative flex h-full min-h-[188px] flex-col items-center justify-center rounded-xl bg-white px-5 py-8 text-center transition",
        locked
          ? "cursor-not-allowed border border-dashed border-slate-300 opacity-50"
          : "shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/80 hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      {badgeCount && badgeCount > 0 ? (
        <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
      <span className={cn("mb-4 grid size-12 place-items-center rounded-lg", TONE[tone])}>
        <Icon className="size-6" strokeWidth={1.75} />
      </span>
      <h2 className="font-sans text-[15px] font-semibold tracking-tight text-slate-800">{title}</h2>
      <p className="mt-1.5 max-w-[16rem] text-[13px] leading-5 text-slate-500">
        {locked ? "Access required" : description}
      </p>
    </div>
  );

  if (locked || !to) {
    return (
      <div aria-disabled="true" className="h-full">
        {body}
      </div>
    );
  }

  return (
    <Link
      to={to}
      search={search}
      className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {body}
    </Link>
  );
}
