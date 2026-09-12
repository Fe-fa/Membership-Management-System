import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

/** Full-viewport bootstrap spinner (auth hydrate / route gate). */
export function AppBootSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Reserves a steady content region while data loads so the page chrome
 * (title, tabs, filters) does not jump when rows arrive.
 */
export function PageLoadingPanel({
  label = "Loading…",
  className,
  minHeightClassName = "min-h-[22rem]",
}: {
  label?: string;
  className?: string;
  minHeightClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-12",
        minHeightClassName,
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Table-shaped placeholder that keeps width/height while rows load. */
export function TableLoadingSkeleton({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border", className)} aria-hidden>
      <div className="border-b bg-muted/40 px-3 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageDataGate({
  loading,
  error,
  label,
  children,
  minHeightClassName,
  className,
}: {
  loading: boolean;
  error?: string | null;
  label?: string;
  children: ReactNode;
  minHeightClassName?: string;
  className?: string;
}) {
  if (loading) {
    return (
      <PageLoadingPanel
        label={label}
        minHeightClassName={minHeightClassName}
        className={className}
      />
    );
  }
  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-10 text-sm text-destructive",
          minHeightClassName ?? "min-h-[22rem]",
          className,
        )}
      >
        {error}
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Steady page body while primary queries load. Keeps title/chrome above
 * if the caller renders them outside; use alone for full-page early returns.
 */
export function PageBodyLoading({
  label = "Loading…",
  minHeightClassName = "min-h-[28rem]",
}: {
  label?: string;
  minHeightClassName?: string;
}) {
  return <PageLoadingPanel label={label} minHeightClassName={minHeightClassName} />;
}
