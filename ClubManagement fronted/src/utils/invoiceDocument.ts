import { clubLogoUrl } from "./clubLogo";

export type InvoiceDocument = {
  invoiceId: number;
  invoiceNo: string;
  accountId: number;
  year: number;
  memberName: string;
  membershipNo?: string | null;
  membershipType?: string | null;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  issuedAt: string;
  status: string;
  emailSent: boolean;
  sentToEmail?: string | null;
  clubName?: string | null;
  clubLogo?: string | null;
  clubAddress?: string | null;
  clubEmail?: string | null;
  clubPhone?: string | null;
  mpesaPaybill?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
};

const FALLBACKS = {
  clubName: "Aero Club of East Africa",
  clubAddress: "P.O. Box 40813, 00100 Wilson Airport, Nairobi, Kenya",
  clubEmail: "info@aeroclubea.com",
  clubPhone: "+254 111 053 220",
  mpesaPaybill: "123456",
  bankName: "Kenya Commercial Bank (KCB)",
  bankAccount: "111053220",
} as const;

const INVOICE_CSS = `
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1f2554;
      background: #fff;
      font-family: "Segoe UI", Tahoma, sans-serif;
    }
    .invoice-page { page-break-after: always; }
    .invoice-page:last-child { page-break-after: auto; }
    .sheet { max-width: 760px; margin: 0 auto; padding: 0 8px 24px; }
    .rule { height: 8px; background: #c9a46c; }
    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 20px 8px 18px;
    }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .brand .logo { display: block; height: 56px; width: auto; margin: 0 auto; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; color: #1f2554; }
    .contact { margin: 6px 0 0; color: #5b6472; font-size: 13px; line-height: 1.45; }
    .badge {
      display: inline-block;
      margin-bottom: 8px;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .badge.unpaid { background: #f4ead8; color: #1f2554; }
    .badge.partial { background: #e8e6f4; color: #1f2554; }
    .badge.paid { background: #dcfce7; color: #166534; }
    .inv-no { margin: 8px 0 0; color: #6b7280; font-size: 15px; letter-spacing: 0.04em; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 32px; padding: 8px 8px 20px; }
    .meta-col { padding-left: 0; }
    .meta-col + .meta-col { border-left: 1px solid #e4d7bf; padding-left: 32px; }
    .kicker { margin: 0 0 8px; color: #c9a46c; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }
    .who { margin: 0; font-size: 22px; font-weight: 700; }
    .sub { margin: 6px 0 0; color: #4b5563; font-size: 14px; }
    .dates { margin: 0; font-size: 14px; line-height: 1.7; }
    .total {
      margin: 4px 8px 22px;
      padding: 18px 22px;
      border: 1.5px solid #c9a46c;
      border-radius: 14px;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.01em;
      color: #1f2554;
    }
    table.lines { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }
    table.lines th, table.lines td { padding: 12px 16px; font-size: 14px; }
    table.lines th { background: #1f2554; color: #fff; text-align: left; font-weight: 700; }
    table.lines th.amt, table.lines td.amt { text-align: right; white-space: nowrap; }
    table.lines td { border-bottom: 1px solid #e5e7eb; }
    table.lines tr.stripe td { background: #f8f4ec; }
    table.lines tr.balance td { background: #1f2554; color: #fff; font-weight: 700; border: 0; }
    .note { padding: 18px 8px 0; color: #6b7280; font-size: 13px; font-style: italic; line-height: 1.5; }
`;

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blankToFallback(value: string | null | undefined, fallback: string) {
  return value && value.trim() ? value.trim() : fallback;
}

function money(value: number) {
  return new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function invoiceDate(value?: string | null) {
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

function invoiceStatusLabel(paid: number, balance: number) {
  if (balance <= 0.01) return "PAID";
  if (paid > 0.01) return "PARTIAL";
  return "UNPAID";
}

function invoiceSheetInnerHtml(invoice: InvoiceDocument) {
  const clubName = blankToFallback(invoice.clubName, FALLBACKS.clubName);
  const address = blankToFallback(invoice.clubAddress, FALLBACKS.clubAddress);
  const email = blankToFallback(invoice.clubEmail, FALLBACKS.clubEmail);
  const phone = blankToFallback(invoice.clubPhone, FALLBACKS.clubPhone);
  const membershipNo = invoice.membershipNo?.trim() || "—";
  const membershipType = invoice.membershipType?.trim() ?? "";
  const membershipLine = membershipType
    ? `${escapeHtml(membershipNo)} • ${escapeHtml(membershipType)}`
    : escapeHtml(membershipNo);
  const status = invoiceStatusLabel(invoice.amountPaid, invoice.balance);
  const statusClass = status.toLowerCase();
  const paybill = blankToFallback(invoice.mpesaPaybill, FALLBACKS.mpesaPaybill);
  const bankName = blankToFallback(invoice.bankName, FALLBACKS.bankName);
  const bankAccount = blankToFallback(invoice.bankAccount, FALLBACKS.bankAccount);

  return `<div class="rule"></div>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        <img class="logo" src="${escapeHtml(clubLogoUrl(invoice.clubLogo))}" alt="${escapeHtml(clubName)}" />
        <h1>${escapeHtml(clubName)}</h1>
      </div>
      <p class="contact">${escapeHtml(address)}<br />${escapeHtml(email)} | ${escapeHtml(phone)}</p>
    </div>
    <div class="meta">
      <div class="meta-col">
        <p class="kicker">BILLED TO</p>
        <p class="who">${escapeHtml(invoice.memberName)}</p>
        <p class="sub">Membership: ${membershipLine}</p>
      </div>
      <div class="meta-col">
        <p class="kicker">INVOICE DETAILS</p>
        <p class="dates">Date Issued: ${escapeHtml(invoiceDate(invoice.issuedAt))}<br />Due Date: ${escapeHtml(invoiceDate(invoice.dueDate))}</p>
        <p class="inv-no">${escapeHtml(invoice.invoiceNo)}</p>
      </div>
    </div>
    <table class="lines">
      <thead>
        <tr>
          <th>Description</th>
          <th class="amt">Amount (Ksh)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(invoice.year)} annual subscription</td>
          <td class="amt">${escapeHtml(money(invoice.amount))}</td>
        </tr>
        <tr class="stripe">
          <td>Paid to date</td>
          <td class="amt">${escapeHtml(money(invoice.amountPaid))}</td>
        </tr>
        <tr class="balance">
          <td>Balance due</td>
          <td class="amt">${escapeHtml(money(invoice.balance))}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

function wrapInvoiceDocument(title: string, body: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${INVOICE_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function buildInvoiceHtml(invoice: InvoiceDocument) {
  return wrapInvoiceDocument(invoice.invoiceNo, invoiceSheetInnerHtml(invoice));
}

export function buildInvoicePrintHtml(invoices: InvoiceDocument[]) {
  if (invoices.length === 0) return wrapInvoiceDocument("Invoices", "");
  if (invoices.length === 1) return buildInvoiceHtml(invoices[0]!);
  const sheets = invoices
    .map((invoice) => `<div class="invoice-page">${invoiceSheetInnerHtml(invoice)}</div>`)
    .join("\n");
  const title =
    invoices.length === 1
      ? invoices[0]!.invoiceNo
      : `${invoices.length} invoices`;
  return wrapInvoiceDocument(title, sheets);
}
