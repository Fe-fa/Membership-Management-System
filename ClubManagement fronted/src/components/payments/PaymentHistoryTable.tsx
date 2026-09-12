import { useMemo, useState } from "react";

import { MembershipReceiptDialog } from "@/components/finance/MembershipReceipt";
import { Button } from "@/components/ui/button";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

import type { PaymentHistoryRow } from "./types";
import { isPaidStatus } from "./types";

export function PaymentHistoryTable({
  rows,
  loading,
  showFilters = false,
}: {
  rows: PaymentHistoryRow[];
  loading?: boolean;
  showFilters?: boolean;
}) {
  const [receiptTxId, setReceiptTxId] = useState<number | null>(null);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyFee, setHistoryFee] = useState("");
  const [historyMethod, setHistoryMethod] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((item) => {
      if (historyStatus === "settled" && !isPaidStatus(item.status)) return false;
      if (historyStatus === "pending" && isPaidStatus(item.status)) return false;
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
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No payment has been recorded yet.
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
              {filtered.map((row) => (
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
                        isPaidStatus(row.status)
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-900",
                      )}
                    >
                      {row.status ?? "Pending"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {row.receiptNumber && isPaidStatus(row.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setReceiptTxId(row.transactionId)}
                      >
                        View receipt
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MembershipReceiptDialog
        open={receiptTxId != null}
        transactionId={receiptTxId}
        onClose={() => setReceiptTxId(null)}
      />
    </div>
  );
}
