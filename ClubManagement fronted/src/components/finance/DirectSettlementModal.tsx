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
  { value: "BANK_TRANSFER", label: "Bank transfer / EFT" },
  { value: "CARD", label: "Credit / Debit Card" },
] as const;

function isMpesa(method: string) {
  return method === "MPESA" || method === "MPESA_STK";
}

function needsReference(method: string) {
  return method !== "CASH";
}

function formatKesInput(value: number) {
  const cents = Math.round(value * 100) % 100;
  return `Ksh ${value.toLocaleString("en-KE", {
    minimumFractionDigits: cents === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseKesInput(raw: string): number | null {
  const cleaned = raw.replace(/ksh/gi, "").replace(/,/g, "").trim();
  if (!cleaned || cleaned === ".") return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function maskKesInput(raw: string) {
  const cleaned = raw.replace(/ksh/gi, "").replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [whole, fraction] = cleaned.split(".");
  const grouped = Number(whole || "0").toLocaleString("en-KE");
  return fraction === undefined ? `Ksh ${grouped}` : `Ksh ${grouped}.${fraction.slice(0, 2)}`;
}

function referenceError(method: string, reference: string) {
  const code = reference.trim();
  if (isMpesa(method)) {
    if (!/^[A-Za-z0-9]{10}$/.test(code)) {
      return "M-Pesa code must be 10 letters or numbers, for example SAB1234567.";
    }
    return null;
  }
  if (needsReference(method) && !code) return "Enter the cheque, EFT, or card reference.";
  return null;
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
    if (!isMpesa(method)) return;
    setReference((current) => current.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10));
  }, [method]);

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
    setAmountPaid(formatKesInput(base));
  }, [context.data, applySenior]);

  const suggestedAnnual = useMemo(() => {
    if (!context.data) return 0;
    return applySenior ? context.data.suggestedAmountAfterSeniorDiscount : context.data.arrearsAmount;
  }, [context.data, applySenior]);

  const settle = useMutation({
    mutationFn: () => {
      if (selectedAccountId == null) throw new Error("Select a member first.");
      const amount = parseKesInput(amountPaid);
      if (amount == null || amount <= 0) throw new Error("Enter an amount greater than zero.");
      if (amount > suggestedAnnual + 0.009) {
        throw new Error(`Amount paid cannot exceed arrears due (${formatKes(suggestedAnnual)}).`);
      }
      const refError = referenceError(method, reference);
      if (refError) throw new Error(refError);
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
  const paidAmount = parseKesInput(amountPaid);
  const amountError =
    !ctx || paidAmount == null
      ? null
      : paidAmount <= 0
        ? "Enter an amount greater than zero."
        : paidAmount > suggestedAnnual + 0.009
          ? `Cannot exceed arrears due (${formatKes(suggestedAnnual)}).`
          : null;
  const remaining =
    paidAmount != null && paidAmount > 0 && paidAmount < suggestedAnnual - 0.009
      ? suggestedAnnual - paidAmount
      : null;
  const refError = ctx && needsReference(method) ? referenceError(method, reference) : null;
  const canSubmit = Boolean(ctx) && selectedAccountId != null && paidAmount != null && !amountError && !refError;
  const statusLabel = ctx?.accountStatusCode === "REMOVED"
    ? "Removed"
    : ctx?.accountStatusCode === "POSTED"
      ? "Posted"
      : ctx?.arrearsAmount && ctx.arrearsAmount > 0
        ? "In Arrears"
        : ctx?.accountStatus ?? "—";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !settle.isPending && onClose()}>
      <DialogContent className="flex max-h-[min(34rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 px-5 pb-2 pr-12 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 text-primary" />
            Direct settlement
          </DialogTitle>
          <DialogDescription className="text-xs">
            Record payment against annual arrears
            {allowSearch && !seed?.accountId ? " — search for any member first." : "."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-2">
        {allowSearch && !seed?.accountId ? (
          <div className="space-y-1.5">
            <Label htmlFor="settle-search">Find member</Label>
            <Input
              id="settle-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or membership no."
              autoFocus
            />
            {hits.isFetching ? (
              <p className="text-xs text-muted-foreground">Searching…</p>
            ) : null}
            {debouncedSearch.length >= 2 && (hits.data?.length ?? 0) > 0 ? (
              <ul className="max-h-28 overflow-y-auto rounded-md border border-border">
                {(hits.data ?? []).map((hit) => (
                  <li key={hit.accountId}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm hover:bg-muted",
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
          <div className="space-y-3">
            <section className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold leading-tight">{ctx.memberName}</p>
                  <p className="text-xs text-muted-foreground">
                    {ctx.membershipNo || "—"} · {ctx.year} · {statusLabel}
                  </p>
                </div>
                <p className="shrink-0 text-right font-semibold text-amber-800">{formatKes(ctx.arrearsAmount)}</p>
              </div>
              {ctx.eligibleForSeniorDiscount || ctx.canIncludeReactivationFee ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-2">
                  {ctx.eligibleForSeniorDiscount ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={applySenior}
                        onChange={(e) => setApplySenior(e.target.checked)}
                      />
                      Senior discount 50%
                    </label>
                  ) : null}
                  {ctx.canIncludeReactivationFee ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={includeReactivation}
                        onChange={(e) => setIncludeReactivation(e.target.checked)}
                      />
                      Re-activation fee {formatKes(ctx.reactivationFeeAmount)}
                    </label>
                  ) : null}
                </div>
              ) : null}
            </section>

            <div className="grid gap-2.5">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Amount paid</span>
                <Input
                  inputMode="decimal"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(maskKesInput(e.target.value))}
                  aria-invalid={Boolean(amountError)}
                />
                {amountError ? (
                  <span className="text-xs text-destructive">{amountError}</span>
                ) : remaining != null ? (
                  <span className="text-xs font-medium text-amber-800">
                    Remaining balance after clearance: {formatKes(remaining)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Defaults to {formatKes(suggestedAnnual)}. A lower amount is a partial payment.
                  </span>
                )}
              </label>

              <div className="grid gap-2.5 sm:grid-cols-2">
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
                    Reference{needsReference(method) ? " *" : ""}
                  </span>
                  <Input
                    value={reference}
                    maxLength={isMpesa(method) ? 10 : 40}
                    onChange={(e) =>
                      setReference(
                        isMpesa(method)
                          ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
                          : e.target.value,
                      )
                    }
                    placeholder={isMpesa(method) ? "SAB1234567" : method === "CASH" ? "Optional" : "Cheque or EFT no."}
                    aria-invalid={Boolean(reference.trim()) && Boolean(refError)}
                  />
                  {refError && reference.trim() ? (
                    <span className="text-xs text-destructive">{refError}</span>
                  ) : needsReference(method) && !reference.trim() ? (
                    <span className="text-xs text-muted-foreground">
                      {isMpesa(method) ? "10 letters or numbers." : "Required."}
                    </span>
                  ) : null}
                </label>
              </div>

              {includeReactivation && ctx.canIncludeReactivationFee ? (
                <p className="text-xs text-muted-foreground">
                  Collected today {formatKes((paidAmount ?? 0) + ctx.reactivationFeeAmount)} including the re-activation fee.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-5 py-3 sm:space-x-0">
          <Button type="button" variant="outline" disabled={settle.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={settle.isPending || !canSubmit}
            onClick={() => {
              if (!canSubmit) {
                toast.error(amountError || refError || "Complete the payment details.");
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
