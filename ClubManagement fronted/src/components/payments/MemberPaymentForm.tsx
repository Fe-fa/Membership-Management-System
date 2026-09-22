import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FileRef } from "@/services/membership/schema";
import { apiRequest, extractErrorMessage, uploadFile } from "@/services/membership/api";
import { formatKes } from "@/utils/format";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { cn } from "@/utils/cn";
import { useQueryClient } from "@tanstack/react-query";

import type { FeePurpose, LookupOption, MemberSubscription, MpesaStkResult, PaymentAudience } from "./types";
import {
  APPLICANT_FEE_PURPOSES,
  CHEQUE_BANKS,
  FEE_PURPOSE_CODE,
  FEE_PURPOSE_LABEL,
  MEMBER_FEE_PURPOSES,
  METHOD_ICONS,
  normalizeMethodCode,
} from "./types";
import {
  invalidateAfterApplicationPayment,
  invalidateAfterMemberPayment,
  useMpesaStkPush,
} from "./useMemberPayments";

const EPSILON = 0.009;

type PaymentRow = {
  id: string;
  methodId: string;
  amount: string;
  mpesaPhone: string;
  mpesaCode: string;
  mpesaMode: "stk" | "manual";
  cardHolder: string;
  cardLast4: string;
  chequeBankName: string;
  chequeBankCode: string;
  chequeNumber: string;
  chequeDate: string;
  chequeFile: FileRef | null;
  reference: string;
};

function round2(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function toNum(value: string | number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function newRow(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    methodId: "",
    amount: "",
    mpesaPhone: "",
    mpesaCode: "",
    mpesaMode: "stk",
    cardHolder: "",
    cardLast4: "",
    chequeBankName: "",
    chequeBankCode: "",
    chequeNumber: "",
    chequeDate: kenyaTodayISO(),
    chequeFile: null,
    reference: "",
    ...overrides,
  };
}

export function MemberPaymentForm({
  open,
  onOpenChange,
  sub,
  methods,
  initialPurpose,
  initialAmount,
  initialLineDescription,
  nmChargeId,
  audience = "member",
  applicationId,
  layout = "dialog",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sub: MemberSubscription;
  methods: LookupOption[];
  initialPurpose?: FeePurpose;
  initialAmount?: number;
  initialLineDescription?: string;
  nmChargeId?: number;
  /** Same form for club members and applicants. */
  audience?: PaymentAudience;
  /** Required when audience is applicant. */
  applicationId?: number;
  /** Dialog modal, or full form on the payment page. */
  layout?: "dialog" | "page";
}) {
  const isApplicant = audience === "applicant";
  const formOpen = layout === "page" || open;
  const purposes = isApplicant ? APPLICANT_FEE_PURPOSES : MEMBER_FEE_PURPOSES;
  const paymentMethods = useMemo(() => {
    if (!isApplicant) return methods;
    return methods.filter((m) => {
      const code = normalizeMethodCode(m.code);
      return code !== "CLUB_CARD" && code !== "CLUB_CREDIT" && code !== "ACCOUNT_BALANCE";
    });
  }, [isApplicant, methods]);

  const upcomingOutstanding = Math.max(0, Number(sub.upcomingOutstanding || 0));
  const annualBillingYear =
    sub.paysSubscription && sub.outstanding <= EPSILON && upcomingOutstanding > EPSILON && sub.upcomingYear
      ? sub.upcomingYear
      : sub.year;
  const annualOutstanding =
    sub.paysSubscription
      ? sub.outstanding > EPSILON
        ? Math.max(0, sub.outstanding)
        : upcomingOutstanding
      : 0;

  const [purpose, setPurpose] = useState<FeePurpose>(initialPurpose ?? "annual");
  const [paidAt, setPaidAt] = useState(kenyaTodayISO());
  const [lineDescription, setLineDescription] = useState(initialLineDescription ?? "");
  const [rows, setRows] = useState<PaymentRow[]>([newRow()]);
  const [error, setError] = useState("");
  const [chequeUploadingId, setChequeUploadingId] = useState<string | null>(null);
  const [stkByRow, setStkByRow] = useState<Record<string, MpesaStkResult | undefined>>({});

  const suggestedAmount = useMemo(() => {
    if (purpose === "joining") return Math.max(0, sub.joiningOutstanding);
    if (purpose === "annual") return annualOutstanding;
    return 0;
  }, [purpose, sub.joiningOutstanding, annualOutstanding]);

  const defaultMethodId = useMemo(() => {
    const preferred = ["MPESA", "CASH", "CHEQUE", "CARD", "CLUB_CARD"];
    const sorted = [...paymentMethods].sort((a, b) => {
      const ai = preferred.indexOf(normalizeMethodCode(a.code));
      const bi = preferred.indexOf(normalizeMethodCode(b.code));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return sorted[0]?.id != null ? String(sorted[0].id) : "";
  }, [paymentMethods]);

  useEffect(() => {
    if (!formOpen) return;
    const fallbackPurpose: FeePurpose =
      sub.joiningOutstanding > 0 && (!sub.paysSubscription || annualOutstanding <= 0)
        ? "joining"
        : sub.paysSubscription && annualOutstanding > 0
          ? "annual"
          : isApplicant
            ? "joining"
            : "accommodation";
    const nextPurpose: FeePurpose =
      initialPurpose && purposes.includes(initialPurpose) ? initialPurpose : fallbackPurpose;
    setPurpose(nextPurpose);
    const seed =
      initialAmount != null && initialAmount > 0
        ? initialAmount
        : nextPurpose === "joining"
          ? sub.joiningOutstanding
          : nextPurpose === "annual" && sub.paysSubscription
            ? annualOutstanding
            : 0;
    setRows([
      newRow({
        methodId: defaultMethodId,
        amount: seed > 0 ? seed.toFixed(2) : "",
        mpesaMode: isApplicant ? "manual" : "stk",
      }),
    ]);
    setPaidAt(kenyaTodayISO());
    setLineDescription(initialLineDescription ?? "");
    setError("");
    setStkByRow({});
  }, [
    formOpen,
    defaultMethodId,
    sub.joiningOutstanding,
    annualOutstanding,
    sub.paysSubscription,
    initialPurpose,
    initialAmount,
    initialLineDescription,
    isApplicant,
    purposes,
  ]);

  useEffect(() => {
    if (!formOpen) return;
    if (purpose !== "joining" && purpose !== "annual") return;
    setRows((prev) => {
      if (prev.length !== 1) return prev;
      const only = prev[0];
      if (!only) return prev;
      if (toNum(only.amount) > EPSILON) return prev;
      return [
        {
          ...only,
          amount: suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "",
        },
      ];
    });
  }, [formOpen, purpose, suggestedAmount]);

  const allocated = round2(rows.reduce((sum, row) => sum + Math.max(toNum(row.amount), 0), 0));
  const target =
    purpose === "joining" || purpose === "annual" ? suggestedAmount : allocated;
  const remaining =
    purpose === "joining" || purpose === "annual"
      ? round2(suggestedAmount - allocated)
      : 0;

  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const stkPush = useMpesaStkPush();

  const purposeEnabled = (p: FeePurpose) => {
    if (p === "joining") return sub.joiningOutstanding > 0;
    if (p === "annual") return sub.paysSubscription && annualOutstanding > 0;
    return true;
  };

  const methodOf = (row: PaymentRow) =>
    paymentMethods.find((m) => String(m.id) === row.methodId);

  const methodCodeOf = (row: PaymentRow) =>
    normalizeMethodCode(methodOf(row)?.code);

  const updateRow = (id: string, patch: Partial<PaymentRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.methodId && patch.methodId !== row.methodId) {
          next.mpesaPhone = "";
          next.mpesaCode = "";
          next.mpesaMode = isApplicant ? "manual" : "stk";
          next.cardHolder = "";
          next.cardLast4 = "";
          next.chequeBankName = "";
          next.chequeBankCode = "";
          next.chequeNumber = "";
          next.chequeFile = null;
          setStkByRow((s) => {
            const copy = { ...s };
            delete copy[id];
            return copy;
          });
        }
        return next;
      }),
    );
    setError("");
  };

  const addRow = () => {
    const fill =
      purpose === "joining" || purpose === "annual"
        ? Math.max(remaining, 0)
        : 0;
    setRows((prev) => [
      ...prev,
      newRow({
        methodId: defaultMethodId,
        amount: fill > 0 ? fill.toFixed(2) : "",
      }),
    ]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      if (prev.length <= 1) {
        return [newRow({ methodId: defaultMethodId, amount: "" })];
      }
      return prev.filter((r) => r.id !== id);
    });
    setError("");
  };

  const fillRemaining = (id: string) => {
    if (purpose !== "joining" && purpose !== "annual") return;
    const other = round2(
      rows.reduce((sum, row) => (row.id === id ? sum : sum + Math.max(toNum(row.amount), 0)), 0),
    );
    const next = round2(Math.max(suggestedAmount - other, 0));
    updateRow(id, { amount: next > 0 ? next.toFixed(2) : "" });
  };

  const validate = () => {
    if (purpose === "other" && !lineDescription.trim()) {
      throw new Error("Describe the custom fee line item.");
    }
    const active = rows.filter((r) => toNum(r.amount) > EPSILON);
    if (!active.length) throw new Error("Enter at least one payment amount.");

    if (purpose === "joining" || purpose === "annual") {
      if (remaining < -EPSILON) {
        throw new Error("Allocated payments exceed the amount due. Reduce a row.");
      }
    }

    for (const row of active) {
      const code = methodCodeOf(row);
      if (!row.methodId) throw new Error("Select a payment method on every row.");

      if (code === "MPESA") {
        if (!row.mpesaPhone.trim()) throw new Error("M-Pesa rows require a phone number.");
        if (row.mpesaMode === "manual" && !row.mpesaCode.trim()) {
          throw new Error(
            isApplicant
              ? "Enter the M-Pesa transaction code."
              : "Enter the M-Pesa transaction code, or switch to STK Push.",
          );
        }
        if (row.mpesaMode === "stk" && !row.mpesaCode.trim() && !stkByRow[row.id]) {
          throw new Error("Send STK Push first, then enter the M-Pesa code after approval.");
        }
      }

      if (code === "CARD" || code === "CREDIT" || code === "CREDIT_CARD") {
        if (!row.cardHolder.trim() || !/^\d{4}$/.test(row.cardLast4.trim())) {
          throw new Error("Card rows need cardholder name and last 4 digits.");
        }
      }

      if (code === "CHEQUE" || code === "CHEQUE_PAYMENT") {
        const hasName = Boolean(row.chequeBankName.trim());
        const hasCode = Boolean(row.chequeBankCode.trim());
        if (!hasName && !hasCode) {
          throw new Error("Every cheque row requires a bank name or bank code.");
        }
        if (hasName && hasCode) {
          throw new Error("Enter cheque bank name or bank code, not both.");
        }
        if (!row.chequeNumber.trim()) throw new Error("Every cheque row requires a cheque number.");
        if (!row.chequeDate) throw new Error("Every cheque row requires the cheque date.");
      }

      if (code === "CLUB_CARD" || code === "ACCOUNT_BALANCE" || code === "CLUB_CREDIT") {
        if (toNum(row.amount) > (sub.clubCreditBalance ?? 0) + EPSILON) {
          throw new Error(
            `Club card credit is ${formatKes(sub.clubCreditBalance ?? 0)} — not enough for this row.`,
          );
        }
      }
    }
  };

  const sendStk = async (row: PaymentRow) => {
    if (isApplicant) {
      toast.error("M-Pesa STK Push is available after you become a member. Enter the M-Pesa code manually.");
      return;
    }
    const amount = toNum(row.amount);
    if (!row.mpesaPhone.trim()) {
      toast.error("Enter an M-Pesa phone number first.");
      return;
    }
    if (amount <= 0) {
      toast.error("Enter the amount before sending STK push.");
      return;
    }
    try {
      const result = await stkPush.mutateAsync({
        phone: row.mpesaPhone.trim(),
        amount,
        feeTypeCode: FEE_PURPOSE_CODE[purpose],
        accountReference: sub.membershipNo ?? undefined,
      });
      setStkByRow((prev) => ({ ...prev, [row.id]: result }));
      toast.success(result.customerMessage);
    } catch {
      /* toasted in hook */
    }
  };

  const processPayment = async () => {
    setError("");
    try {
      validate();
      if (isApplicant && !(applicationId && applicationId > 0)) {
        throw new Error("Save your application first so payment can be linked.");
      }
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error(message);
      return;
    }

    const active = rows.filter((r) => toNum(r.amount) > EPSILON);
    const endpoint = isApplicant
      ? `/api/applications/${applicationId}/payments`
      : "/api/members/me/payments";

    try {
      setSubmitting(true);
      for (const row of active) {
        const code = methodCodeOf(row);
        const isMpesa = code === "MPESA";
        const isCard = code === "CARD" || code === "CREDIT" || code === "CREDIT_CARD";
        const isCheque = code === "CHEQUE" || code === "CHEQUE_PAYMENT";
        const stk = stkByRow[row.id];
        const noteParts = [
          row.reference.trim(),
          isCard ? `Card ···· ${row.cardLast4.trim()} · ${row.cardHolder.trim()}` : "",
          stk ? `STK ${stk.checkoutRequestId}` : "",
        ].filter(Boolean);

        await apiRequest(endpoint, {
          method: "POST",
          body: JSON.stringify({
            paymentMethodId: Number(row.methodId),
            feeTypeCode: FEE_PURPOSE_CODE[purpose],
            amount: round2(toNum(row.amount)),
            paymentDate: paidAt,
            mpesaCode: isMpesa ? row.mpesaCode.trim().toUpperCase() || undefined : undefined,
            mpesaPhone: isMpesa ? row.mpesaPhone.trim() || undefined : undefined,
            chequeNo: isCheque ? row.chequeNumber.trim() || undefined : undefined,
            chequeBankName: isCheque && row.chequeBankName.trim() ? row.chequeBankName.trim() : undefined,
            chequeBankCode: isCheque && row.chequeBankCode.trim() ? row.chequeBankCode.trim() : undefined,
            chequeDate: isCheque ? row.chequeDate : undefined,
            chequeFileName: isCheque ? row.chequeFile?.fileName : undefined,
            chequeFileUrl: isCheque ? row.chequeFile?.url : undefined,
            referenceNote: noteParts.join(" | ") || undefined,
            lineDescription:
              !isApplicant &&
              (purpose === "accommodation" || purpose === "corkage" || purpose === "other")
                ? lineDescription.trim() || FEE_PURPOSE_LABEL[purpose]
                : undefined,
            nmChargeId: !isApplicant ? nmChargeId || undefined : undefined,
            subscriptionYear:
              !isApplicant && purpose === "annual" ? annualBillingYear : undefined,
            paymentStatusCode:
              isCard || isCheque || (isMpesa && !row.mpesaCode.trim()) ? "PENDING" : undefined,
          }),
        });
      }
      toast.success(
        active.length > 1 ? `${active.length} payments recorded.` : "Payment recorded.",
      );
      if (isApplicant && applicationId) {
        await invalidateAfterApplicationPayment(queryClient, applicationId);
      } else {
        await invalidateAfterMemberPayment(queryClient);
      }
      if (layout === "dialog") onOpenChange(false);
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || stkPush.isPending || Boolean(chequeUploadingId);

  const formBody = (
        <div className={cn(
          "grid min-h-0 flex-1 overflow-hidden lg:grid-cols-2",
          layout === "page" ? "gap-4" : "lg:grid-cols-[0.9fr_1.15fr]",
        )}>
          <aside className={cn(
            "space-y-4",
            layout === "page" && "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
            layout === "dialog" && "overflow-y-auto border-b border-border bg-muted/40 px-5 py-5 lg:border-b-0 lg:border-r",
          )}>
            <StepHeading step={1} title="Review Dues" />

            <div className={cn(layout === "dialog" && "rounded-2xl border border-border bg-card p-4 shadow-sm")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Detailed summary
              </p>
              <div className="mt-3 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Annual Dues ({annualBillingYear})</span>
                  <strong className="tabular-nums">{formatKes(sub.paysSubscription ? annualOutstanding : 0)}</strong>
                </div>
                {!isApplicant ? (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Club Card Credit</span>
                    <strong className="tabular-nums font-medium text-rose-400">
                      ({formatKes(sub.clubCreditBalance ?? 0)})
                    </strong>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Joining balance</span>
                  <strong
                    className={cn(
                      "tabular-nums",
                      sub.joiningOutstanding <= EPSILON && "text-emerald-600",
                    )}
                  >
                    {formatKes(sub.joiningOutstanding)}
                  </strong>
                </div>
                {!isApplicant && sub.upcomingYear && upcomingOutstanding > 0 && sub.outstanding > EPSILON ? (
                  <div className="flex justify-between gap-3 text-xs text-amber-800">
                    <span>{sub.upcomingYear} renewal also unpaid</span>
                    <span className="tabular-nums">{formatKes(upcomingOutstanding)}</span>
                  </div>
                ) : null}
                <div className="my-1 border-t border-border" />
                <div className="flex justify-between gap-3 text-base">
                  <span className="font-semibold">Net Dues</span>
                  <strong className="tabular-nums">{formatKes(sub.balance)}</strong>
                </div>
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>Tier</span>
                  <span>{sub.membershipTypeName ?? sub.membershipTypeCode ?? "—"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="modal-fee-type"
                className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                Fee type
              </Label>
              <select
                id="modal-fee-type"
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as FeePurpose)}
              >
                {purposes.map((p) => {
                  const locked = !purposeEnabled(p) && (p === "joining" || p === "annual");
                  return (
                    <option key={p} value={p} disabled={locked}>
                      {FEE_PURPOSE_LABEL[p]}
                      {locked ? " (nothing due)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Payment date
              </Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="rounded-xl" />
            </div>

            {(purpose === "accommodation" || purpose === "corkage" || purpose === "other") && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Line description
                </Label>
                <Input
                  className="rounded-xl"
                  value={lineDescription}
                  onChange={(e) => setLineDescription(e.target.value)}
                  placeholder={
                    purpose === "accommodation"
                      ? "e.g. Room 12 · 3 nights advance"
                      : purpose === "corkage"
                        ? "e.g. Outside catering · Saturday dinner"
                        : "Describe the charge"
                  }
                />
              </div>
            )}
          </aside>

          <section className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            layout === "page" && "rounded-xl border border-slate-200 bg-white shadow-sm",
          )}>
            <div className={cn(
              "flex items-center justify-between gap-3",
              layout === "page" ? "px-5 pt-5" : "border-b border-border px-5 py-3",
            )}>
              <StepHeading step={2} title="Payment Allocation" />
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={addRow} disabled={busy}>
                <Plus className="size-4" /> Add row
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {rows.map((row, index) => {
                const code = methodCodeOf(row);
                const Icon: LucideIcon = METHOD_ICONS[code] ?? Wallet;
                const isMpesa = code === "MPESA";
                const isCard = code === "CARD" || code === "CREDIT" || code === "CREDIT_CARD";
                const isCheque = code === "CHEQUE" || code === "CHEQUE_PAYMENT";
                const isClub =
                  code === "CLUB_CARD" || code === "ACCOUNT_BALANCE" || code === "CLUB_CREDIT";
                const stk = stkByRow[row.id];

                return (
                  <div
                    key={row.id}
                    className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span className="flex size-8 items-center justify-center rounded-full bg-brand/15 text-brand">
                          <Icon className="size-4" />
                        </span>
                        Row {index + 1}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(purpose === "joining" || purpose === "annual") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => fillRemaining(row.id)}
                            disabled={busy}
                          >
                            Fill remaining
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => removeRow(row.id)}
                          disabled={busy || rows.length === 1}
                        >
                          <Trash2 className="size-4" /> Remove
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Method
                        </Label>
                        <select
                          className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm"
                          value={row.methodId}
                          onChange={(e) => updateRow(row.id, { methodId: e.target.value })}
                        >
                          <option value="">Select method</option>
                          {paymentMethods.map((m) => (
                            <option key={m.code} value={String(m.id)}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Allocated amount
                        </Label>
                        <Input
                          className="rounded-xl"
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {isMpesa ? (
                      <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
                        {!isApplicant ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-full"
                              variant={row.mpesaMode === "stk" ? "default" : "outline"}
                              onClick={() => updateRow(row.id, { mpesaMode: "stk", mpesaCode: "" })}
                            >
                              STK Push
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-full"
                              variant={row.mpesaMode === "manual" ? "default" : "outline"}
                              onClick={() => updateRow(row.id, { mpesaMode: "manual" })}
                            >
                              Enter code
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Pay via M-Pesa, then enter the transaction code below.
                          </p>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              M-Pesa phone
                            </Label>
                            <Input
                              className="rounded-xl"
                              value={row.mpesaPhone}
                              onChange={(e) => updateRow(row.id, { mpesaPhone: e.target.value })}
                              placeholder="07XXXXXXXX"
                            />
                          </div>
                          {row.mpesaMode === "manual" || stk || isApplicant ? (
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                M-Pesa code
                              </Label>
                              <Input
                                className="rounded-xl"
                                value={row.mpesaCode}
                                onChange={(e) =>
                                  updateRow(row.id, { mpesaCode: e.target.value.toUpperCase() })
                                }
                                placeholder="After approval"
                                maxLength={12}
                              />
                            </div>
                          ) : null}
                        </div>
                        {!isApplicant && row.mpesaMode === "stk" ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="rounded-full"
                              disabled={stkPush.isPending || toNum(row.amount) <= 0}
                              onClick={() => void sendStk(row)}
                            >
                              {stkPush.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                              Send M-Pesa STK Push
                            </Button>
                            {stk ? (
                              <p className="text-xs text-success">
                                {stk.customerMessage} · {stk.checkoutRequestId}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Approve on your phone, then paste the M-Pesa code above.
                              </p>
                            )}
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {isCard ? (
                      <div className="grid gap-3 rounded-xl border border-border bg-secondary/30 p-3 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Cardholder name
                          </Label>
                          <Input
                            className="rounded-xl"
                            value={row.cardHolder}
                            onChange={(e) => updateRow(row.id, { cardHolder: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Last 4 digits
                          </Label>
                          <Input
                            className="rounded-xl"
                            value={row.cardLast4}
                            onChange={(e) =>
                              updateRow(row.id, {
                                cardLast4: e.target.value.replace(/\D/g, "").slice(0, 4),
                              })
                            }
                            placeholder="1234"
                            inputMode="numeric"
                          />
                        </div>
                        <p className="sm:col-span-2 text-xs text-muted-foreground">
                          Card payments stay <strong>Pending</strong> until finance clears them.
                        </p>
                      </div>
                    ) : null}

                    {isCheque ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Bank name
                          </Label>
                          <Input
                            className="rounded-xl"
                            value={row.chequeBankName}
                            list={`cheque-banks-${row.id}`}
                            onChange={(e) => {
                              updateRow(row.id, {
                                chequeBankName: e.target.value,
                                chequeBankCode: e.target.value.trim() ? "" : row.chequeBankCode,
                              });
                            }}
                            placeholder="Issuing bank"
                          />
                          <datalist id={`cheque-banks-${row.id}`}>
                            {CHEQUE_BANKS.map((bank) => (
                              <option key={bank} value={bank} />
                            ))}
                          </datalist>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Bank code
                          </Label>
                          <Input
                            className="rounded-xl"
                            value={row.chequeBankCode}
                            onChange={(e) =>
                              updateRow(row.id, {
                                chequeBankCode: e.target.value.toUpperCase(),
                                chequeBankName: e.target.value.trim() ? "" : row.chequeBankName,
                              })
                            }
                            placeholder="e.g. KCB"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Cheque number
                          </Label>
                          <Input
                            className="rounded-xl"
                            value={row.chequeNumber}
                            onChange={(e) =>
                              updateRow(row.id, { chequeNumber: e.target.value.toUpperCase() })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Cheque date
                          </Label>
                          <Input
                            className="rounded-xl"
                            type="date"
                            value={row.chequeDate}
                            onChange={(e) => updateRow(row.id, { chequeDate: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Cheque copy (optional)
                          </Label>
                          <Input
                            className="rounded-xl"
                            type="file"
                            accept="image/*,.pdf,.doc,.docx"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                setChequeUploadingId(row.id);
                                const uploaded = await uploadFile(file, "cheque");
                                updateRow(row.id, { chequeFile: uploaded });
                              } catch (err) {
                                toast.error(extractErrorMessage(err));
                              } finally {
                                setChequeUploadingId(null);
                              }
                            }}
                          />
                          {row.chequeFile ? (
                            <p className="text-xs text-success">Attached: {row.chequeFile.fileName}</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {/* {isClub ? (
                      <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-foreground">
                        Paying from club card credit ({formatKes(sub.clubCreditBalance ?? 0)}).
                      </p>
                    ) : null} */}

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Reference / notes
                      </Label>
                      <Input
                        className="rounded-xl"
                        value={row.reference}
                        onChange={(e) => updateRow(row.id, { reference: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                );
              })}

              {error ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
              {layout === "dialog" ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              ) : null}
              <Button
                type="button"
                className="min-w-48 rounded-full"
                disabled={busy || allocated <= 0}
                onClick={() => void processPayment()}
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                Process payment · {formatKes(allocated)}
              </Button>
            </div>
          </section>
        </div>
  );

  if (layout === "page") {
    return <div id="member-make-payment">{formBody}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="bg-brand-gradient space-y-0 px-6 py-4 pr-12 text-left text-primary-foreground">
          <DialogTitle className="text-base font-semibold tracking-[0.14em] text-primary-foreground">
            PAYMENT
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isApplicant
              ? "Pay joining and first-year subscription fees for your application."
              : `Allocate joining, annual, or advance club charges for ${sub.membershipNo ?? "this membership"}.`}
          </DialogDescription>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}

function StepHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {step}
      </span>
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
    </div>
  );
}
