import { clubLogoUrl } from "./clubLogo";
import {
  ACEA_FINANCE,
  escapeFinanceHtml as escapeHtml,
  financeDateShort,
  kesAmount,
  officialAddress,
  officialClubName,
  officialEmail,
  officialPhone,
} from "./aceaFinanceBrand";
import { extraParametersForDocument, mergePaymentSetup, methodsForDocument, type PaymentSetup } from "./invoiceSetup";

export type ReceiptDocument = {
  transactionId: number;
  receiptId: number;
  clubName: string;
  clubShortName?: string | null;
  clubAddress?: string | null;
  clubEmail?: string | null;
  clubPhone?: string | null;
  clubLogo?: string | null;
  receiptNumber: string;
  issuedDate: string;
  paymentDate?: string | null;
  payerName: string;
  payerCategory: string;
  membershipNo?: string | null;
  applicationNo?: string | null;
  membershipType?: string | null;
  feeType: string;
  feeTypeCode?: string | null;
  paymentMethod: string;
  paymentMethodCode?: string | null;
  chequeNo?: string | null;
  chequeBankName?: string | null;
  chequeBankCode?: string | null;
  mpesaCode?: string | null;
  referenceNote?: string | null;
  amount: number;
  amountInWords: string;
  currency: string;
  status: string;
  issuedBy?: string | null;
  purpose: string;
  setup?: PaymentSetup | undefined;
};

export function receiptStamp(status?: string | null): "VOIDED" | "REFUNDED" | null {
  const s = (status ?? "").trim().toUpperCase().replace(/[-\s]/g, "_");
  if (s === "VOIDED" || s === "REVERSED") return "VOIDED";
  if (s === "REFUNDED") return "REFUNDED";
  return null;
}

function receiptYear(r: ReceiptDocument) {
  const source = r.paymentDate || r.issuedDate || "";
  const match = source.match(/^(\d{4})/);
  return match?.[1] || String(new Date().getFullYear());
}

function receiptDescription(r: ReceiptDocument) {
  const method = r.paymentMethod?.trim() || "Payment";
  const ref = r.mpesaCode?.trim() || r.chequeNo?.trim() || r.referenceNote?.trim() || "";
  return ["FO", method, r.payerName, ref].filter(Boolean).join(" ");
}

function receiptHeading(r: ReceiptDocument) {
  const year = receiptYear(r);
  const fee = r.feeType?.trim();
  if (fee) return `${year} ${fee}`;
  return `${year} Membership Subscriptions`;
}

const RECEIPT_CSS = `
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1f2554;
      background: #fff;
      font-family: "Segoe UI", Tahoma, sans-serif;
    }
    .sheet { position: relative; overflow: hidden; max-width: 760px; margin: 0 auto; padding: 0 10px 28px; }
    .rule { height: 8px; background: #c9a46c; }
    .watermark {
      position: absolute; inset: 22%; display: flex; align-items: center; justify-content: center;
      pointer-events: none; font-size: 82px; font-weight: 800; letter-spacing: 0.14em;
      opacity: 0.12; transform: rotate(-22deg);
    }
    .banner {
      text-align: center; font-weight: 700; letter-spacing: 0.16em; padding: 8px 12px; margin: 12px 8px 0;
      border: 2px solid currentColor; font-size: 13px;
    }
    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 18px 8px 8px;
    }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .brand .logo { display: block; height: 56px; width: auto; margin: 0 auto; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
    .contact { margin: 6px 0 0; color: #5b6472; font-size: 12px; line-height: 1.5; }
    .wordmark { margin: 12px 0 0; font-size: 26px; font-weight: 800; letter-spacing: 0.12em; }
    .doc-sub { margin: 6px 0 0; font-size: 14px; font-weight: 600; }
    .country { margin: 2px 0 0; color: #5b6472; font-size: 13px; }
    .facts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 24px;
      margin: 16px 8px 18px;
      font-size: 13px;
    }
    .facts span { color: #5b6472; }
    table.lines { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }
    table.lines th, table.lines td { padding: 10px 12px; font-size: 13px; }
    table.lines th { background: #1f2554; color: #fff; text-align: left; font-weight: 700; }
    table.lines th.amt, table.lines td.amt { text-align: right; white-space: nowrap; }
    table.lines td { border-bottom: 1px solid #e5e7eb; }
    .words { margin: 12px 8px 0; font-size: 13px; font-style: italic; color: #4b5563; }
    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin: 36px 8px 0;
      font-size: 13px;
    }
    .sign-line { margin-top: 36px; border-top: 1px solid #1f2554; padding-top: 6px; }
    .foot { margin: 22px 8px 0; padding-top: 12px; border-top: 1px solid #e4d7bf; color: #5b6472; font-size: 11px; line-height: 1.55; text-align: center; }
    @media print {
      body { background: #fff; }
    }
`;

export function buildReceiptHtml(r: ReceiptDocument) {
  const setup = mergePaymentSetup(r.setup);
  const stamp = receiptStamp(r.status);
  const stampColor = stamp === "VOIDED" ? "#991b1b" : "#6d28d9";
  const stampBg = stamp === "VOIDED" ? "#fef2f2" : "#f5f3ff";
  const clubName = officialClubName(r.clubName);
  const address = officialAddress(r.clubAddress);
  const email = officialEmail(r.clubEmail || ACEA_FINANCE.bookingsEmail);
  const phone = officialPhone(r.clubPhone);
  const phones = phone.includes(ACEA_FINANCE.phoneAlt) ? phone : `${phone} or ${ACEA_FINANCE.phoneAlt}`;
  const printDate = financeDateShort(r.issuedDate || r.paymentDate);
  const lineDate = financeDateShort(r.paymentDate || r.issuedDate);
  const currency = r.currency?.trim() || "KES";
  const pinLine = setup.receipt.showPin ? ` | PIN: ${escapeHtml(setup.pin)}` : "";
  const webLine = setup.receipt.showWebsite ? ` | Website: ${escapeHtml(setup.website)}` : "";
  const extraFacts = extraParametersForDocument(setup, "receipt")
    .map(
      (item) =>
        `<div><span>${escapeHtml(item.label || "Detail")}:</span> ${escapeHtml(item.value)}</div>`,
    )
    .join("");
  const methodBlocks = methodsForDocument(setup, "receipt");
  const methodHtml =
    methodBlocks.length === 0
      ? ""
      : `<div style="margin:16px 8px 0;display:grid;grid-template-columns:1fr 1fr;gap:16px;">${methodBlocks
          .map((method) => {
            const lines = method.fields
              .filter((item) => item.label.trim() || item.value.trim())
              .map((item) =>
                item.label.trim() && item.value.trim()
                  ? `${escapeHtml(item.label)}: ${escapeHtml(item.value)}`
                  : escapeHtml(item.value || item.label),
              )
              .join("<br />");
            return `<div><p style="margin:0 0 6px;color:#c9a46c;font-size:11px;font-weight:700;letter-spacing:0.08em;">${escapeHtml(method.title.toUpperCase())}</p><p style="margin:0;font-size:12px;line-height:1.6;">${lines}</p></div>`;
          })
          .join("")}</div>`;
  const words = setup.receipt.showAmountInWords
    ? `<p class="words">${escapeHtml(r.amountInWords)}</p>`
    : "";
  const signs = setup.receipt.showSignatures
    ? `<div class="signs">
      <div>
        Guest Signature
        <div class="sign-line">&nbsp;</div>
      </div>
      <div>
        Cashier
        <div class="sign-line">${escapeHtml(r.issuedBy || "Finance desk")}</div>
      </div>
    </div>`
    : "";
  const pinFoot = setup.receipt.showPin ? ` | PIN: ${escapeHtml(setup.pin)}` : "";
  const webFoot = setup.receipt.showWebsite ? ` | ${escapeHtml(setup.website)}` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(r.receiptNumber)} — Payment Receipt</title>
  <style>${RECEIPT_CSS}</style>
</head>
<body>
  <div class="rule"></div>
  <div class="sheet">
    ${
      stamp
        ? `<div class="watermark" style="color:${stampColor}">${stamp}</div>
    <div class="banner" style="color:${stampColor};background:${stampBg};border-color:${stampColor}">${stamp}</div>`
        : ""
    }
    <div class="header">
      <div class="brand">
        <img class="logo" src="${escapeHtml(clubLogoUrl(r.clubLogo))}" alt="${escapeHtml(clubName)}" />
        <h1>${escapeHtml(clubName)}</h1>
      </div>
      <p class="contact">${escapeHtml(address)}<br />Phone: ${escapeHtml(phones)} | Email: ${escapeHtml(email)}${webLine}${pinLine}</p>
      <p class="wordmark">PAYMENT RECEIPT</p>
      <p class="doc-sub">${escapeHtml(receiptHeading(r))}</p>
      <p class="country">Kenya</p>
    </div>
    <div class="facts">
      <div><span>Print Date:</span> ${escapeHtml(printDate)}</div>
      <div><span>Receipt No.:</span> ${escapeHtml(r.receiptNumber)}</div>
      <div><span>Membership No.:</span> ${escapeHtml(r.membershipNo || "—")}</div>
      <div><span>Ref. No.:</span> ${escapeHtml(r.mpesaCode || r.applicationNo || String(r.transactionId))}</div>
      ${extraFacts}
    </div>
    <table class="lines">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th class="amt">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(lineDate)}</td>
          <td>${escapeHtml(receiptDescription(r))}</td>
          <td class="amt">${escapeHtml(kesAmount(r.amount))} ${escapeHtml(currency)}</td>
        </tr>
      </tbody>
    </table>
    ${words}
    ${methodHtml}
    ${signs}
    <p class="foot">
      ${escapeHtml(clubName)} | ${escapeHtml(address)}<br />
      Phone: ${escapeHtml(phones)} | ${escapeHtml(email)}${webFoot}${pinFoot}
    </p>
  </div>
</body>
</html>`;
}
