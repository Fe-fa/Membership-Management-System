import { Banknote, CalendarDays, Clock, MapPin } from "lucide-react";

import { tenantCountryName, tenantCurrencyCode, useCurrentTenant } from "@/services/tenant";
import { kenyaYear, kenyaYearMonth } from "@/utils/kenyaDate";
import { cn } from "@/utils/cn";

function FilterField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-white px-3 py-2">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="shrink-0 text-sm text-muted-foreground">{label}:</span>
      <span className="truncate text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function PaymentContextBar({
  year,
  className,
}: {
  year?: number | null;
  className?: string;
}) {
  const tenant = useCurrentTenant();
  const displayYear = year && year > 0 ? year : kenyaYear();
  const period = kenyaYearMonth();
  const country = tenantCountryName(tenant.data).toUpperCase();
  const currency = tenantCurrencyCode(tenant.data);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:gap-4",
        className,
      )}
      aria-label="Date and location"
    >
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <FilterField icon={CalendarDays} label="Year" value={String(displayYear)} />
        <FilterField icon={Clock} label="Period" value={period} />
        <FilterField icon={MapPin} label="Country" value={country} />
        <FilterField icon={Banknote} label="" value={currency} />
      </div>
    </div>
  );
}
