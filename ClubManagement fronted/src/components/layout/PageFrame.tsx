import type { ReactNode } from "react";

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

export function PageBackLink(_props: {
  to: string;
  label: string;
  search?: Record<string, string | boolean | undefined>;
}) {
  return null;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl leading-tight sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
