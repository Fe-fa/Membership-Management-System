/** Official Aero Club of East Africa billing details from the Fortune invoice and receipt. */
export const ACEA_FINANCE = {
  clubName: "Aero Club of East Africa",
  address: "P.O. Box 40813 - 00100, Nairobi, Kenya. Wilson Airport, Langata Road",
  email: "info@aeroclubea.com",
  bookingsEmail: "bookings@aeroclubea.com",
  phone: "+254 111 053 220",
  phoneAlt: "+254 733 832 488",
  website: "www.aeroclubea.com",
  pin: "P000591170O",
  mpesaPaybill: "4103461",
  bankName: "I & M Bank Ltd",
  bankBranch: "Wilson Airport Branch",
  accountName: "Aero Club of East Africa",
  kesAccount: "01100399661210",
  usdAccount: "01100399661211",
  bankCode: "57",
  branchCode: "011",
  swift: "IMBLKENA",
} as const;

const STALE_PAYBILL = new Set(["", "123456", "111053220"]);
const STALE_BANK_NAME = new Set(["", "Kenya Commercial Bank (KCB)", "KCB"]);
const STALE_BANK_ACCOUNT = new Set(["", "111053220", "123456"]);

export function officialPaybill(value?: string | null) {
  const next = value?.trim() ?? "";
  return STALE_PAYBILL.has(next) ? ACEA_FINANCE.mpesaPaybill : next;
}

export function officialBankName(value?: string | null) {
  const next = value?.trim() ?? "";
  return STALE_BANK_NAME.has(next) ? ACEA_FINANCE.bankName : next;
}

export function officialKesAccount(value?: string | null) {
  const next = value?.trim() ?? "";
  return STALE_BANK_ACCOUNT.has(next) ? ACEA_FINANCE.kesAccount : next;
}

export function officialClubName(value?: string | null) {
  return value?.trim() || ACEA_FINANCE.clubName;
}

export function officialAddress(value?: string | null) {
  return value?.trim() || ACEA_FINANCE.address;
}

export function officialEmail(value?: string | null) {
  return value?.trim() || ACEA_FINANCE.email;
}

export function officialPhone(value?: string | null) {
  return value?.trim() || ACEA_FINANCE.phone;
}

export function escapeFinanceHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function kesAmount(value: number) {
  return new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function financeDateLong(value?: string | null) {
  const parsed = parseFinanceDate(value);
  if (!parsed) return "—";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function financeDateShort(value?: string | null) {
  const parsed = parseFinanceDate(value);
  if (!parsed) return "—";
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(parsed.getUTCFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function parseFinanceDate(value?: string | null) {
  if (!value) return null;
  const isoDay = value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  if (isoDay) {
    const [year, month, day] = isoDay.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
