import { clubLogoUrl, embeddedClubLogoUrl } from "./clubLogo";
import {
  escapeFinanceHtml as escapeHtml,
  financeDateLong,
  kesAmount as money,
  officialAddress,
  officialClubName,
  officialEmail,
  officialPhone,
} from "./aceaFinanceBrand";
import { extraParametersForDocument, mergePaymentSetup, methodsForDocument, type PaymentMethodBlock, type PaymentSetup } from "./invoiceSetup";

export type InvoiceLine = {
  description: string;
  period?: string | null;
  charges: number;
  credits: number;
  total: number;
};

export type InvoiceDocument = {
  invoiceId: number;
  invoiceNo: string;
  accountId: number;
  year: number;
  memberName: string;
  membershipNo?: string | null | undefined;
  membershipType?: string | null | undefined;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  issuedAt: string;
  status: string;
  emailSent: boolean;
  sentToEmail?: string | null | undefined;
  clubName?: string | null | undefined;
  clubLogo?: string | null | undefined;
  clubAddress?: string | null | undefined;
  clubEmail?: string | null | undefined;
  clubPhone?: string | null | undefined;
  mpesaPaybill?: string | null | undefined;
  bankName?: string | null | undefined;
  bankAccount?: string | null | undefined;
  setup?: PaymentSetup | undefined;
  lines?: InvoiceLine[] | undefined;
};

/** Print-only extras. Visual styles live inline so Gmail, print, and dashboard share one layout. */
const INVOICE_CSS = `
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1f2554;
      background: #fff;
      font-family: "Segoe UI", Tahoma, sans-serif;
    }
    .invoice-page { page-break-after: always; }
    .invoice-page:last-child { page-break-after: auto; }
`;

function renderPaymentMethodsHtml(methods: PaymentMethodBlock[]) {
  if (methods.length === 0) return "";
  const rows: string[] = [];
  for (let i = 0; i < methods.length; i += 2) {
    const slice = methods.slice(i, i + 2);
    const cells = slice
      .map((method, index) => {
        const lines = method.fields
          .filter((item) => item.label.trim() || item.value.trim())
          .map((item) =>
            item.label.trim() && item.value.trim()
              ? `${escapeHtml(item.label)}: ${escapeHtml(item.value)}`
              : escapeHtml(item.value || item.label),
          )
          .join("<br />");
        const pad = slice.length === 2 && index === 0 ? "padding-right:12px;" : slice.length === 2 ? "padding-left:12px;" : "";
        return `<td width="${slice.length === 2 ? "50%" : "100%"}" valign="top" style="${pad}">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;color:#c9a46c;font-weight:700;">${escapeHtml(method.title.toUpperCase())}</p>
            <p style="margin:0;font-size:12px;line-height:1.65;color:#1f2554;">${lines}</p>
          </td>`;
      })
      .join("");
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<tr>
    <td style="padding:16px 18px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows.join("")}
      </table>
    </td>
  </tr>`;
}

function invoiceSheetInnerHtml(invoice: InvoiceDocument) {
  const setup = mergePaymentSetup(invoice.setup);
  const clubName = officialClubName(invoice.clubName);
  const address = officialAddress(invoice.clubAddress);
  const email = officialEmail(invoice.clubEmail);
  const phone = officialPhone(invoice.clubPhone);
  const membershipNo = invoice.membershipNo?.trim() || "—";
  const membershipType = invoice.membershipType?.trim() || "Membership";
  const category = /membership/i.test(membershipType) ? membershipType : `${membershipType} Membership`;
  const charges = invoice.amount;
  const credits = invoice.amountPaid;
  const lineTotal = Math.max(0, charges - credits);
  const fallbackLines = [
    {
      description: category,
      period: String(invoice.year),
      charges,
      credits,
      total: lineTotal,
    },
  ];
  const lines = invoice.lines && invoice.lines.length > 0 ? invoice.lines : fallbackLines;
  const logo = escapeHtml(clubLogoUrl(invoice.clubLogo));
  const pinLine = setup.invoice.showPin ? `<br />PIN: ${escapeHtml(setup.pin)}` : "";
  const dueLine = setup.invoice.showDueDate
    ? `<br />Due Date: ${escapeHtml(financeDateLong(invoice.dueDate))}`
    : "";
  const creditHeader = setup.invoice.showCredits
    ? `<th align="right" style="padding:10px 12px;background:#1f2554;color:#ffffff;font-size:12px;font-weight:700;white-space:nowrap;">Credits [KES]</th>`
    : "";
  const totalColspan = setup.invoice.showCredits ? 4 : 3;
  const extraNote = setup.extraNote
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.55;color:#1f2554;">${escapeHtml(setup.extraNote)}</p>`
    : "";
  const extraParams = extraParametersForDocument(setup, "invoice")
    .map(
      (item) =>
        `<p style="margin:8px 0 0;font-size:12px;line-height:1.55;color:#1f2554;"><strong>${escapeHtml(item.label || "Detail")}:</strong> ${escapeHtml(item.value)}</p>`,
    )
    .join("");
  const paySection = renderPaymentMethodsHtml(methodsForDocument(setup, "invoice"));
  const pinFooter = setup.invoice.showPin ? `PIN NO: ${escapeHtml(setup.pin)} &nbsp;|&nbsp; ` : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:760px;margin:0 auto;background:#ffffff;color:#1f2554;font-family:'Segoe UI',Tahoma,sans-serif;border-top:8px solid #c9a46c;">
  <tr>
    <td style="padding:18px 18px 12px;text-align:center;">
      <img src="${logo}" alt="${escapeHtml(clubName)}" height="56" style="display:block;margin:0 auto 8px;height:56px;width:auto;border:0;" />
      <h1 style="margin:0;font-size:22px;letter-spacing:-0.02em;color:#1f2554;">${escapeHtml(clubName)}</h1>
      <p style="margin:6px 0 0;color:#5b6472;font-size:12px;line-height:1.5;">
        ${escapeHtml(address)}<br />
        ${escapeHtml(email)} | ${escapeHtml(phone)}${pinLine}
      </p>
      <p style="margin:10px 0 0;font-size:28px;font-weight:800;letter-spacing:0.12em;color:#1f2554;">INVOICE</p>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 18px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="50%" valign="top" style="padding-right:16px;">
            <p style="margin:0 0 8px;color:#c9a46c;font-size:11px;font-weight:700;letter-spacing:0.08em;">BILLED TO</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#1f2554;">${escapeHtml(invoice.memberName)}</p>
            <p style="margin:6px 0 0;color:#4b5563;font-size:13px;line-height:1.5;">Membership No. ${escapeHtml(membershipNo)}<br />${escapeHtml(category)}</p>
          </td>
          <td width="50%" valign="top" style="padding-left:16px;border-left:1px solid #e4d7bf;">
            <p style="margin:0 0 8px;color:#c9a46c;font-size:11px;font-weight:700;letter-spacing:0.08em;">INVOICE DETAILS</p>
            <p style="margin:0;font-size:13px;line-height:1.7;color:#1f2554;">Date: ${escapeHtml(financeDateLong(invoice.issuedAt))}${dueLine}</p>
            <p style="margin:6px 0 0;color:#6b7280;font-size:14px;letter-spacing:0.03em;font-weight:700;">Invoice No: ${escapeHtml(invoice.invoiceNo)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;overflow:hidden;">
        <tr>
          <th align="left" style="padding:10px 12px;background:#1f2554;color:#ffffff;font-size:12px;font-weight:700;">Description</th>
          <th align="center" style="padding:10px 12px;background:#1f2554;color:#ffffff;font-size:12px;font-weight:700;white-space:nowrap;">Year</th>
          <th align="right" style="padding:10px 12px;background:#1f2554;color:#ffffff;font-size:12px;font-weight:700;white-space:nowrap;">Charges [KES]</th>
          ${creditHeader}
          <th align="right" style="padding:10px 12px;background:#1f2554;color:#ffffff;font-size:12px;font-weight:700;white-space:nowrap;">Total [KES]</th>
        </tr>
        ${lines
          .map((line) => {
            const lineCredit = setup.invoice.showCredits
              ? `<td align="right" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#1f2554;white-space:nowrap;">${escapeHtml(money(line.credits))}</td>`
              : "";
            return `<tr>
          <td style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#1f2554;">${escapeHtml(line.description)}</td>
          <td align="center" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#1f2554;white-space:nowrap;">${escapeHtml(line.period || String(invoice.year))}</td>
          <td align="right" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#1f2554;white-space:nowrap;">${escapeHtml(money(line.charges))}</td>
          ${lineCredit}
          <td align="right" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#1f2554;white-space:nowrap;">${escapeHtml(money(line.total))}</td>
        </tr>`;
          })
          .join("")}
        <tr>
          <td colspan="${totalColspan}" style="padding:10px 12px;background:#1f2554;color:#ffffff;font-size:12px;font-weight:700;">Total</td>
          <td align="right" style="padding:10px 12px;background:#1f2554;color:#ffffff;font-size:12px;font-weight:700;white-space:nowrap;">${escapeHtml(money(lines.reduce((sum, line) => sum + Number(line.total || 0), 0)))}</td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#1f2554;">${escapeHtml(setup.payableNote)}</p>
      ${extraNote}
      ${extraParams}
    </td>
  </tr>
      ${paySection}
  <tr>
    <td style="padding:22px 18px 28px;border-top:1px solid #e4d7bf;color:#5b6472;font-size:11px;line-height:1.55;text-align:center;">
      ${escapeHtml(address)}. Tel: ${escapeHtml(phone)} | ${escapeHtml(clubName)}, Wilson Airport.<br />
      ${pinFooter}${escapeHtml(setup.website)}
    </td>
  </tr>
</table>`;
}

function wrapInvoiceDocument(title: string, body: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${INVOICE_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function invoicePayNowUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/?next=${encodeURIComponent("/payment")}`;
}

function wrapInvoiceEmailHtml(invoiceSheetHtml: string, payUrl: string) {
  const url = payUrl.trim() || invoicePayNowUrl();
  if (!url) return wrapInvoiceDocument("Invoice", invoiceSheetHtml);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aero Club invoice</title>
  <style>${INVOICE_CSS}</style>
</head>
<body style="margin:0;padding:24px 16px;background:#f4f4f5;font-family:'Segoe UI',Tahoma,sans-serif;color:#1f2554;">
  <table data-acea-pay-now="1" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:760px;margin:0 auto 20px;">
    <tr>
      <td style="background:#ffffff;border:1px solid #e4d7bf;border-radius:10px;padding:20px 18px;text-align:center;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;">Your Aero Club invoice is below.</p>
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#1f2554;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.04em;padding:12px 28px;border-radius:8px;">Pay now</a>
        <p style="margin:12px 0 0;font-size:12px;color:#5b6472;line-height:1.5;">Sign in to confirm you are a member, then complete payment on your Payment page.</p>
      </td>
    </tr>
  </table>
  ${invoiceSheetHtml}
</body>
</html>`;
}

export function buildInvoiceHtml(invoice: InvoiceDocument) {
  return wrapInvoiceDocument(invoice.invoiceNo, invoiceSheetInnerHtml(invoice));
}

async function invoiceSheetWithEmbeddedLogo(invoice: InvoiceDocument) {
  return invoiceSheetInnerHtml({
    ...invoice,
    clubLogo: await embeddedClubLogoUrl(invoice.clubLogo),
  });
}

/** Official invoice only — no Pay now. Stored on the billing document and used for print. */
export async function buildInvoiceHtmlWithEmbeddedLogo(invoice: InvoiceDocument) {
  return wrapInvoiceDocument(invoice.invoiceNo, await invoiceSheetWithEmbeddedLogo(invoice));
}

/** Email chrome + Pay now sit above the invoice; the invoice sheet itself stays clean. */
export async function buildInvoiceHtmlForEmail(invoice: InvoiceDocument) {
  return wrapInvoiceEmailHtml(await invoiceSheetWithEmbeddedLogo(invoice), invoicePayNowUrl());
}

export function buildInvoicePrintHtml(invoices: InvoiceDocument[]) {
  if (invoices.length === 0) return wrapInvoiceDocument("Invoices", "");
  if (invoices.length === 1) return buildInvoiceHtml(invoices[0]!);
  const sheets = invoices
    .map((invoice) => `<div class="invoice-page">${invoiceSheetInnerHtml(invoice)}</div>`)
    .join("\n");
  const title = `${invoices.length} invoices`;
  return wrapInvoiceDocument(title, sheets);
}
