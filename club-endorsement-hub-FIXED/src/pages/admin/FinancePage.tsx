
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatKes } from "@/utils/format";

type PaymentRow = {
  transactionId: number;
  receiptNumber?: string | null;
  memberName?: string | null;
  method?: string | null;
  status?: string | null;
  amount: number;
  paymentDate?: string | null;
  mpesaCode?: string | null;
  chequeNo?: string | null;
};

type SubRow = {
  subscriptionId: number;
  membershipNo: string;
  memberName: string;
  year: number;
  amountDue: number;
  amountPaid: number;
  arrearsAmount: number;
  status: string;
};

export function FinancePage() {
  const year = new Date().getFullYear();
  const payments = useQuery({ queryKey: ["payments"], queryFn: () => apiRequest<PaymentRow[]>("/api/finance/payments") });
  const subs = useQuery({ queryKey: ["subscriptions", year], queryFn: () => apiRequest<SubRow[]>(`/api/finance/subscriptions?year=${year}`) });

  async function runPosting() {
    try {
      const result = await apiRequest<{ updated: number }>(`/api/finance/posting/${year}`, { method: "POST" });
      toast.success(`Posting run updated ${result.updated} accounts.`);
      await Promise.all([payments.refetch(), subs.refetch()]);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  return (
    <PageFrame width="lg">
      <PageHeader
        title="Finance & subscriptions"
        description="Annual subscriptions fall due 1 January. Unpaid accounts are posted after 28 February and removed after 30 April."
        actions={<Button onClick={() => void runPosting()}>Run posting / removal</Button>}
      />
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{year} subscriptions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="p-2">Member</th><th className="p-2">Due</th><th className="p-2">Paid</th><th className="p-2">Arrears</th><th className="p-2">Status</th></tr></thead>
            <tbody>
              {(subs.data ?? []).map((row) => (
                <tr key={row.subscriptionId} className="border-t border-border">
                  <td className="p-2">{row.membershipNo} Â· {row.memberName}</td>
                  <td className="p-2">{formatKes(row.amountDue)}</td>
                  <td className="p-2">{formatKes(row.amountPaid)}</td>
                  <td className="p-2">{formatKes(row.arrearsAmount)}</td>
                  <td className="p-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">Receipts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="p-2">Receipt</th><th className="p-2">Member</th><th className="p-2">Method</th><th className="p-2">Amount</th><th className="p-2">Ref</th></tr></thead>
            <tbody>
              {(payments.data ?? []).map((row) => (
                <tr key={row.transactionId} className="border-t border-border">
                  <td className="p-2">{row.receiptNumber}</td>
                  <td className="p-2">{row.memberName}</td>
                  <td className="p-2">{row.method}</td>
                  <td className="p-2">{formatKes(row.amount)}</td>
                  <td className="p-2">{row.mpesaCode || row.chequeNo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageFrame>
  );
}
