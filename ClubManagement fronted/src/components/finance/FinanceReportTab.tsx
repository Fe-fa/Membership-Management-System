import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { useInvoiceSetup } from "@/services/finance/invoiceSetup";
import { downloadExcelCsv, printHtmlReport, rowsToTableHtml, selectExportColumns } from "@/utils/financeExport";
import { mergePaymentSetup } from "@/utils/invoiceSetup";
import { formatKes } from "@/utils/format";

type FinanceReportRow = {
  transactionId: number;
  paymentDate: string;
  receiptNumber?: string | null;
  memberName: string;
  membershipNo?: string | null;
  feeType: string;
  method: string;
  reference?: string | null;
  amount: number;
  status: string;
};

type SummaryMetrics = {
  totalRevenue: number;
  totalTransactions: number;
  averageTransaction: number;
  byFeeType: Record<string, number>;
  byMethod: Record<string, number>;
};

const REPORT_COLUMNS = [
  { id: "date", header: "Date", value: (r: FinanceReportRow) => r.paymentDate?.slice(0, 10) || "—" },
  { id: "receipt", header: "Receipt No", value: (r: FinanceReportRow) => r.receiptNumber || "—" },
  { id: "name", header: "Member / Payer", value: (r: FinanceReportRow) => r.memberName || "—" },
  { id: "membershipNo", header: "Membership no.", value: (r: FinanceReportRow) => r.membershipNo || "—" },
  { id: "fee", header: "Fee Type", value: (r: FinanceReportRow) => r.feeType || "—" },
  { id: "method", header: "Payment Method", value: (r: FinanceReportRow) => r.method || "—" },
  { id: "reference", header: "Reference", value: (r: FinanceReportRow) => r.reference || "—" },
  { id: "amount", header: "Amount (KES)", value: (r: FinanceReportRow) => r.amount },
  { id: "status", header: "Status", value: (r: FinanceReportRow) => r.status || "—" },
];

export function FinanceReportTab({ year }: { year: number }) {
  const paymentSetup = useInvoiceSetup();
  const columns = selectExportColumns(REPORT_COLUMNS, mergePaymentSetup(paymentSetup.data).reportColumns);
  const [fromDate, setFromDate] = useState(`${year}-01-01`);
  const [toDate, setToDate] = useState(`${year}-12-31`);
  const [feeType, setFeeType] = useState<string>("ALL");
  const [method, setMethod] = useState<string>("ALL");

  const queryKey = ["finance-report", year, fromDate, toDate, feeType, method];

  const reportQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        fromDate,
        toDate,
        year: String(year),
        ...(feeType !== "ALL" && { feeType }),
        ...(method !== "ALL" && { method }),
      });
      return apiRequest<FinanceReportRow[]>(`/api/finance/reports/transactions?${params.toString()}`);
    },
  });

  const rows = reportQuery.data ?? [];

  const metrics: SummaryMetrics = useMemo(() => {
    const totalRevenue = rows.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const totalTransactions = rows.length;
    const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const byFeeType: Record<string, number> = {};
    const byMethod: Record<string, number> = {};

    for (const row of rows) {
      const ft = row.feeType || "Other";
      const mt = row.method || "Unspecified";
      byFeeType[ft] = (byFeeType[ft] || 0) + row.amount;
      byMethod[mt] = (byMethod[mt] || 0) + row.amount;
    }

    return { totalRevenue, totalTransactions, averageTransaction, byFeeType, byMethod };
  }, [rows]);

  const handleExportCsv = () => {
    if (!rows.length) {
      toast.error("No data available to export.");
      return;
    }
    downloadExcelCsv(`finance_report_${fromDate}_to_${toDate}.csv`, columns, rows);
    toast.success("Financial report downloaded.");
  };

  const handlePrint = () => {
    if (!rows.length) {
      toast.error("No data available to print.");
      return;
    }
    const htmlTable = rowsToTableHtml(columns, rows);
    const title = `Financial Revenue Report (${fromDate} to ${toDate})`;
    printHtmlReport(title, htmlTable);
  };

  return (
    <div className="space-y-6">
      {/* Controls Header */}
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">From Date</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">To Date</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Fee Type</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={feeType}
            onChange={(e) => setFeeType(e.target.value)}
          >
            <option value="ALL">All Fee Types</option>
            <option value="JOINING">Joining Fee</option>
            <option value="ANNUAL">Annual Subscription</option>
            <option value="ACCOMMODATION">Accommodation</option>
            <option value="OTHER">Other Charges</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Payment Method</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="ALL">All Methods</option>
            <option value="MPESA">M-Pesa</option>
            <option value="CARD">Card</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" className="w-full" onClick={() => reportQuery.refetch()}>
            <RefreshCw className="mr-2 size-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Total Collections</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatKes(metrics.totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Total Transactions</p>
          <p className="mt-1 text-2xl font-bold">{metrics.totalTransactions}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Avg. Transaction Value</p>
          <p className="mt-1 text-2xl font-bold">{formatKes(metrics.averageTransaction)}</p>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={!rows.length}>
          <Printer className="mr-2 size-4" /> Print Report
        </Button>
        <Button size="sm" onClick={handleExportCsv} disabled={!rows.length}>
          <Download className="mr-2 size-4" /> Export CSV / Excel
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.id} className={column.id === "amount" ? "p-3 text-right" : "p-3"}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportQuery.isLoading ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="p-6 text-center text-muted-foreground">
                  Loading financial records...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="p-6 text-center text-muted-foreground">
                  No financial records found for the selected date range and criteria.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.transactionId} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={
                        column.id === "amount"
                          ? "p-3 text-right font-medium"
                          : column.id === "name"
                            ? "p-3 font-medium"
                            : column.id === "receipt"
                              ? "p-3 font-mono"
                              : "p-3"
                      }
                    >
                      {column.id === "amount" ? (
                        formatKes(row.amount)
                      ) : column.id === "status" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                          {row.status}
                        </span>
                      ) : (
                        column.value(row)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}