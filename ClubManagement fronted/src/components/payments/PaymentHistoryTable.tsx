import { useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { MembershipReceiptDialog } from "@/components/finance/MembershipReceipt";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

import type { PaymentHistoryRow } from "./types";
import { isPaidStatus, isReceiptViewable, isVoidablePayment, isVoidedStatus, paymentStatusTone } from "./types";

export function PaymentHistoryTable({
  rows,
  loading,
  showFilters = false,
  onVoid,
  voidingId,
}: {
  rows: PaymentHistoryRow[];
  loading?: boolean;
  showFilters?: boolean;
  onVoid?: (transactionId: number) => void;
  voidingId?: number | null;
}) {
  const [receiptTxId, setReceiptTxId] = useState<number | null>(null);
  const [voidTarget, setVoidTarget] = useState<PaymentHistoryRow | null>(null);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyFee, setHistoryFee] = useState("");
  const [historyMethod, setHistoryMethod] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((item) => {
      if (Number(item.amount) <= 0) return false;
      if (historyStatus === "settled" && !isPaidStatus(item.status)) return false;
      if (historyStatus === "pending" && (isPaidStatus(item.status) || isVoidedStatus(item.status, item.statusCode)))
        return false;
      if (historyStatus === "voided" && !isVoidedStatus(item.status, item.statusCode)) return false;
      if (historyFee) {
        const fee = `${item.feeType ?? ""}`.toUpperCase();
        if (historyFee === "JOINING" && !fee.includes("JOIN") && !fee.includes("ENTRANCE")) return false;
        if (historyFee === "ANNUAL" && !fee.includes("ANNUAL") && !fee.includes("SUBSCRIPTION")) return false;
        if (historyFee === "ACCOMMODATION" && !fee.includes("ACCOM") && !fee.includes("ROOM")) return false;
        if (
          historyFee === "OTHER" &&
          !fee.includes("CORK") &&
          !fee.includes("OTHER") &&
          !fee.includes("CUSTOM")
        ) {
          return false;
        }
      }
      if (historyMethod) {
        const method = `${item.method ?? ""}`.toUpperCase().replace(/[-\s]/g, "_");
        if (!method.includes(historyMethod)) return false;
      }
      return true;
    });
  }, [rows, historyStatus, historyFee, historyMethod]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading payments…</p>;
  }

  return (
    <div className="space-y-4">
      {showFilters ? (
        <div className="flex flex-wrap gap-3">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={historyStatus}
            onChange={(e) => setHistoryStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="settled">Settled</option>
            <option value="pending">Pending</option>
            <option value="voided">Voided / rejected</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={historyFee}
            onChange={(e) => setHistoryFee(e.target.value)}
          >
            <option value="">All fee types</option>
            <option value="JOINING">Joining / entrance</option>
            <option value="ANNUAL">Annual subscription</option>
            <option value="ACCOMMODATION">Accommodation</option>
            <option value="OTHER">Corkage / other</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={historyMethod}
            onChange={(e) => setHistoryMethod(e.target.value)}
          >
            <option value="">All methods</option>
            <option value="MPESA">M-Pesa</option>
            <option value="CARD">Card</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CLUB">Club card</option>
            <option value="BANK">Bank</option>
            <option value="CASH">Cash</option>
          </select>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <FileText className="mx-auto mb-3 size-8 text-muted-foreground/70" />
          <p className="text-sm font-medium">No transactions recorded</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Payments made toward your subscriptions and fees will appear here with downloadable receipts.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Receipt</th>
                <th className="px-3 py-3">Fee</th>
                <th className="px-3 py-3">Method</th>
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const voidable = Boolean(onVoid) && isVoidablePayment(row);
                return (
                  <tr key={row.transactionId} className="border-b border-border/70 last:border-0">
                    <td className="px-3 py-3">{row.paymentDate ?? "—"}</td>
                    <td className="px-3 py-3">{row.receiptNumber ?? "—"}</td>
                    <td className="px-3 py-3">{row.feeType ?? "—"}</td>
                    <td className="px-3 py-3">{row.method ?? "—"}</td>
                    <td className="px-3 py-3">
                      {row.mpesaCode || row.chequeNo || row.referenceNote || "—"}
                      {row.chequeFileUrl ? (
                        <>
                          {" · "}
                          <a
                            href={row.chequeFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium underline underline-offset-2"
                          >
                            {row.chequeFileName || "Cheque copy"}
                          </a>
                        </>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">{formatKes(row.amount)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          paymentStatusTone(row.status, row.statusCode) === "ok" && "bg-emerald-100 text-emerald-800",
                          paymentStatusTone(row.status, row.statusCode) === "partial" && "bg-sky-100 text-sky-900",
                          paymentStatusTone(row.status, row.statusCode) === "refunded" && "bg-violet-100 text-violet-900",
                          paymentStatusTone(row.status, row.statusCode) === "reversed" && "bg-slate-200 text-slate-800",
                          paymentStatusTone(row.status, row.statusCode) === "voided" && "bg-secondary text-muted-foreground",
                          paymentStatusTone(row.status, row.statusCode) === "pending" && "bg-amber-100 text-amber-900",
                        )}
                      >
                        {row.status ?? "Pending"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {row.receiptNumber && isReceiptViewable(row.status, row.statusCode) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setReceiptTxId(row.transactionId)}
                          >
                            View receipt
                          </Button>
                        ) : null}
                        {voidable ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={voidingId === row.transactionId}
                            onClick={() => setVoidTarget(row)}
                          >
                            {voidingId === row.transactionId ? "Voiding…" : "Void"}
                          </Button>
                        ) : null}
                        {!voidable && !(row.receiptNumber && isReceiptViewable(row.status, row.statusCode)) ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <MembershipReceiptDialog
        open={receiptTxId != null}
        transactionId={receiptTxId}
        onClose={() => setReceiptTxId(null)}
      />

      <AlertDialog open={voidTarget != null} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {voidTarget
                ? `This cancels the pending ${voidTarget.feeType ?? "payment"} of ${formatKes(voidTarget.amount)}. You can submit a new payment afterwards.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep payment</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (voidTarget && onVoid) onVoid(voidTarget.transactionId);
                setVoidTarget(null);
              }}
            >
              Void payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
