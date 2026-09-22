import { Download, Loader2, Printer, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useInvoiceSetup } from "@/services/finance/invoiceSetup";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";
import { buildReceiptHtml, type ReceiptDocument } from "@/utils/receiptDocument";
import { mergePaymentSetup } from "@/utils/invoiceSetup";

export type MembershipReceipt = ReceiptDocument;

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

export function MembershipReceiptDialog({
  transactionId,
  open,
  onClose,
}: {
  transactionId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const tenant = useCurrentTenant();
  const brand = tenantDocumentBrand(tenant.data);
  const paymentSetup = useInvoiceSetup();
  const receipt = useQuery({
    queryKey: ["membership-receipt", transactionId],
    queryFn: () =>
      apiRequest<MembershipReceipt>(`/api/finance/payments/${transactionId}/receipt`),
    enabled: open && transactionId != null,
  });
  const preview = receipt.data
    ? {
        ...receipt.data,
        clubName: brand.clubName || receipt.data.clubName,
        clubLogo: brand.clubLogo,
        setup: mergePaymentSetup(receipt.data.setup ?? paymentSetup.data),
      }
    : null;

  if (!open || transactionId == null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Payment receipt</h2>
            <p className="text-xs text-muted-foreground">Official ACEA receipt — view, print, or download.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!preview}
              onClick={() => preview && openPrintWindow(preview)}
            >
              <Printer className="size-4" />
              Print / PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!preview}
              onClick={() => preview && downloadReceiptHtml(preview)}
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
          ) : preview ? (
            <div className="invoice-preview-frame overflow-hidden rounded-xl border border-border bg-white">
              <iframe
                title={`Receipt ${preview.receiptNumber}`}
                srcDoc={buildReceiptHtml(preview)}
                onLoad={(event) => {
                  const frame = event.currentTarget;
                  const doc = frame.contentDocument;
                  if (!doc?.documentElement) return;
                  const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 700);
                  frame.style.height = `${height + 16}px`;
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
