import type React from "react";
import { AlertTriangle, CheckCircle2, Info, User } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

import type { MemberSubscription } from "./types";
import { liveFeeStatusLabel } from "./types";

export function SubscriptionStatusBanners({ sub }: { sub: MemberSubscription }) {
  const standing = sub.standing || "InGoodStanding";
  const upcomingOutstanding = Number(sub.upcomingOutstanding || 0);
  const upcomingYear = sub.upcomingYear ?? null;
  const duesClear = sub.balance <= 0;
  const posted =
    !duesClear
    && (standing === "Posted" || (sub.statusCode ?? "").toUpperCase() === "POSTED");
  const unpaidStanding =
    !duesClear
    && (standing === "Unpaid" || (sub.statusCode ?? "").toUpperCase() === "UNPAID");
  const unpaid = sub.balance > 0 && (sub.paysSubscription || sub.joiningOutstanding > 0);
  const settled = duesClear;
  const awaitingInvoice =
    (sub.annualPaymentStatus ?? "") === "NotBilled"
    || (sub.joiningPaymentStatus ?? "") === "NotBilled";
  const currentYearSettled = sub.outstanding <= 0 && sub.joiningOutstanding <= 0;

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

      {posted || (unpaid && sub.outstanding > 0 && !unpaidStanding) ? (
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
              ? `Your account was posted after the ${sub.postingDeadline} deadline. Settle arrears of ${formatKes(sub.outstanding)} to restore full privileges.`
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
            balance: {formatKes(sub.balance)}.
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

export function SubscriptionSummaryCards({
  sub,
}: {
  sub: MemberSubscription;
  onPay?: () => void;
}) {
  const { year, outstanding, annualStatus } = billingSnapshot(sub);
  const inactiveCodes = new Set(["INACTIVE", "REMOVED", "RESIGNED", "DECEASED", "SUSPENDED"]);
  const active =
    typeof sub.isActive === "boolean"
      ? sub.isActive
      : !inactiveCodes.has((sub.statusCode ?? "").toUpperCase());
  const joiningPaid = sub.joiningOutstanding <= 0.01 && (sub.joiningPaymentStatus ?? "") !== "NotBilled";
  const joiningAwaiting = (sub.joiningPaymentStatus ?? "") === "NotBilled";
  const annualStatusLabel = liveFeeStatusLabel(annualStatus);

  return (
    <section className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Account Status" extra={<User className="size-5 text-muted-foreground" />}>
          <div className="mt-4 flex items-center gap-2">
            {active ? (
              <CheckCircle2 className="size-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="size-5 text-amber-600" />
            )}
            <p className={cn("text-base font-semibold", active ? "text-emerald-700" : "text-amber-800")}>
              {active ? "Active" : "Inactive"}
            </p>
          </div>
        </SummaryCard>

        <SummaryCard title="Joining Fee">
          <div className="relative mt-3 min-h-[4.5rem]">
            {joiningPaid ? (
              <>
                <p className="text-2xl font-semibold tracking-tight">Paid</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">{formatKes(joiningAwaiting ? 0 : sub.joiningOutstanding)}</p>
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
          <p className="mt-3 text-2xl font-semibold tabular-nums">{formatKes(sub.balance)}</p>
        </SummaryCard>
      </div>
    </section>
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
