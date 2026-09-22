import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useInvoiceSetup } from "@/services/finance/invoiceSetup";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";
import { printHtmlDocument } from "@/utils/financeExport";
import { mergePaymentSetup } from "@/utils/invoiceSetup";
import { buildReceiptHtml } from "@/utils/receiptDocument";
import { formatKes } from "@/utils/format";

export type NmReceipt = {
  kind: string;
  id: number;
  payerName: string;
  membershipNo?: string | null;
  description: string;
  amount: number;
  status: string;
  receiptNo?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  referenceCode?: string | null;
  createdAt: string;
};

export function NonMembershipReceiptDrawer({
  open,
  kind,
  id,
  onClose,
}: {
  open: boolean;
  kind: "accommodation" | "corkage" | "custom" | null;
  id: number | null;
  onClose: () => void;
}) {
  const tenant = useCurrentTenant();
  const brand = tenantDocumentBrand(tenant.data);
  const paymentSetup = useInvoiceSetup();
  const receipt = useQuery({
    queryKey: ["nm-receipt", kind, id],
    queryFn: () => apiRequest<NmReceipt>(`/api/finance/non-membership/receipt/${kind}/${id}`),
    enabled: open && kind != null && id != null,
  });

  const row = receipt.data;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Receipt</SheetTitle>
          <SheetDescription>Non-membership billing receipt details</SheetDescription>
        </SheetHeader>
        {receipt.isLoading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : receipt.isError ? (
          <p className="mt-6 text-sm text-destructive">{extractErrorMessage(receipt.error)}</p>
        ) : row ? (
          <div className="mt-6 space-y-3 text-sm">
            <Row label="Receipt no" value={row.receiptNo || "—"} />
            <Row label="Payer" value={row.payerName} />
            <Row label="Member no" value={row.membershipNo || "Guest"} />
            <Row label="Description" value={row.description} />
            <Row label="Amount" value={formatKes(row.amount)} />
            <Row label="Status" value={row.status} />
            <Row label="Method" value={row.paymentMethod || "—"} />
            <Row label="Reference" value={row.referenceCode || "—"} />
            <Row label="Paid at" value={row.paidAt ? new Date(row.paidAt).toLocaleString() : "—"} />
            <Button
              type="button"
              className="mt-4 w-full"
              onClick={() => {
                const html = buildReceiptHtml({
                  transactionId: row.id,
                  receiptId: row.id,
                  clubName: brand.clubName || "Aero Club of East Africa",
                  clubLogo: brand.clubLogo,
                  receiptNumber: row.receiptNo || `NM-${row.id}`,
                  issuedDate: row.paidAt || row.createdAt,
                  paymentDate: row.paidAt || row.createdAt,
                  payerName: row.payerName,
                  payerCategory: "Guest",
                  membershipNo: row.membershipNo,
                  feeType: row.description,
                  paymentMethod: row.paymentMethod || "Payment",
                  mpesaCode: row.referenceCode,
                  amount: row.amount,
                  amountInWords: "",
                  currency: "KES",
                  status: row.status,
                  purpose: row.description,
                  setup: mergePaymentSetup(paymentSetup.data),
                });
                if (!printHtmlDocument(html)) toast.error("Could not open print dialog.");
              }}
            >
              <Printer className="size-4" />
              Print receipt
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function useNmPay(kind: "accommodation" | "corkage" | "custom", onDone: () => void) {
  return useMutation({
    mutationFn: ({
      id,
      paymentMethod,
      referenceCode,
    }: {
      id: number;
      paymentMethod: string;
      referenceCode?: string;
    }) =>
      apiRequest(`/api/finance/non-membership/${kind}/${id}/pay`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod, referenceCode: referenceCode || null }),
      }),
    onSuccess: () => {
      toast.success("Payment recorded.");
      onDone();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });
}
