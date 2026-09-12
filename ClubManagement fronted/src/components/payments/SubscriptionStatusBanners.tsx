import type React from "react";
import { AlertTriangle, CheckCircle2, Info, Vote } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

import type { MemberSubscription } from "./types";
import { standingLabel } from "./types";

export function SubscriptionStatusBanners({ sub }: { sub: MemberSubscription }) {
  const standing = sub.standing || "InGoodStanding";
  const duesClear = sub.balance <= 0;
  const posted =
    !duesClear
    && (standing === "Posted" || (sub.statusCode ?? "").toUpperCase() === "POSTED");
  const atRisk =
    !duesClear
    && (standing === "AtRiskOfRemoval" || (sub.statusCode ?? "").toUpperCase() === "REMOVED");
  const unpaid = sub.balance > 0 && (sub.paysSubscription || sub.joiningOutstanding > 0);
  const settled = duesClear;

  return (
    <div className="space-y-3">
      {posted || (unpaid && sub.outstanding > 0 && !atRisk) ? (
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
              : `Annual dues are due by ${sub.dueDate}. Unpaid members are posted after ${sub.postingDeadline} and risk removal after ${sub.removalDeadline}.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {atRisk ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Membership at risk of removal</AlertTitle>
          <AlertDescription>
            Unpaid subscriptions after {sub.removalDeadline} lead to removal. Outstanding balance:{" "}
            {formatKes(sub.balance)}.
          </AlertDescription>
        </Alert>
      ) : null}

      {sub.votingBlockedByArrears || (sub.canVote && unpaid) ? (
        <Alert className="border-sky-200 bg-sky-50 text-sky-950">
          <Vote className="size-4 text-sky-700" />
          <AlertTitle>Voting rights require accounts fully paid up</AlertTitle>
          <AlertDescription>
            Under the Club bye-laws, you may vote at General Meetings only when joining fees and the
            current-year subscription are settled. Current standing: {standingLabel(standing)}.
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

      {settled && !sub.isLifeExempt ? (
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

export function SubscriptionSummaryCards({
  sub,
  onPay,
}: {
  sub: MemberSubscription;
  onPay?: () => void;
}) {
  const tierLabel = sub.membershipTypeName ?? sub.membershipTypeCode ?? "Member";
  const annualCaption = sub.isLifeExempt
    ? "Exempt · Ksh 0"
    : sub.halfYearProrated
      ? "Half-year (post–30 Jun) rate"
      : sub.discountPercent > 0
        ? `${sub.discountPercent}% senior reduction`
        : `${tierLabel} full annual rate`;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        title="Account status"
        description={`${sub.membershipNo ? `${sub.membershipNo} · ` : ""}${standingLabel(sub.standing)}`}
        accent={sub.balance > 0 ? "warn" : "ok"}
      >
        <p className="text-sm text-muted-foreground">{sub.detail}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {tierLabel}
          {sub.isSeniorMember ? " · Senior eligible" : ""}
          {sub.ageYears != null ? ` · Age ${sub.ageYears}` : ""}
          {sub.continuousMembershipYears != null
            ? ` · ${sub.continuousMembershipYears} yr membership`
            : ""}
        </p>
      </SummaryCard>

      <SummaryCard
        title="Joining fee"
        description={sub.entranceFeeWaived ? "Waived" : "One-time entrance fee"}
        {...(sub.joiningOutstanding > 0 ? { accent: "warn" as const } : {})}
      >
        <p className="text-sm">
          Due {formatKes(sub.joiningFeeDue)} · Paid {formatKes(sub.joiningPaid)} · Balance{" "}
          <strong>{formatKes(sub.joiningOutstanding)}</strong>
        </p>
      </SummaryCard>

      <SummaryCard
        title={`${sub.year} subscription`}
        description={annualCaption}
        {...(sub.outstanding > 0 ? { accent: "warn" as const } : {})}
      >
        {sub.paysSubscription ? (
          <>
            <p className="text-sm">
              Due {formatKes(sub.amountDue)} · Paid {formatKes(sub.amountPaid)} · Arrears{" "}
              <strong>{formatKes(sub.outstanding)}</strong>
            </p>
            {(sub.fullAnnualRate ?? 0) > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Tier list price {formatKes(sub.fullAnnualRate ?? 0)}
                {sub.halfYearProrated ? " · 50% mid-year" : ""}
                {sub.discountPercent > 0 ? ` · −${sub.discountPercent}% senior` : ""}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {sub.isLifeExempt
              ? "Life / Senior Life — annual fee is Ksh 0."
              : "This membership class does not pay an annual subscription."}
          </p>
        )}
      </SummaryCard>

      <SummaryCard title="Balances" description="Net dues · club card credit">
        <p className="text-2xl font-semibold">{formatKes(sub.balance)}</p>
        <p className="mt-2 text-sm">
          Club card credit{" "}
          <strong className="text-success">{formatKes(sub.clubCreditBalance ?? 0)}</strong>
        </p>
      </SummaryCard>
    </div>
  );
}

function SummaryCard({
  title,
  description,
  children,
  accent,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  accent?: "warn" | "ok" | undefined;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm",
        accent === "warn" && "border-amber-300 bg-amber-50/40",
        accent === "ok" && "border-emerald-200 bg-emerald-50/30",
      )}
    >
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
