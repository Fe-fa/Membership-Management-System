import { clubLogoUrl } from "./clubLogo";

/** INVOICE = billed charge (Total only). PAYMENT = money into the club. REFUND = refund/reversal out. */
export type StatementLineKind = "INVOICE" | "PAYMENT" | "REFUND";

export type StatementLine = {
  date?: string | null;
  fee?: string | null;
  method?: string | null;
  receipt?: string | null;
  status?: string | null;
  amount: number;
  kind?: StatementLineKind | string | null;
  transactionId?: number | null;
};

export type StatementDocument = {
  accountId: number;
  memberName: string;
  membershipNo?: string | null;
  membershipType?: string | null;
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  clubName?: string | null;
  clubLogo?: string | null;
  lines?: StatementLine[] | null;
  issuedBy?: string | null;
  audience?: string | null;
  applicationId?: number | null;
  email?: string | null;
};

const FALLBACK_CLUB = "Aero Club of East Africa";

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number) {
  return new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function statementDate(value?: string | null) {
  if (!value) return "—";
  const isoDay = value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  if (isoDay) {
    const [year, month, day] = isoDay.split("-").map(Number);
    if (!year || !month || !day) return "—";
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statementPeriod(from?: string | null, to?: string | null) {
  return `${statementDate(from)} – ${statementDate(to)}`;
}

function issuedStamp() {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Kind is the only classifier. Never place an invoice in Money in or Money out. */
export function statementLineKind(line: Pick<StatementLine, "kind" | "amount">): StatementLineKind {
  const raw = (line.kind ?? "").trim().toUpperCase();
  if (raw === "PAYMENT" || raw === "INVOICE" || raw === "REFUND") return raw;
  // Legacy signed lines (no kind): positive = payment in, negative = invoice charge — never a refund.
  return (Number(line.amount) || 0) >= 0 ? "PAYMENT" : "INVOICE";
}

export function applyStatementLine(running: number, line: StatementLine) {
  const amount = Math.abs(Number(line.amount) || 0);
  const kind = statementLineKind(line);
  if (kind === "PAYMENT") {
    return { kind, moneyIn: amount, moneyOut: 0, next: running - amount };
  }
  if (kind === "REFUND") {
    return { kind, moneyIn: 0, moneyOut: amount, next: running + amount };
  }
  return { kind, moneyIn: 0, moneyOut: 0, next: running + amount };
}

function moneyOrZero(value: number) {
  return money(value || 0);
}

export function buildStatementHtml(doc: StatementDocument) {
  const clubName = doc.clubName?.trim() || FALLBACK_CLUB;
  const memberName = doc.memberName?.trim() || "Member";
  const membershipNo = doc.membershipNo?.trim() || "—";
  const membershipType = doc.membershipType?.trim() || "—";
  const issuedBy = doc.issuedBy?.trim() || "—";
  const isApplicant = (doc.audience ?? "").toUpperCase() === "APPLICANT";
  const lines = doc.lines ?? [];
  const title = `Statement ${doc.from ?? ""} to ${doc.to ?? ""}`.trim();
  const numberLabel = isApplicant ? "Application no." : "Membership no.";
  const subtitle = isApplicant
    ? "Applicant statement of invoices"
    : "Member statement of invoices";

  let running = doc.openingBalance ?? 0;
  const bodyRows: string[] = [
    `<tr class="open">
      <td>—</td>
      <td>Opening balance</td>
      <td class="amt">${escapeHtml(moneyOrZero(0))}</td>
      <td class="amt">${escapeHtml(moneyOrZero(0))}</td>
      <td class="amt">${escapeHtml(money(running))}</td>
    </tr>`,
  ];

  if (lines.length === 0) {
    bodyRows.push(`<tr><td colspan="5">No invoices, payments, or refunds in this period.</td></tr>`);
  } else {
    for (const line of lines) {
      const moved = applyStatementLine(running, line);
      running = moved.next;
      bodyRows.push(
        `<tr>
          <td>${escapeHtml(statementDate(line.date))}</td>
          <td>${escapeHtml(line.fee || "—")}</td>
          <td class="amt">${escapeHtml(moneyOrZero(moved.moneyIn))}</td>
          <td class="amt">${escapeHtml(moneyOrZero(moved.moneyOut))}</td>
          <td class="amt">${escapeHtml(money(running))}</td>
        </tr>`,
      );
    }
  }

  bodyRows.push(
    `<tr class="close">
      <td></td>
      <td>Closing balance</td>
      <td class="amt">${escapeHtml(moneyOrZero(0))}</td>
      <td class="amt">${escapeHtml(moneyOrZero(0))}</td>
      <td class="amt">${escapeHtml(money(doc.closingBalance ?? running))}</td>
    </tr>`,
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: "Segoe UI", Tahoma, sans-serif; color: #1f2554; margin: 28px; }
    .brand { text-align: center; margin-bottom: 22px; }
    .brand img { display: block; height: 72px; width: auto; margin: 0 auto 10px; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: 0.01em; color: #1f2554; }
    .brand .sub { margin: 4px 0 0; color: #5b6472; font-size: 13px; }
    .who { margin: 0 0 18px; font-size: 13px; line-height: 1.55; }
    .who .name { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
    .who .row { margin: 0; }
    .who .label { color: #5b6472; display: inline-block; min-width: 140px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th, td { border: 1px solid #e4d7bf; padding: 7px 8px; text-align: left; vertical-align: top; }
    thead th { background: #efe8d8; color: #1f2554; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
    thead th.summary { font-size: 11px; letter-spacing: 0.06em; }
    td.amt, th.amt { text-align: right; white-space: nowrap; }
    tr.open td, tr.close td { font-weight: 700; background: #f8fafc; }
    tbody tr:nth-child(even):not(.open):not(.close) td { background: #f3f4f6; }
    .issued { margin-top: 28px; font-size: 13px; line-height: 1.55; }
    .issued .label { color: #5b6472; display: inline-block; min-width: 88px; }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="brand">
    <img src="${escapeHtml(clubLogoUrl(doc.clubLogo))}" alt="${escapeHtml(clubName)}" />
    <h1>${escapeHtml(clubName)}</h1>
    <p class="sub">${escapeHtml(subtitle)}</p>
  </div>
  <div class="who">
    <p class="name">${escapeHtml(memberName)}</p>
    <p class="row"><span class="label">${escapeHtml(numberLabel)}</span>${escapeHtml(membershipNo)}</p>
    <p class="row"><span class="label">Membership type</span>${escapeHtml(membershipType)}</p>
    <p class="row"><span class="label">Period</span>${escapeHtml(statementPeriod(doc.from, doc.to))}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th colspan="2" class="summary">Detailed invoice summary</th>
        <th class="amt">Money in</th>
        <th class="amt">Money out</th>
        <th class="amt">Total</th>
      </tr>
      <tr>
        <th>Date</th>
        <th>Fee type</th>
        <th class="amt"></th>
        <th class="amt"></th>
        <th class="amt"></th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows.join("")}
    </tbody>
  </table>
  <div class="issued">
    <p><span class="label">Issued by</span>${escapeHtml(issuedBy)}</p>
    <p><span class="label">Printed</span>${escapeHtml(issuedStamp())}</p>
  </div>
</body>
</html>`;
}
