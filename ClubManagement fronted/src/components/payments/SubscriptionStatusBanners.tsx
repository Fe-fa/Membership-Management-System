import type React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Wallet } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/services/membership/api";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

import { memberAccountPosition, type MemberSubscription } from "./types";

export function SubscriptionStatusBanners({ sub }: { sub: MemberSubscription }) {
  const standing = sub.standing || "InGoodStanding";
  const position = memberAccountPosition(sub);
  const upcomingOutstanding = position.upcomingNet;
  const upcomingYear = sub.upcomingYear ?? null;
  const duesClear = position.balanceNet <= 0.009;
  const posted =
    !duesClear
    && (standing === "Posted" || (sub.statusCode ?? "").toUpperCase() === "POSTED");
  const unpaidStanding =
    !duesClear
    && (standing === "Unpaid" || (sub.statusCode ?? "").toUpperCase() === "UNPAID");
  const unpaid = position.balanceNet > 0.009 && (sub.paysSubscription || position.joiningNet > 0.009);
  const settled = duesClear;
  const awaitingInvoice =
    (sub.annualPaymentStatus ?? "") === "NotBilled"
    || (sub.joiningPaymentStatus ?? "") === "NotBilled";
  const currentYearSettled = position.subscriptionNet <= 0.009 && position.joiningNet <= 0.009;

  return (
    <div className="space-y-3">
      {upcomingYear && upcomingOutstanding > 0 ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertTriangle className="size-4 text-amber-700" />
          <AlertTitle>{upcomingYear} annual subscription is ready</AlertTitle>
          <AlertDescription>
            Finance generated {upcomingYear} dues after the renewal run. Amount due{" "}
            {formatKes(upcomingOutstanding)}. Use <strong>Make a payment</strong> → Annual to settle the
            new year (current year {sub.year} remains{" "}
            {currentYearSettled ? "settled" : "also outstanding"}).
          </AlertDescription>
        </Alert>
      ) : null}

      {posted || (unpaid && position.subscriptionNet > 0.009 && !unpaidStanding) ? (
        <Alert
          className={cn(
            "border-amber-300 bg-amber-50 text-amber-950",
            posted && "border-orange-400 bg-orange-50",
          )}
        >
          <AlertTriangle className="size-4 text-amber-700" />
          <AlertTitle>
            {posted ? "Posted for unpaid subscription" : "Annual subscription unpaid"}
          </AlertTitle>
          <AlertDescription>
            {posted
              ? `Your account was posted after the ${sub.postingDeadline} deadline. Settle arrears of ${formatKes(position.subscriptionNet)} to restore full privileges.`
              : `Annual dues are due by ${sub.dueDate}. Unpaid members are posted after ${sub.postingDeadline}. After ${sub.removalDeadline} membership stays active with payment status unpaid.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {unpaidStanding ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertTriangle className="size-4 text-amber-700" />
          <AlertTitle>Annual subscription unpaid</AlertTitle>
          <AlertDescription>
            No payment has been received for this year. Membership remains active. Outstanding
            balance: {formatKes(position.balanceNet)}.
          </AlertDescription>
        </Alert>
      ) : null}

      {sub.isLifeExempt ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <Info className="size-4 text-emerald-700" />
          <AlertTitle>Life / Senior Life — annual subscription exempt</AlertTitle>
          <AlertDescription>
            Your class pays Ksh 0 annual subscription. You can still settle joining balances or
            advance room / corkage charges below.
          </AlertDescription>
        </Alert>
      ) : null}

      {sub.halfYearProrated && sub.paysSubscription ? (
        <Alert className="border-violet-200 bg-violet-50 text-violet-950">
          <Info className="size-4 text-violet-700" />
          <AlertTitle>Mid-year joining rate (50%)</AlertTitle>
          <AlertDescription>
            Joined after 30 June — first-year subscription is charged at half the{" "}
            {sub.membershipTypeName ?? "tier"} annual rate
            {sub.discountPercent > 0 ? ` (after ${sub.discountPercent}% senior reduction)` : ""}.
          </AlertDescription>
        </Alert>
      ) : null}

      {settled && !sub.isLifeExempt && !awaitingInvoice && (sub.joiningPaymentStatus ?? "") !== "NotBilled" ? (
        <Alert className="border-emerald-200 bg-emerald-50/80 text-emerald-950">
          <CheckCircle2 className="size-4 text-emerald-700" />
          <AlertTitle>Nothing outstanding</AlertTitle>
          <AlertDescription>
            Your joining fee and current-year subscription are settled.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function billingSnapshot(sub: MemberSubscription) {
  const upcomingOutstanding = Number(sub.upcomingOutstanding || 0);
  const showUpcoming = Boolean(sub.upcomingYear && upcomingOutstanding > 0 && sub.outstanding <= 0);
  const year = showUpcoming ? Number(sub.upcomingYear) : sub.year;
  const outstanding = showUpcoming ? upcomingOutstanding : sub.outstanding;
  const annualStatus = showUpcoming ? sub.upcomingPaymentStatus : sub.annualPaymentStatus;
  return { year, outstanding, annualStatus, showUpcoming };
}

type CreditPosition = {
  memberName: string;
  membershipNo?: string | null;
  availableCredit: number;
  corporateCredit: number;
  status: string;
  creditCreated: number;
  creditUsed: number;
  originalPayment: number;
  allocated: number;
  sourceReceipt?: string | null;
  paymentDate?: string | null;
  paidBy?: string | null;
  history: Array<{
    date?: string | null;
    reference?: string | null;
    description: string;
    creditCreated: number;
    creditUsed: number;
    remaining: number;
    owner: string;
  }>;
};

function creditDate(value?: string | null) {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SubscriptionSummaryCards({
  sub,
}: {
  sub: MemberSubscription;
  onPay?: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const snapshot = billingSnapshot(sub);
  const position = memberAccountPosition(sub);
  const outstanding = snapshot.showUpcoming ? position.upcomingNet : position.subscriptionNet;
  const joiningPaid = position.joiningNet <= 0.01 && (sub.joiningPaymentStatus ?? "") !== "NotBilled";
  const joiningAwaiting = (sub.joiningPaymentStatus ?? "") === "NotBilled";
  const availableCredit = position.creditRemaining;
  const creditStatus = availableCredit > 0.009 ? "AVAILABLE" : "No available credit";

  return (
    <section className="space-y-3">
      {/* <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Advance credit</p>
            <p className="mt-2 text-sm text-muted-foreground">{sub.membershipNo || "Member account"}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setDetailsOpen(true)}>
            View credit details
          </Button>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Outstanding balance</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatKes(dues)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Advance credit</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {availableCredit > 0.009 ? `${formatKes(availableCredit)} CR` : formatKes(0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Available credit</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatKes(availableCredit)}</dd>
            <dd className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{creditStatus}</dd>
          </div>
        </dl>
        {availableCredit <= 0.009 ? (
          <p className="mt-3 text-sm text-muted-foreground">No advance credit available.</p>
        ) : null}
      </div> */}
      <AdvanceCreditDialog open={detailsOpen} onOpenChange={setDetailsOpen} fallbackName={sub.membershipNo || "Member"} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Available Credit/Advance" extra={<Wallet className="size-5 text-muted-foreground" />}>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{formatKes(availableCredit)}</p>
        </SummaryCard>

        <SummaryCard title="Joining Fee">
          <div className="relative mt-3 min-h-[4.5rem]">
            {joiningPaid ? (
              <>
                <p className="text-2xl font-semibold tracking-tight">Paid</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">{formatKes(joiningAwaiting ? 0 : position.joiningNet)}</p>
              </>
            )}
          </div>
        </SummaryCard>

 <SummaryCard title="Subscription Dues" accent={outstanding > 0 ? "warn" : undefined}>
  <p className="mt-3 text-2xl font-semibold tabular-nums">
    {formatKes(outstanding)}
  </p>
</SummaryCard>

        <SummaryCard title="Total Balances">
          <p className="mt-3 text-2xl font-semibold tabular-nums">{formatKes(position.balanceNet)}</p>
        </SummaryCard>
      </div>
    </section>
  );
}

function AdvanceCreditDialog({
  open,
  onOpenChange,
  fallbackName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackName: string;
}) {
  const credit = useQuery({
    queryKey: ["member-advance-credit"],
    enabled: open,
    queryFn: () => apiRequest<CreditPosition>("/api/members/me/advance-credit"),
  });
  const row = credit.data;
  const available = Number(row?.availableCredit || 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Advance credit details</DialogTitle>
        </DialogHeader>
        {credit.isLoading ? <p className="text-sm text-muted-foreground">Loading credit…</p> : null}
        {credit.isError ? <p className="text-sm text-destructive">Advance credit could not be loaded.</p> : null}
        {row ? (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Member</dt><dd className="font-medium">{row.memberName || fallbackName}</dd></div>
              <div><dt className="text-muted-foreground">Membership no.</dt><dd className="font-medium">{row.membershipNo || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Credit amount</dt><dd className="font-medium">{formatKes(available)}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium">{available > 0.009 ? row.status : "No available credit"}</dd></div>
              <div><dt className="text-muted-foreground">Source receipt</dt><dd className="font-medium">{row.sourceReceipt || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Payment date</dt><dd className="font-medium">{creditDate(row.paymentDate)}</dd></div>
              <div><dt className="text-muted-foreground">Original payment</dt><dd className="font-medium">{formatKes(row.originalPayment || 0)}</dd></div>
              <div><dt className="text-muted-foreground">Allocated</dt><dd className="font-medium">{formatKes(row.allocated || 0)}</dd></div>
              <div><dt className="text-muted-foreground">Available</dt><dd className="font-medium">{formatKes(available)}</dd></div>
              <div><dt className="text-muted-foreground">Paid by</dt><dd className="font-medium">{row.paidBy || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Corporate credit</dt><dd className="font-medium">{formatKes(row.corporateCredit || 0)}</dd></div>
            </dl>
            {row.corporateCredit > 0.009 ? (
              <p className="text-muted-foreground">Corporate credit is held separately and is not part of this member balance.</p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3 text-right">Credit created</th>
                    <th className="py-2 pr-3 text-right">Credit used</th>
                    <th className="py-2 text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {row.history.length === 0 ? (
                    <tr><td colSpan={6} className="py-3 text-muted-foreground">No advance credit activity.</td></tr>
                  ) : row.history.map((item, index) => (
                    <tr key={`${item.reference}-${index}`} className="border-t">
                      <td className="py-2 pr-3">{creditDate(item.date)}</td>
                      <td className="py-2 pr-3">{item.reference || "—"}</td>
                      <td className="py-2 pr-3">{item.owner === "CORPORATE" ? `Corporate · ${item.description}` : item.description}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{item.creditCreated > 0 ? formatKes(item.creditCreated) : "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{item.creditUsed > 0 ? formatKes(item.creditUsed) : "—"}</td>
                      <td className="py-2 text-right tabular-nums">{formatKes(item.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  title,
  extra,
  children,
  accent,
}: {
  title: string;
  extra?: React.ReactNode;
  children?: React.ReactNode;
  accent?: "warn" | "ok" | undefined;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm",
        accent === "warn" && "border-amber-200 bg-amber-50/50",
        accent === "ok" && "border-emerald-200 bg-emerald-50/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        {extra}
      </div>
      {children}
    </div>
  );
}
