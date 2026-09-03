import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

type PaymentRow = {
  transactionId: number;
  receiptNumber?: string | null;
  memberName?: string | null;
  method?: string | null;
  methodCode?: string | null;
  status?: string | null;
  amount: number;
  paymentDate?: string | null;
  mpesaCode?: string | null;
  chequeNo?: string | null;
  feeType?: string | null;
  chequeBankName?: string | null;
  chequeBankCode?: string | null;
  chequeDate?: string | null;
  chequeFileName?: string | null;
  chequeFileUrl?: string | null;
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

function methodKey(row: PaymentRow) {
  return `${row.methodCode ?? ""} ${row.method ?? ""}`.toUpperCase().replace(/[-\s]/g, "_");
}

function needsFinanceApproval(row: PaymentRow) {
  const key = methodKey(row);
  return key.includes("CHEQUE") || key.includes("CARD") || key.includes("CREDIT");
}

function isPendingStatus(status?: string | null) {
  const s = (status ?? "").toUpperCase().replace(/[-\s]/g, "_");
  return s === "PENDING" || s === "INITIATED" || s === "UNCLEARED";
}

function formatDay(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function FinancePage() {
  const year = new Date().getFullYear();
  const queryClient = useQueryClient();
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(DEFAULT_PAGE_SIZE);
  const pending = useQuery({
    queryKey: ["payments", "pending-approval"],
    queryFn: () =>
      apiRequest<PagedResult<PaymentRow>>(
        `/api/finance/payments?${pagedQuery({ page: 1, pageSize: 100 })}`,
      ),
  });
  const payments = useQuery({
    queryKey: ["payments", paymentPage, paymentPageSize],
    queryFn: () =>
      apiRequest<PagedResult<PaymentRow>>(
        `/api/finance/payments?${pagedQuery({ page: paymentPage, pageSize: paymentPageSize })}`,
      ),
  });
  const subs = useQuery({
    queryKey: ["subscriptions", year, subPage, subPageSize],
    queryFn: () =>
      apiRequest<PagedResult<SubRow>>(
        `/api/finance/subscriptions?${pagedQuery({ year, page: subPage, pageSize: subPageSize })}`,
      ),
  });

  const paymentPageData = payments.data ?? emptyPage<PaymentRow>(paymentPage, paymentPageSize);
  const subPageData = subs.data ?? emptyPage<SubRow>(subPage, subPageSize);

  const pendingApprovals = useMemo(
    () =>
      (pending.data?.items ?? []).filter(
        (row) => needsFinanceApproval(row) && isPendingStatus(row.status),
      ),
    [pending.data],
  );

  const approve = useMutation({
    mutationFn: (transactionId: number) =>
      apiRequest<PaymentRow>(`/api/finance/payments/${transactionId}/approve`, { method: "POST" }),
    onMutate: (transactionId) => setApprovingId(transactionId),
    onSuccess: async (row) => {
      toast.success(`${row.method ?? "Payment"} ${row.receiptNumber ?? ""} marked as paid.`);
      await Promise.all([
        payments.refetch(),
        pending.refetch(),
        subs.refetch(),
        queryClient.invalidateQueries({ queryKey: ["application-payments"] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
        queryClient.invalidateQueries({ queryKey: ["manager-readiness"] }),
      ]);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
    onSettled: () => setApprovingId(null),
  });

  async function runPosting() {
    try {
      const result = await apiRequest<{ updated: number }>(`/api/finance/posting/${year}`, { method: "POST" });
      toast.success(`Posting run updated ${result.updated} accounts.`);
      await Promise.all([payments.refetch(), pending.refetch(), subs.refetch()]);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  return (
    <PageFrame width="lg">
      <PageHeader
        title="Finance & subscriptions"
        description="Clear cheque and credit payments, then keep subscriptions, receipts and arrears in view."
        actions={<Button onClick={() => void runPosting()}>Run posting / removal</Button>}
      />

      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <h2 className="mb-1 text-lg font-semibold">Pending cheque &amp; credit payments</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Applicant cheque and card payments stay pending until finance verifies and approves them.
        </p>
        {pending.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading payments…</p>
        ) : pendingApprovals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cheque or credit payments waiting for approval.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Payer</th>
                  <th className="p-2">Method</th>
                  <th className="p-2">Item</th>
                  <th className="p-2">Receipt</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Copy</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingApprovals.map((row) => (
                  <tr key={row.transactionId} className="border-t border-border">
                    <td className="p-2">{formatDay(row.paymentDate)}</td>
                    <td className="p-2">{row.memberName || "Applicant"}</td>
                    <td className="p-2">{row.method || "—"}</td>
                    <td className="p-2">{row.feeType || "—"}</td>
                    <td className="p-2">{row.receiptNumber || "—"}</td>
                    <td className="p-2">{formatKes(row.amount)}</td>
                    <td className="p-2">
                      {row.chequeFileUrl ? (
                        <a
                          href={row.chequeFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium underline underline-offset-2"
                        >
                          {row.chequeFileName || "Open copy"}
                        </a>
                      ) : (
                        row.chequeNo || "—"
                      )}
                    </td>
                    <td className="p-2">
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                        {row.status ?? "Pending"}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(row.transactionId)}
                      >
                        {approvingId === row.transactionId ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Approve
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{year} subscriptions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-2">Member</th>
                <th className="p-2">Due</th>
                <th className="p-2">Paid</th>
                <th className="p-2">Arrears</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {subPageData.items.map((row) => (
                <tr key={row.subscriptionId} className="border-t border-border">
                  <td className="p-2">
                    {row.membershipNo} · {row.memberName}
                  </td>
                  <td className="p-2">{formatKes(row.amountDue)}</td>
                  <td className="p-2">{formatKes(row.amountPaid)}</td>
                  <td className="p-2">{formatKes(row.arrearsAmount)}</td>
                  <td className="p-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <ListPagination
            page={subPage}
            pageSize={subPageSize}
            totalCount={subPageData.totalCount}
            totalPages={subPageData.totalPages}
            onPageChange={setSubPage}
            onPageSizeChange={setSubPageSize}
          />
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">Receipts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-2">Receipt</th>
                <th className="p-2">Member</th>
                <th className="p-2">Method</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Status</th>
                <th className="p-2">Ref</th>
              </tr>
            </thead>
            <tbody>
              {paymentPageData.items.map((row) => (
                <tr key={row.transactionId} className="border-t border-border">
                  <td className="p-2">{row.receiptNumber}</td>
                  <td className="p-2">{row.memberName}</td>
                  <td className="p-2">{row.method}</td>
                  <td className="p-2">{formatKes(row.amount)}</td>
                  <td className={cn("p-2", isPendingStatus(row.status) ? "text-amber-800" : "")}>
                    {row.status || "—"}
                  </td>
                  <td className="p-2">
                    {row.chequeFileUrl ? (
                      <a
                        href={row.chequeFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {row.chequeFileName || row.chequeNo || "Copy"}
                      </a>
                    ) : (
                      row.mpesaCode || row.chequeNo || "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <ListPagination
            page={paymentPage}
            pageSize={paymentPageSize}
            totalCount={paymentPageData.totalCount}
            totalPages={paymentPageData.totalPages}
            onPageChange={setPaymentPage}
            onPageSizeChange={setPaymentPageSize}
          />
        </div>
      </section>
    </PageFrame>
  );
}
