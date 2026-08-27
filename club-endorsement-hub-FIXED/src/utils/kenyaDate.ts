export const KENYA_TIME_ZONE = "Africa/Nairobi";
export const KENYA_LOCALE = "en-KE";

function kenyaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KENYA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}


export function kenyaTodayISO(date = new Date()) {
  const { year, month, day } = kenyaParts(date);
  return `${year}-${month}-${day}`;
}

export function kenyaYear(date = new Date()) {
  return Number(kenyaParts(date).year);
}

/** Display a stored ISO date (`yyyy-MM-dd` or datetime) as Kenya DD/MM/YYYY. */
export function formatKenyaDate(value?: string | null) {
  if (!value) return "—";
  const isoDay = value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  if (isoDay) {
    const [year, month, day] = isoDay.split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const { year, month, day } = kenyaParts(parsed);
  return `${day}/${month}/${year}`;
}
