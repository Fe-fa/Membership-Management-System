import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

export type SettlementSeed = {
  accountId: number;
  subscriptionId?: number | null;
  year?: number;
};

type SettlementContext = {
  accountId: number;
  subscriptionId: number;
  memberName: string;
  membershipNo: string;
  accountStatus: string;
  accountStatusCode: string;
  membershipType?: string | null;
  year: number;
  amountDue: number;
  amountPaid: number;
  arrearsAmount: number;
  eligibleForSeniorDiscount: boolean;
  seniorDiscountReason?: string | null;
  suggestedAmountAfterSeniorDiscount: number;
  canIncludeReactivationFee: boolean;
  reactivationFeeAmount: number;
};

type SettlementMemberHit = {
  accountId: number;
  subscriptionId?: number | null;
  membershipNo: string;
  memberName: string;
  accountStatus: string;
  membershipType?: string | null;
  arrearsAmount: number;
  year: number;
};

type DirectSettlementResult = {
  accountId: number;
  membershipNo: string;
  memberName: string;
  accountStatus: string;
  reactivated: boolean;
  annualAmountApplied: number;
  seniorDiscountApplied: number;
  reactivationFeeCharged: number;
  remainingArrears: number;
  receiptNumber?: string | null;
  transactionId: number;
};

const METHOD_OPTIONS = [
  { value: "MPESA_STK", label: "M-Pesa Express (STK Push)" },
  { value: "MPESA", label: "M-Pesa Manual Reference" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Credit / Debit Card" },
] as const;

function needsReference(method: string) {
  return method !== "CASH";
}

type Props = {
  open: boolean;
  year: number;
  seed: SettlementSeed | null;
  /** When true, show member search (Quick Payment Settlement). */
  allowSearch: boolean;
  onClose: () => void;
  onSettled: () => void;
};

export function DirectSettlementModal({ open, year, seed, allowSearch, onClose, onSettled }: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(seed?.accountId ?? null);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<number | null>(
    seed?.subscriptionId ?? null,
  );
  const [amountPaid, setAmountPaid] = useState("");
  const [method, setMethod] = useState<string>("CASH");
  const [reference, setReference] = useState("");
  const [applySenior, setApplySenior] = useState(false);
  const [includeReactivation, setIncludeReactivation] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setSelectedAccountId(seed?.accountId ?? null);
    setSelectedSubscriptionId(seed?.subscriptionId ?? null);
    setSearch("");
    setDebouncedSearch("");
    setMethod("CASH");
    setReference("");
    setApplySenior(false);
    setIncludeReactivation(false);
    setAmountPaid("");
  }, [open, seed?.accountId, seed?.subscriptionId]);

  const hits = useQuery({
    queryKey: ["finance-settlement-search", debouncedSearch, year],
    queryFn: () =>
      apiRequest<SettlementMemberHit[]>(
        `/api/finance/settlement/members?search=${encodeURIComponent(debouncedSearch)}&year=${year}`,
      ),
    enabled: open && allowSearch && !seed?.accountId && debouncedSearch.length >= 2,
  });

  const context = useQuery({
    queryKey: ["finance-settlement-context", selectedAccountId, year, selectedSubscriptionId],
    queryFn: () =>
      apiRequest<SettlementContext>(
        `/api/finance/settlement/context/${selectedAccountId}?year=${year}${
          selectedSubscriptionId ? `&subscriptionId=${selectedSubscriptionId}` : ""
        }`,
      ),
    enabled: open && selectedAccountId != null,
  });

  useEffect(() => {
    if (!context.data) return;
    const base = applySenior
      ? context.data.suggestedAmountAfterSeniorDiscount
      : context.data.arrearsAmount;
    const withReactivation =
      includeReactivation && context.data.canIncludeReactivationFee
        ? base + context.data.reactivationFeeAmount
        : base;
    // Amount paid field is annual portion only; reactivation is charged separately on submit.
    setAmountPaid(String(base));
    void withReactivation;
  }, [context.data, applySenior, includeReactivation]);

  const suggestedAnnual = useMemo(() => {
    if (!context.data) return 0;
    return applySenior ? context.data.suggestedAmountAfterSeniorDiscount : context.data.arrearsAmount;
  }, [context.data, applySenior]);

  const settle = useMutation({
    mutationFn: () => {
      if (selectedAccountId == null) throw new Error("Select a member first.");
      const amount = Number(amountPaid);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount paid.");
      if (needsReference(method) && !reference.trim()) {
        throw new Error("Transaction / reference code is required for this payment method.");
      }
      return apiRequest<DirectSettlementResult>("/api/finance/settlement", {
        method: "POST",
        body: JSON.stringify({
          accountId: selectedAccountId,
          subscriptionId: selectedSubscriptionId ?? context.data?.subscriptionId,
          amountPaid: amount,
          paymentMethodCode: method,
          referenceCode: reference.trim() || null,
          applySeniorDiscount: applySenior,
          includeReactivationFee: includeReactivation,
        }),
      });
    },
    onSuccess: (result) => {
      const bits = [
        `Recorded ${formatKes(result.annualAmountApplied)}`,
        result.receiptNumber ? `receipt ${result.receiptNumber}` : null,
        result.reactivated ? "member reactivated" : null,
        result.remainingArrears > 0 ? `remaining ${formatKes(result.remainingArrears)}` : "arrears cleared",
      ].filter(Boolean);
      toast.success(bits.join(" · "));
      onSettled();
      onClose();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const ctx = context.data;
  const statusLabel = ctx?.accountStatusCode === "REMOVED"
    ? "Removed"
    : ctx?.accountStatusCode === "POSTED"
      ? "Posted"
      : ctx?.arrearsAmount && ctx.arrearsAmount > 0
        ? "In Arrears"
        : ctx?.accountStatus ?? "—";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !settle.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            Direct settlement
          </DialogTitle>
          <DialogDescription>
            Record payment against annual arrears
            {allowSearch && !seed?.accountId ? " — search for any member first." : "."}
          </DialogDescription>
        </DialogHeader>

        {allowSearch && !seed?.accountId ? (
          <div className="space-y-2">
            <Label htmlFor="settle-search">Find member</Label>
            <Input
              id="settle-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, membership no (AC-0008), or application id…"
              autoFocus
            />
            {hits.isFetching ? (
              <p className="text-xs text-muted-foreground">Searching…</p>
            ) : null}
            {debouncedSearch.length >= 2 && (hits.data?.length ?? 0) > 0 ? (
              <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
                {(hits.data ?? []).map((hit) => (
                  <li key={hit.accountId}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted",
                        selectedAccountId === hit.accountId && "bg-muted",
                      )}
                      onClick={() => {
                        setSelectedAccountId(hit.accountId);
                        setSelectedSubscriptionId(hit.subscriptionId ?? null);
                        setSearch(`${hit.membershipNo} · ${hit.memberName}`);
                      }}
                    >
                      <span className="font-medium">
                        {hit.membershipNo} · {hit.memberName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {hit.accountStatus}
                        {hit.membershipType ? ` · ${hit.membershipType}` : ""}
                        {hit.arrearsAmount > 0 ? ` · arrears ${formatKes(hit.arrearsAmount)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {selectedAccountId == null ? (
          <p className="text-sm text-muted-foreground">Select a member to continue.</p>
        ) : context.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading account…
          </div>
        ) : context.isError ? (
          <p className="text-sm text-destructive">{extractErrorMessage(context.error)}</p>
        ) : ctx ? (
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Member summary</p>
              <p className="mt-1 text-base font-semibold">{ctx.memberName}</p>
              <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Member number</dt>
                  <dd className="font-medium">{ctx.membershipNo || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Account status</dt>
                  <dd className="font-medium">{statusLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Year</dt>
                  <dd className="font-medium">{ctx.year}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Total arrears due</dt>
                  <dd className="font-medium text-amber-800">{formatKes(ctx.arrearsAmount)}</dd>
                </div>
              </dl>
            </section>

            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Amount paid (Ksh)</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">
                  Defaults to outstanding balance ({formatKes(suggestedAnnual)}). Edit for partial payment.
                </span>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Payment method</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">
                  Transaction / reference code
                  {needsReference(method) ? " *" : " (optional)"}
                </span>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="M-Pesa code, cheque no, or card ref…"
                />
              </label>

              <label
                className={cn(
                  "flex items-start gap-2 rounded-md border border-border p-3 text-sm",
                  !ctx.eligibleForSeniorDiscount && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={applySenior}
                  disabled={!ctx.eligibleForSeniorDiscount}
                  onChange={(e) => setApplySenior(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Apply senior member discount</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {ctx.eligibleForSeniorDiscount
                      ? ctx.seniorDiscountReason || "50% on annual subscription for eligible members."
                      : "Not eligible (requires age 55+ with 25+ years membership)."}
                  </span>
                </span>
              </label>

              <label
                className={cn(
                  "flex items-start gap-2 rounded-md border border-border p-3 text-sm",
                  !ctx.canIncludeReactivationFee && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={includeReactivation}
                  disabled={!ctx.canIncludeReactivationFee}
                  onChange={(e) => setIncludeReactivation(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Include re-activation fee</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {ctx.canIncludeReactivationFee
                      ? `Appends club entrance / re-application fee (${formatKes(ctx.reactivationFeeAmount)}) for Removed members.`
                      : "Only available when account status is Removed."}
                  </span>
                </span>
              </label>

              {includeReactivation && ctx.canIncludeReactivationFee ? (
                <p className="text-xs text-muted-foreground">
                  Total collected today: {formatKes(Number(amountPaid || 0) + ctx.reactivationFeeAmount)}{" "}
                  (annual {formatKes(Number(amountPaid || 0))} + reactivation{" "}
                  {formatKes(ctx.reactivationFeeAmount)}).
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={settle.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={settle.isPending || selectedAccountId == null || !ctx}
            onClick={() => {
              if (selectedAccountId == null) {
                toast.error("Select a member first.");
                return;
              }
              const amount = Number(amountPaid);
              if (!Number.isFinite(amount) || amount <= 0) {
                toast.error("Enter a valid amount paid.");
                return;
              }
              if (needsReference(method) && !reference.trim()) {
                toast.error("Transaction / reference code is required for this payment method.");
                return;
              }
              settle.mutate();
            }}
          >
            {settle.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Submit &amp; Clear Arrears
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
