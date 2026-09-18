import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { PaymentHistoryTable } from "./PaymentHistoryTable";
import { SubscriptionSummaryCards } from "./SubscriptionStatusBanners";
import type { MemberSubscription, PaymentHistoryRow } from "./types";

export const PAYMENT_PAGE_DESCRIPTION =
  "Review dues, pay joining or annual fees, and track receipts";

export function PaymentHistoryPanel({
  rows,
  loading,
  onVoid,
  voidingId,
}: {
  rows: PaymentHistoryRow[];
  loading?: boolean;
  onVoid?: (transactionId: number) => void;
  voidingId?: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
      </CardHeader>
      <CardContent>
        <PaymentHistoryTable
          rows={rows}
          loading={loading}
          showFilters
          {...(onVoid ? { onVoid } : {})}
          {...(voidingId != null ? { voidingId } : {})}
        />
      </CardContent>
    </Card>
  );
}

/** Shared member/applicant payment body: compact dues cards + payment history. */
export function PaymentDeskBody({
  sub,
  onPay,
  historyRows,
  historyLoading,
  onVoid,
  voidingId,
}: {
  sub?: MemberSubscription | null;
  onPay?: () => void;
  historyRows: PaymentHistoryRow[];
  historyLoading?: boolean;
  onVoid?: (transactionId: number) => void;
  voidingId?: number | null;
}) {
  return (
    <>
      {sub ? <SubscriptionSummaryCards sub={sub} {...(onPay ? { onPay } : {})} /> : null}
      <PaymentHistoryPanel
        rows={historyRows}
        loading={historyLoading}
        {...(onVoid ? { onVoid } : {})}
        {...(voidingId != null ? { voidingId } : {})}
      />
    </>
  );
}
