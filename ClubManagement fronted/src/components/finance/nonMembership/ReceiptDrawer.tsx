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
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { printHtmlReport } from "@/utils/financeExport";
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
                const ok = printHtmlReport(
                  `Receipt ${row.receiptNo || row.id}`,
                  `<table><tbody>
                    <tr><th>Receipt</th><td>${row.receiptNo || "—"}</td></tr>
                    <tr><th>Payer</th><td>${row.payerName}</td></tr>
                    <tr><th>Description</th><td>${row.description}</td></tr>
                    <tr><th>Amount</th><td>${formatKes(row.amount)}</td></tr>
                    <tr><th>Method</th><td>${row.paymentMethod || "—"}</td></tr>
                    <tr><th>Reference</th><td>${row.referenceCode || "—"}</td></tr>
                  </tbody></table>`,
                );
                if (!ok) toast.error("Could not open print dialog.");
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
