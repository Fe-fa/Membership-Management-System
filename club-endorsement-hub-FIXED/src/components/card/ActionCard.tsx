import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils/cn";

export function ActionCard({
  icon,
  badge,
  title,
  description,
  progress,
  href,
  cta,
  featured = false,
  outline = true,
  disabled = false,
  lockedHint,
}: {
  icon: ReactNode;
  badge: string;
  title: string;
  description: string;
  progress?: { label: string; value: number };
  href: string;
  cta: string;
  featured?: boolean;
  outline?: boolean;
  disabled?: boolean;
  lockedHint?: string;
}) {
  return (
    <Card
      className={cn(
        "group flex h-full flex-col transition-all duration-300",
        disabled ? "opacity-60" : "hover:-translate-y-1",
        featured && !disabled
          ? "border-primary/25 shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/15"
          : "shadow-sm hover:shadow-md",
      )}
    >
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div
            className={cn(
              "flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary",
              featured &&
                !disabled &&
                "transition-colors group-hover:bg-primary group-hover:text-primary-foreground",
            )}
          >
            {icon}
          </div>
          <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            {disabled ? "Not available" : badge}
          </span>
        </div>
        <div>
          <CardTitle className="text-xl tracking-tight">{title}</CardTitle>
          <CardDescription className="mt-2 leading-6">
            {disabled ? lockedHint || description : description}
          </CardDescription>
        </div>
      </CardHeader>

      {progress && !disabled ? (
        <CardContent className="mt-auto space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{progress.label}</span>
            <span className="tabular-nums text-foreground">{Math.round(progress.value)}%</span>
          </div>
          <Progress value={progress.value} className="h-1.5" />
        </CardContent>
      ) : null}

      <CardFooter className={progress && !disabled ? undefined : "mt-auto"}>
        {disabled ? (
          <Button className="w-full" variant="outline" disabled>
            Restricted for this class
          </Button>
        ) : (
          <Button asChild className="w-full" variant={outline ? "outline" : "default"}>
            <Link to={href}>
              {cta} <ArrowRight className="size-4" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
