import { Download, Loader2, Printer, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatKes } from "@/utils/format";

export type MembershipReceipt = {
  transactionId: number;
  receiptId: number;
  clubName: string;
  clubShortName?: string | null;
  clubAddress?: string | null;
  clubEmail?: string | null;
  clubPhone?: string | null;
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
};

function formatDisplayDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function openPrintWindow(receipt: MembershipReceipt) {
  const html = buildReceiptHtml(receipt);
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 350);
}

function downloadReceiptHtml(receipt: MembershipReceipt) {
  const blob = new Blob([buildReceiptHtml(receipt)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${receipt.receiptNumber || `receipt-${receipt.transactionId}`}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildReceiptHtml(r: MembershipReceipt) {
  const rows: Array<[string, string]> = [
    ["Received from", r.payerName],
    ["Category", r.payerCategory],
    ["Membership no.", r.membershipNo || "—"],
    ["Application no.", r.applicationNo || "—"],
    ["Membership class", r.membershipType || "—"],
    ["Fee / charge", r.feeType],
    ["Payment method", r.paymentMethod],
    ["Cheque no.", r.chequeNo || "—"],
    ["Drawer bank", r.chequeBankName || "—"],
    ["Bank code", r.chequeBankCode || "—"],
    ["M-Pesa / ref", r.mpesaCode || r.referenceNote || "—"],
    ["Payment date", formatDisplayDate(r.paymentDate)],
    ["Status", r.status],
  ];

  const detailRows = rows
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(r.receiptNumber)} — Official Receipt</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #142033; margin: 0; background: #f4f1ea; }
    .sheet { max-width: 760px; margin: 24px auto; background: #fff; border: 1px solid #c9c2b4; padding: 28px 32px; }
    .brand { text-align: center; border-bottom: 2px solid #1f3b5b; padding-bottom: 14px; margin-bottom: 18px; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: 0.02em; }
    .brand .sub { margin-top: 4px; font-size: 12px; color: #5b6472; }
    .title { text-align: center; margin: 12px 0 18px; font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    .meta { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #e5e1d8; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { width: 34%; color: #5b6472; font-weight: 600; }
    .amount { margin-top: 18px; border: 1px solid #1f3b5b; padding: 12px 14px; }
    .amount .fig { font-size: 20px; font-weight: 700; }
    .amount .words { margin-top: 6px; font-size: 13px; font-style: italic; }
    .purpose { margin-top: 16px; font-size: 13px; line-height: 1.45; }
    .foot { margin-top: 28px; display: flex; justify-content: space-between; gap: 24px; font-size: 12px; }
    .sign { min-width: 220px; border-top: 1px solid #142033; padding-top: 6px; margin-top: 40px; }
    .note { margin-top: 18px; font-size: 11px; color: #5b6472; }
    @media print {
      body { background: #fff; }
      .sheet { border: none; margin: 0; max-width: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand">
      <h1>${escapeHtml(r.clubName)}</h1>
      <div class="sub">
        ${escapeHtml([r.clubAddress, r.clubPhone, r.clubEmail].filter(Boolean).join(" · ") || "Official membership receipt")}
      </div>
    </div>
    <div class="title">Official Membership Receipt</div>
    <div class="meta">
      <div><strong>Receipt no:</strong> ${escapeHtml(r.receiptNumber)}</div>
      <div><strong>Issued:</strong> ${escapeHtml(formatDisplayDate(r.issuedDate))}</div>
    </div>
    <table>${detailRows}</table>
    <div class="amount">
      <div>Amount received</div>
      <div class="fig">${escapeHtml(formatKes(r.amount))}</div>
      <div class="words">${escapeHtml(r.amountInWords)}</div>
    </div>
    <p class="purpose">${escapeHtml(r.purpose)}</p>
    <div class="foot">
      <div class="sign">
        Issued by<br />
        <strong>${escapeHtml(r.issuedBy || "Finance desk")}</strong>
      </div>
      <div class="sign">
        Member / applicant acknowledgement
      </div>
    </div>
    <p class="note">This receipt confirms payment recorded in the club membership management system. Keep for your records. Transaction #${r.transactionId}.</p>
  </div>
</body>
</html>`;
}

export function MembershipReceiptDialog({
  transactionId,
  open,
  onClose,
}: {
  transactionId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const receipt = useQuery({
    queryKey: ["membership-receipt", transactionId],
    queryFn: () =>
      apiRequest<MembershipReceipt>(`/api/finance/payments/${transactionId}/receipt`),
    enabled: open && transactionId != null,
  });

  if (!open || transactionId == null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Membership receipt</h2>
            <p className="text-xs text-muted-foreground">View, print, or download the official receipt.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!receipt.data}
              onClick={() => receipt.data && openPrintWindow(receipt.data)}
            >
              <Printer className="size-4" />
              Print / PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!receipt.data}
              onClick={() => receipt.data && downloadReceiptHtml(receipt.data)}
            >
              <Download className="size-4" />
              Download
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto p-4">
          {receipt.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading receipt…
            </p>
          ) : receipt.isError ? (
            <p className="text-sm text-destructive">{extractErrorMessage(receipt.error)}</p>
          ) : receipt.data ? (
            <ReceiptPreview receipt={receipt.data} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReceiptPreview({ receipt: r }: { receipt: MembershipReceipt }) {
  return (
    <article className="rounded-lg border border-[#c9c2b4] bg-[#fffdf8] p-5 text-[#142033] shadow-sm">
      <header className="border-b-2 border-[#1f3b5b] pb-3 text-center">
        <h3 className="font-serif text-xl font-semibold tracking-wide">{r.clubName}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {[r.clubAddress, r.clubPhone, r.clubEmail].filter(Boolean).join(" · ") || "Official membership receipt"}
        </p>
      </header>

      <p className="mt-4 text-center text-sm font-semibold uppercase tracking-[0.12em]">
        Official Membership Receipt
      </p>

      <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
        <span>
          <span className="text-muted-foreground">Receipt no:</span>{" "}
          <strong>{r.receiptNumber}</strong>
        </span>
        <span>
          <span className="text-muted-foreground">Issued:</span> {formatDisplayDate(r.issuedDate)}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <Field label="Received from" value={r.payerName} />
        <Field label="Category" value={r.payerCategory} />
        <Field label="Membership no." value={r.membershipNo || "—"} />
        <Field label="Application no." value={r.applicationNo || "—"} />
        <Field label="Membership class" value={r.membershipType || "—"} />
        <Field label="Fee / charge" value={r.feeType} />
        <Field label="Payment method" value={r.paymentMethod} />
        <Field label="Cheque no." value={r.chequeNo || "—"} />
        <Field label="Drawer bank" value={r.chequeBankName || "—"} />
        <Field label="Bank code" value={r.chequeBankCode || "—"} />
        <Field label="M-Pesa / ref" value={r.mpesaCode || r.referenceNote || "—"} />
        <Field label="Payment date" value={formatDisplayDate(r.paymentDate)} />
      </dl>

      <div className="mt-4 rounded-md border border-[#1f3b5b] p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount received</p>
        <p className="mt-1 text-2xl font-semibold">{formatKes(r.amount)}</p>
        <p className="mt-1 text-sm italic text-muted-foreground">{r.amountInWords}</p>
      </div>

      <p className="mt-4 text-sm leading-relaxed">{r.purpose}</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="border-t border-[#142033] pt-2 text-xs">
          Issued by
          <p className="mt-1 text-sm font-medium">{r.issuedBy || "Finance desk"}</p>
        </div>
        <div className="border-t border-[#142033] pt-2 text-xs">
          Member / applicant acknowledgement
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Recorded in the club membership management system · Transaction #{r.transactionId}
      </p>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e5e1d8] bg-white/70 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
