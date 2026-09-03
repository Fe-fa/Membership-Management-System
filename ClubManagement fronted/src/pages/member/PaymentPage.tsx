import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Landmark,
  Loader2,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isClubMember, readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage, fetchApplication, uploadFile } from "@/services/membership/api";
import { applicationQueryKey } from "@/services/membership/useApplication";
import { useMemberDashboard } from "@/services/member/dashboard";
import { emptyDraft, type FileRef, type MembershipType } from "@/services/membership/schema";
import { formatKes } from "@/utils/format";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { cn } from "@/utils/cn";
import { ApplicantStageChecklist } from "@/components/admin/ManagerStagePanel";

type LookupOption = { id?: number; code: string; name: string };
type FeeSelection = "joining" | "annual" | "both";

type PaymentHistoryRow = {
  transactionId: number;
  receiptNumber?: string | null;
  method?: string | null;
  status?: string | null;
  amount: number;
  paymentDate?: string | null;
  mpesaCode?: string | null;
  chequeNo?: string | null;
  chequeBankName?: string | null;
  chequeBankCode?: string | null;
  chequeDate?: string | null;
  chequeFileName?: string | null;
  chequeFileUrl?: string | null;
  feeType?: string | null;
  referenceNote?: string | null;
};

const FEE_LABEL: Record<FeeSelection, string> = {
  joining: "Joining fee",
  annual: "Annual subscription",
  both: "Joining fee + Annual subscription",
};

const METHOD_ICONS: Record<string, LucideIcon> = {
  CASH: Wallet,
  MPESA: Smartphone,
  CHEQUE: Landmark,
  BANK_TRANSFER: Landmark,
  CARD: Banknote,
};

const CHEQUE_BANKS = [
  "KCB Bank Kenya",
  "Absa Bank Kenya",
  "Equity Bank Kenya",
  "Co-operative Bank of Kenya",
  "NCBA Bank Kenya",
  "Stanbic Bank Kenya",
  "I&M Bank Kenya",
  "Diamond Trust Bank Kenya",
  "Family Bank Kenya",
];

function normalizeMethodCode(code?: string | null) {
  return (code ?? "").trim().toUpperCase().replace(/[-\s]/g, "_");
}

function isPaidStatus(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  return s === "paid" || s === "waived";
}

export function PaymentPage() {
  const member = useMemberDashboard();
  if (isClubMember(readUser())) {
    return <MemberSubscriptionPage standing={member.data?.standing ?? "InGoodStanding"} />;
  }
  return <ApplicantPaymentPage />;
}

function MemberSubscriptionPage({ standing }: { standing: string }) {
  const queryClient = useQueryClient();
  const sub = useQuery({
    queryKey: ["member-subscription"],
    queryFn: () =>
      apiRequest<{
        standing: string;
        detail: string;
        paysSubscription: boolean;
        year: number;
        amountDue: number;
        amountPaid: number;
        outstanding: number;
        dueDate: string;
        postingDeadline: string;
        removalDeadline: string;
        discountPercent: number;
      }>("/api/members/me/subscription"),
  });
  const history = useQuery({
    queryKey: ["member-payments"],
    queryFn: () => apiRequest<PaymentHistoryRow[]>("/api/members/me/payments"),
  });
  const methods = useQuery({
    queryKey: ["lookups", "payment-methods"],
    queryFn: () => apiRequest<LookupOption[]>("/api/lookups/payment-methods"),
  });
  const [methodId, setMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [mpesa, setMpesa] = useState("");
  const [ref, setRef] = useState("");

  const row = sub.data;
  useEffect(() => {
    if (row?.outstanding) setAmount(String(row.outstanding));
  }, [row?.outstanding]);

  const pay = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/members/me/payments", {
        method: "POST",
        body: JSON.stringify({
          paymentMethodId: Number(methodId),
          amount: Number(amount),
          paymentDate: kenyaTodayISO(),
          mpesaCode: mpesa || undefined,
          referenceNote: ref || undefined,
        }),
      });
    },
    onSuccess: async () => {
      toast.success("Payment recorded.");
      await Promise.all([
        sub.refetch(),
        history.refetch(),
        queryClient.invalidateQueries({ queryKey: ["member-payments"] }),
      ]);
      setMpesa("");
      setRef("");
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  if (!row?.paysSubscription) {
    return (
      <PageFrame>
        <PageHeader
          title="Subscriptions & Payments"
          description={row?.detail ?? "This class does not pay an annual subscription."}
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PageHeader
        title="Subscriptions & Payments"
        description="Annual subscription is due on 1 January. Members in arrears are posted after 28 February and may be removed after 30 April."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Account status</CardTitle>
            <CardDescription>{standing.replace(/([A-Z])/g, " $1").trim()}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{row.detail}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{row.year} subscription</CardTitle>
            <CardDescription>
              {row.discountPercent ? `${row.discountPercent}% Senior reduction applied` : "Full annual rate"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            Due {formatKes(row.amountDue)} · Paid {formatKes(row.amountPaid)} · Outstanding{" "}
            {formatKes(row.outstanding)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Due 1 Jan · Posted 28 Feb · Removal 30 Apr
          </CardContent>
        </Card>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pay.mutate();
        }}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <select
          className="rounded-md border border-input bg-background px-3 py-2"
          value={methodId}
          onChange={(e) => setMethodId(e.target.value)}
          required
        >
          <option value="">Payment method</option>
          {(methods.data ?? []).map((m) => (
            <option key={m.code} value={String(m.id)}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-input bg-background px-3 py-2"
          type="number"
          min="1"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <input
          className="rounded-md border border-input bg-background px-3 py-2"
          placeholder="M-Pesa / bank reference"
          value={mpesa}
          onChange={(e) => setMpesa(e.target.value)}
        />
        <Button type="submit" disabled={pay.isPending}>
          {pay.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Pay now
        </Button>
      </form>
      <PaymentHistoryTable rows={history.data ?? []} />
    </PageFrame>
  );
}

type ApplicationDues = {
  membershipTypeId?: number | null;
  membershipTypeName?: string | null;
  joiningFeeTypeId: number;
  annualFeeTypeId: number;
  joiningFee: number;
  annualSubscription: number;
  joiningPaid: number;
  annualPaid: number;
  joiningBalance: number;
  annualBalance: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
  halfYearAnnual: boolean;
};

function ApplicantPaymentPage() {
  const queryClient = useQueryClient();
  const { data: record } = useQuery({
    queryKey: applicationQueryKey(readUser()?.userAccountId),
    queryFn: fetchApplication,
    staleTime: 30_000,
    enabled: Boolean(readUser()?.userAccountId),
  });

  const applicationId = Number(record?.id || 0);
  const draft = { ...emptyDraft(), ...record?.draft };
  const membershipType = draft.membership.membershipType as MembershipType | undefined;

  const methods = useQuery({
    queryKey: ["lookups", "payment-methods"],
    queryFn: () => apiRequest<LookupOption[]>("/api/lookups/payment-methods"),
  });

  const dues = useQuery({
    queryKey: ["application-dues", applicationId],
    queryFn: () => apiRequest<ApplicationDues>(`/api/applications/${applicationId}/dues`),
    enabled: applicationId > 0,
  });

  const history = useQuery({
    queryKey: ["application-payments", applicationId],
    queryFn: () => apiRequest<PaymentHistoryRow[]>(`/api/applications/${applicationId}/payments`),
    enabled: applicationId > 0,
  });

  const [feeSelection, setFeeSelection] = useState<FeeSelection>("both");
  const [methodId, setMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(kenyaTodayISO());
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaCode, setMpesaCode] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeBankCode, setChequeBankCode] = useState("");
  const [chequeDate, setChequeDate] = useState(kenyaTodayISO());
  const [chequeFile, setChequeFile] = useState<FileRef | null>(null);
  const [chequeUploading, setChequeUploading] = useState(false);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  const joiningFee = Number(dues.data?.joiningFee ?? 0);
  const annualSubscription = Number(dues.data?.annualSubscription ?? 0);
  const joiningBalance = Number(dues.data?.joiningBalance ?? 0);
  const annualBalance = Number(dues.data?.annualBalance ?? 0);
  const totalDue = Number(dues.data?.totalDue ?? 0);
  const paidTotal = Number(dues.data?.totalPaid ?? 0);
  const balance = Number(dues.data?.balance ?? 0);
  const membershipLabel = dues.data?.membershipTypeName || membershipType || "—";

  const activeMethods = useMemo(() => {
    const rows = methods.data ?? [];
    const preferred = ["CASH", "MPESA", "CHEQUE", "BANK_TRANSFER"];
    return [...rows].sort((a, b) => {
      const ai = preferred.indexOf(normalizeMethodCode(a.code));
      const bi = preferred.indexOf(normalizeMethodCode(b.code));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [methods.data]);

  const selectedMethod = activeMethods.find((m) => String(m.id) === methodId);
  const methodCode = normalizeMethodCode(selectedMethod?.code);

  const balanceForSelection = (selection: FeeSelection) => {
    if (selection === "joining") return joiningBalance;
    if (selection === "annual") return annualBalance;
    return balance;
  };

  const dueForSelection = (selection: FeeSelection) => {
    if (selection === "joining") return joiningFee;
    if (selection === "annual") return annualSubscription;
    return totalDue;
  };

  useEffect(() => {
    if (!methodId && activeMethods[0]?.id) setMethodId(String(activeMethods[0].id));
  }, [activeMethods, methodId]);

  // Auto-fill Amount from outstanding balance whenever dues or fee selection change.
  useEffect(() => {
    const next = balanceForSelection(feeSelection);
    setAmount(next > 0 ? String(next.toFixed(2)) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeSelection, joiningBalance, annualBalance, balance, dues.dataUpdatedAt]);

  const pendingTotal = useMemo(
    () =>
      (history.data ?? [])
        .filter((row) => !isPaidStatus(row.status))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [history.data],
  );
  const payAmount = Number(amount || 0);

  const submit = useMutation({
    mutationFn: async () => {
      if (!applicationId) throw new Error("Save your application first so payment can be linked.");
      if (!membershipType && !dues.data?.membershipTypeId) {
        throw new Error("Choose a membership type in the application form first.");
      }
      if (!methodId) throw new Error("Select a payment method.");
      if (!Number.isFinite(payAmount) || payAmount <= 0) throw new Error("Enter a valid payment amount.");

      if (methodCode === "MPESA" && !mpesaPhone.trim()) {
        throw new Error("Enter the M-Pesa phone number the payment was made from.");
      }
      if (methodCode === "MPESA" && !mpesaCode.trim() && !reference.trim()) {
        throw new Error("Enter the M-Pesa transaction code or a payment reference.");
      }
      if (methodCode === "CHEQUE") {
        const hasBankName = Boolean(chequeBank.trim());
        const hasBankCode = Boolean(chequeBankCode.trim());
        if (!hasBankName && !hasBankCode) {
          throw new Error("Every cheque row requires either a bank name or a bank code.");
        }
        if (hasBankName && hasBankCode) {
          throw new Error("Enter cheque bank name or bank code on each cheque row, not both.");
        }
        if (!String(chequeNo || "").trim()) {
          throw new Error("Every cheque row requires a cheque number.");
        }
        if (!chequeDate) {
          throw new Error("Every cheque row requires the cheque date.");
        }
        if (!chequeFile?.url || !chequeFile.fileName) {
          throw new Error("Attach a picture, PDF, or Word copy of the cheque.");
        }
      }

      const noteParts = [reference.trim()].filter(Boolean).join(" | ");

      const postOne = async (feeTypeCode: "JOINING" | "ANNUAL", value: number) => {
        await apiRequest(`/api/applications/${applicationId}/payments`, {
          method: "POST",
          body: JSON.stringify({
            paymentMethodId: Number(methodId),
            feeTypeCode,
            amount: value,
            paymentDate: paidAt,
            mpesaCode: methodCode === "MPESA" ? mpesaCode.trim().toUpperCase() || undefined : undefined,
            mpesaPhone: methodCode === "MPESA" ? mpesaPhone.trim() || undefined : undefined,
            chequeNo: methodCode === "CHEQUE" ? chequeNo.trim() || undefined : undefined,
            chequeBankName: methodCode === "CHEQUE" && chequeBank.trim() ? chequeBank.trim() : undefined,
            chequeBankCode: methodCode === "CHEQUE" && chequeBankCode.trim() ? chequeBankCode.trim() : undefined,
            chequeDate: methodCode === "CHEQUE" ? chequeDate : undefined,
            chequeFileName: methodCode === "CHEQUE" ? chequeFile?.fileName : undefined,
            chequeFileUrl: methodCode === "CHEQUE" ? chequeFile?.url : undefined,
            referenceNote: noteParts || undefined,
          }),
        });
      };

      if (feeSelection === "both") {
        const joiningPart = Math.min(payAmount, joiningBalance > 0 ? joiningBalance : joiningFee);
        const annualPart = Math.max(payAmount - joiningPart, 0);
        if (joiningPart > 0) await postOne("JOINING", joiningPart);
        if (annualPart > 0) await postOne("ANNUAL", annualPart);
      } else {
        await postOne(feeSelection === "joining" ? "JOINING" : "ANNUAL", payAmount);
      }
    },
    onSuccess: async () => {
      toast.success("Payment recorded.");
      setError("");
      setMpesaCode("");
      setReference("");
      setChequeNo("");
      setChequeBank("");
      setChequeBankCode("");
      setChequeFile(null);
      await Promise.all([history.refetch(), dues.refetch()]);
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (err) => {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error(message);
    },
  });

  return (
    <PageFrame>
      <PageBackLink to="/" label="Back to home" />
      <PageHeader
        title="Payment"
        description="Joining and subscription amounts come from the fee schedule and Fee_type / Subscription records."
        actions={
          <Button asChild variant="outline">
            <Link to="/applications">Back to application</Link>
          </Button>
        }
      />

      {applicationId > 0 ? (
        <ApplicantStageChecklist applicationId={applicationId} statusCode={record?.status} />
      ) : null}

      {!membershipType && !dues.data?.membershipTypeId ? (
        <Card>
          <CardHeader>
            <CardTitle>Select a membership type first</CardTitle>
            <CardDescription>
              Payment amounts are loaded from Membership_fee_schedule for your membership class.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/application">Go to membership form</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle>Transaction summary</CardTitle>
                <CardDescription>
                  Fees for {membershipLabel}
                  {dues.data?.halfYearAnnual ? " (half-year annual)" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {dues.isLoading ? (
                  <p className="text-muted-foreground">Loading dues from fee schedule…</p>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Joining fee (Fee_type)</span>
                      <strong>{formatKes(joiningFee)}</strong>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Joining paid</span>
                      <span>{formatKes(Number(dues.data?.joiningPaid ?? 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Annual subscription</span>
                      <strong>{formatKes(annualSubscription)}</strong>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Annual paid</span>
                      <span>{formatKes(Number(dues.data?.annualPaid ?? 0))}</span>
                    </div>
                    <div className="border-t border-border pt-3 flex justify-between text-base">
                      <span className="font-medium">Net total</span>
                      <strong>{formatKes(totalDue)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid (verified)</span>
                      <strong className="text-emerald-700">{formatKes(paidTotal)}</strong>
                    </div>
                    {pendingTotal > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pending (e.g. cheque)</span>
                        <strong className="text-amber-700">{formatKes(pendingTotal)}</strong>
                      </div>
                    ) : null}
                    <div className="flex justify-between rounded-lg bg-background px-3 py-2">
                      <span className="font-medium">Outstanding</span>
                      <strong>{formatKes(balance)}</strong>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Paying for</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3">
                {(["joining", "annual", "both"] as FeeSelection[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFeeSelection(opt)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm",
                      feeSelection === opt
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-input text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    <div className="font-medium text-foreground">
                      {opt === "joining" ? "Joining" : opt === "annual" ? "Annual" : "Both"}
                    </div>
                    <div className="text-xs">Due {formatKes(dueForSelection(opt))}</div>
                    <div className="text-xs text-muted-foreground">
                      Balance {formatKes(balanceForSelection(opt))}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payment allocation</CardTitle>
              <CardDescription>
                Amount defaults to the outstanding balance. Methods come from Payment_method.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {activeMethods.map((method) => {
                  const code = normalizeMethodCode(method.code);
                  const Icon = METHOD_ICONS[code] ?? Banknote;
                  const active = String(method.id) === methodId;
                  return (
                    <button
                      key={method.code}
                      type="button"
                      onClick={() => setMethodId(String(method.id))}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition",
                        active
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
                        <Icon className="size-4" />
                      </span>
                      <span className="font-medium text-foreground">{method.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Amount
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from balance ({formatKes(balanceForSelection(feeSelection))}).
                  </p>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment date
                  </span>
                  <input
                    type="date"
                    lang="en-KE"
                    max={kenyaTodayISO()}
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
              </div>

              {methodCode === "MPESA" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      M-Pesa phone number
                    </span>
                    <input
                      type="tel"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      placeholder="07XXXXXXXX or 2547XXXXXXXX"
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      M-Pesa transaction code
                    </span>
                    <input
                      type="text"
                      value={mpesaCode}
                      onChange={(e) => setMpesaCode(e.target.value.toUpperCase())}
                      placeholder="e.g. QGH7X8Y2K1"
                      maxLength={12}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                </div>
              ) : null}

              {methodCode === "CHEQUE" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cheque number
                    </span>
                    <input
                      type="text"
                      value={chequeNo}
                      onChange={(e) => setChequeNo(e.target.value.toUpperCase())}
                      placeholder="Cheque number"
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cheque date
                    </span>
                    <input
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Bank name
                    </span>
                    <input
                      type="text"
                      list="cheque-banks"
                      value={chequeBank}
                      onChange={(e) => {
                        setChequeBank(e.target.value);
                        if (e.target.value.trim()) setChequeBankCode("");
                      }}
                      placeholder="Issuing bank"
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <datalist id="cheque-banks">
                      {CHEQUE_BANKS.map((bank) => (
                        <option key={bank} value={bank} />
                      ))}
                    </datalist>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Bank code
                    </span>
                    <input
                      type="text"
                      value={chequeBankCode}
                      onChange={(e) => {
                        setChequeBankCode(e.target.value.toUpperCase());
                        if (e.target.value.trim()) setChequeBank("");
                      }}
                      placeholder="Use instead of bank name"
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                  <label className="sm:col-span-2 space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cheque copy (picture, PDF or Word)
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      disabled={chequeUploading}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setChequeUploading(true);
                        setError("");
                        try {
                          setChequeFile(await uploadFile(file, "cheque"));
                        } catch (err) {
                          const message = extractErrorMessage(err);
                          setError(message);
                          toast.error(message);
                          setChequeFile(null);
                        } finally {
                          setChequeUploading(false);
                          event.target.value = "";
                        }
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
                    />
                    {chequeUploading ? (
                      <p className="text-xs text-muted-foreground">Uploading cheque copy…</p>
                    ) : chequeFile ? (
                      <p className="text-xs text-emerald-800">Attached: {chequeFile.fileName}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Required. Image, PDF, .doc or .docx, up to 10 MB.</p>
                    )}
                  </label>
                  <p className="sm:col-span-2 text-xs text-muted-foreground">
                    Enter a bank name <strong>or</strong> a bank code, not both. Cheque payments stay{" "}
                    <strong>Pending</strong> until cleared.
                  </p>
                </div>
              ) : null}

              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reference / notes
                </span>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Optional reference note"
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>

              <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <strong>{formatKes(payAmount || 0)}</strong>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{FEE_LABEL[feeSelection]}</div>
              </div>

              {error ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <Button
                type="button"
                className="w-full"
                disabled={submit.isPending || chequeUploading || !applicationId || balanceForSelection(feeSelection) <= 0}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Process payment
              </Button>
              {!applicationId ? (
                <p className="text-xs text-muted-foreground">
                  Save or submit your application first so payments can be linked to your profile.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
            <CardDescription>From MTransaction, Fee_type, Payment_status, and MReceiptMaster.</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentHistoryTable rows={history.data ?? []} loading={history.isLoading} />
          </CardContent>
        </Card>
      </section>
    </PageFrame>
  );
}

function PaymentHistoryTable({
  rows,
  loading,
}: {
  rows: PaymentHistoryRow[];
  loading?: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading payments…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No payment has been recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3">Receipt</th>
            <th className="px-3 py-3">Fee</th>
            <th className="px-3 py-3">Method</th>
            <th className="px-3 py-3">Reference</th>
            <th className="px-3 py-3">Amount</th>
            <th className="px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.transactionId} className="border-b border-border/70 last:border-0">
              <td className="px-3 py-3">{row.paymentDate ?? "—"}</td>
              <td className="px-3 py-3">{row.receiptNumber ?? "—"}</td>
              <td className="px-3 py-3">{row.feeType ?? "—"}</td>
              <td className="px-3 py-3">{row.method ?? "—"}</td>
              <td className="px-3 py-3">
                {row.mpesaCode || row.chequeNo || row.referenceNote || "—"}
                {row.chequeFileUrl ? (
                  <>
                    {" · "}
                    <a
                      href={row.chequeFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      {row.chequeFileName || "Cheque copy"}
                    </a>
                  </>
                ) : null}
              </td>
              <td className="px-3 py-3">{formatKes(row.amount)}</td>
              <td className="px-3 py-3">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                    isPaidStatus(row.status)
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-900",
                  )}
                >
                  {row.status ?? "Pending"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
