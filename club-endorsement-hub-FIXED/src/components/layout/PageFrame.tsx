import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/utils/cn";

const WIDTH = {
  sm: "max-w-3xl",
  md: "max-w-6xl",
  lg: "max-w-[1200px]",
} as const;

export function PageFrame({
  children,
  width = "md",
  className,
}: {
  children: ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-6", WIDTH[width], className)}>{children}</div>
  );
}

export function PageBackLink({
  to,
  label,
  search,
}: {
  to: string;
  label: string;
  search?: Record<string, string | boolean | undefined>;
}) {
  return (
    <Link
      to={to}
      search={(search ?? {}) as never}
      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl leading-tight sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
