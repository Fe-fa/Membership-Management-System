import { formatKenyaDate, KENYA_LOCALE, KENYA_TIME_ZONE } from "@/utils/kenyaDate";

export function formatKes(value: number) {
  return new Intl.NumberFormat(KENYA_LOCALE, {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value?: string | null) {
  return formatKenyaDate(value);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatKenyaDate(value);
  return date.toLocaleString(KENYA_LOCALE, {
    timeZone: KENYA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatPercent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}
