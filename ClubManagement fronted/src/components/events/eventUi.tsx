import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-primary/10 text-primary",
  ONGOING: "bg-accent/40 text-foreground",
  COMPLETED: "bg-secondary text-secondary-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
  PENDING: "bg-accent/40 text-foreground",
  APPROVED: "bg-primary/10 text-primary",
  REJECTED: "bg-destructive/10 text-destructive",
  PRESENT: "bg-primary/10 text-primary",
  ABSENT: "bg-destructive/10 text-destructive",
  REGISTERED: "bg-secondary text-secondary-foreground",
  PAID: "bg-primary/10 text-primary",
  UNPAID: "bg-accent/40 text-foreground",
  NOT_REQUIRED: "bg-muted text-muted-foreground",
};

export function StatusBadge({ value }: { value?: string | null }) {
  const key = (value ?? "").toUpperCase();
  const label = key ? key.charAt(0) + key.slice(1).toLowerCase() : "—";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[key] ?? "bg-muted text-muted-foreground")}>
      {label.replaceAll("_", " ")}
    </span>
  );
}

export function formatEventDate(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function formatEventTime(start?: string | null, end?: string | null) {
  if (!start) return "—";
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return "—";
  const startText = from.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (!end) return startText;
  const to = new Date(end);
  if (Number.isNaN(to.getTime())) return startText;
  return `${startText} – ${to.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export function formatMoney(fee?: number | null) {
  if (fee == null || fee <= 0) return "Free";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(fee);
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {detail ? <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{detail}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone: string;
}) {
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-3xl font-semibold tabular-nums", tone)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </article>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); onConfirm(); }}>
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function localDateTime(iso?: string | null) {
  if (!iso) return { date: "", time: "" };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export function combineLocal(date: string, time: string) {
  return new Date(`${date}T${time}`).toISOString();
}
