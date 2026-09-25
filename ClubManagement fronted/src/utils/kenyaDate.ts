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

/** Current Kenya calendar period as `YYYY/MM`. */
export function kenyaYearMonth(date = new Date()) {
  const { year, month } = kenyaParts(date);
  return `${year}/${month}`;
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

/** Display a stored ISO date as Kenya DD/MM/YY (two-digit year). */
export function formatKenyaDateShort(value?: string | null) {
  const full = formatKenyaDate(value);
  if (full === "—") return full;
  const parts = full.split("/");
  if (parts.length !== 3) return full;
  const [day, month, year] = parts;
  return `${day}/${month}/${year!.slice(-2)}`;
}

/** Next anniversary of an ISO date (`yyyy-MM-dd`), one year after appointment and every year after that. */
export function nextAnnualFrom(iso?: string | null, today = kenyaTodayISO()) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const stamp = (y: number) => {
    const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
    const d = Math.min(day, last);
    return `${y}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  let nextYear = year + 1;
  let next = stamp(nextYear);
  while (next <= today) {
    nextYear += 1;
    next = stamp(nextYear);
  }
  return next;
}
