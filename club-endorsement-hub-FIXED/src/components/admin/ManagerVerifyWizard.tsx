import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  type ClubVisitRow,
  type EndorsementRow,
  type ManagerReadiness,
  type PaymentRow,
} from "@/components/admin/ManagerStagePanel";
import { parseApplicationDraft } from "@/components/panels/ApplicantReview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasAnyRole, readUser } from "@/lib/auth";
import {
  canStartReview,
  nextApplicationStage,
  type ApplicationDetailAdmin,
  type ApplicationRow,
} from "@/services/admin/membershipDesk";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { cn } from "@/utils/cn";

type StepId = "endorsements" | "payment" | "details" | "authorize";

type VerifyState = {
  endorsements: boolean;
  payment: boolean;
  details: boolean;
};

const STEPS: { id: StepId; label: string; short: string }[] = [
  { id: "endorsements", label: "1. Endorsements", short: "Endorsements" },
  { id: "payment", label: "2. Payment", short: "Payment" },
  { id: "details", label: "3. Member details", short: "Details" },
  { id: "authorize", label: "4. Authorize", short: "Authorize" },
];

function storageKey(applicationId: number | string) {
  return `acea.managerVerify.${applicationId}`;
}

function loadVerifyState(applicationId: number | string): VerifyState {
  try {
    const raw = localStorage.getItem(storageKey(applicationId));
    if (!raw) return { endorsements: false, payment: false, details: false };
    const parsed = JSON.parse(raw) as Partial<VerifyState>;
    return {
      endorsements: Boolean(parsed.endorsements),
      payment: Boolean(parsed.payment),
      details: Boolean(parsed.details),
    };
  } catch {
    return { endorsements: false, payment: false, details: false };
  }
}

function saveVerifyState(applicationId: number | string, state: VerifyState) {
  localStorage.setItem(storageKey(applicationId), JSON.stringify(state));
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value.trim() || "—"}</p>
    </div>
  );
}

function money(amount: number) {
  return Number(amount).toLocaleString("en-KE", { style: "currency", currency: "KES" });
}

export function ManagerVerifyWizard({
  row,
  onClose,
}: {
  row: ApplicationRow;
  onClose: () => void;
}) {
  const applicationId = String(row.applicationId);
  const queryClient = useQueryClient();
  const user = readUser();
  const canLogVisit = hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "RECEPTIONIST"]);
  const canOverride = hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"]);

  const [step, setStep] = useState<StepId>("endorsements");
  const [verified, setVerified] = useState<VerifyState>(() => loadVerifyState(row.applicationId));
  const [visitDate, setVisitDate] = useState(kenyaTodayISO());
  const [metWith, setMetWith] = useState("");
  const [notes, setNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    saveVerifyState(row.applicationId, verified);
  }, [row.applicationId, verified]);

  const detail = useQuery({
    queryKey: ["applications", "detail", applicationId],
    queryFn: () => apiRequest<ApplicationDetailAdmin>(`/api/applications/${applicationId}`),
  });

  const readiness = useQuery({
    queryKey: ["manager-readiness", applicationId],
    queryFn: () => apiRequest<ManagerReadiness>(`/api/applications/${applicationId}/manager-readiness`),
  });

  const payments = useQuery({
    queryKey: ["application-payments", applicationId],
    queryFn: () => apiRequest<PaymentRow[]>(`/api/applications/${applicationId}/payments`),
  });

  const visits = useQuery({
    queryKey: ["club-visits", applicationId],
    queryFn: () => apiRequest<ClubVisitRow[]>(`/api/applications/${applicationId}/club-visits`),
  });

  const draft = useMemo(
    () => parseApplicationDraft(detail.data?.formDataJson),
    [detail.data?.formDataJson],
  );

  const endorsements: EndorsementRow[] = (detail.data?.endorsements ?? []).filter(
    (e) =>
      Boolean(e.personalKnowledge?.trim()) ||
      Boolean(e.professionalKnowledge?.trim()) ||
      Boolean(e.valueAddition?.trim()),
  );
  const r = readiness.data;
  const allVerified = verified.endorsements && verified.payment && verified.details;
  const statusCode = detail.data?.statusCode ?? row.statusCode;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["manager-readiness", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["club-visits", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
    void queryClient.invalidateQueries({ queryKey: ["applications", "detail", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["application-payments", applicationId] });
  };

  const markVerified = (key: keyof VerifyState, next: StepId) => {
    setVerified((prev) => ({ ...prev, [key]: true }));
    setStep(next);
    toast.success(
      key === "endorsements"
        ? "Endorsements verified."
        : key === "payment"
          ? "Payment verified."
          : "Member details verified.",
    );
  };

  const addVisit = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/club-visits`, {
        method: "POST",
        body: JSON.stringify({ visitDate, metWith, notes: notes || null }),
      }),
    onSuccess: () => {
      toast.success("Club visit logged.");
      setMetWith("");
      setNotes("");
      refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const override = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/club-visits/override`, {
        method: "POST",
        body: JSON.stringify({ reason: overrideReason }),
      }),
    onSuccess: () => {
      toast.success("Club visits override recorded.");
      setOverrideReason("");
      refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const startReview = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/review`, {
        method: "POST",
        body: JSON.stringify({ reason: "Manager opened Stage A verification review" }),
      }),
    onSuccess: () => {
      toast.success("Manager review opened.");
      refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const authorize = useMutation({
    mutationFn: async () => {
      if (canStartReview(statusCode)) {
        await apiRequest(`/api/applications/${applicationId}/review`, {
          method: "POST",
          body: JSON.stringify({ reason: "Manager opened Stage A verification review" }),
        });
      }
      return apiRequest(`/api/applications/${applicationId}/advance`, {
        method: "POST",
        body: JSON.stringify({
          reason: "Authorized to interview after verifying endorsements, payment and member details",
        }),
      });
    },
    onSuccess: () => {
      const next = nextApplicationStage(statusCode === "Endorsement" ? "EndorsementReview" : statusCode);
      toast.success(
        next ? `Authorized. Application moved to ${next.stage}.` : "Authorized to interview.",
      );
      localStorage.removeItem(storageKey(row.applicationId));
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["applications", "stage-a-history"] });
      onClose();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const busy = startReview.isPending || authorize.isPending;
  const canAuthorize =
    allVerified &&
    (r?.canProceedToInterview !== false) &&
    (statusCode === "Endorsement" || statusCode === "EndorsementReview");

  return (
    <div className="space-y-4 rounded-xl border border-primary/25 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Stage A verification — {row.applicantName || "Applicant"}
          </p>
          <p className="text-xs text-muted-foreground">
            View each item, mark verified, then authorize. Stay on this card — no separate page.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const done =
            s.id === "endorsements"
              ? verified.endorsements
              : s.id === "payment"
                ? verified.payment
                : s.id === "details"
                  ? verified.details
                  : allVerified;
          const active = step === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active && "border-primary bg-primary text-primary-foreground",
                  !active && done && "border-emerald-300 bg-emerald-50 text-emerald-900",
                  !active && !done && "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : null}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {detail.isLoading || readiness.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading application…
        </p>
      ) : null}

      {step === "endorsements" ? (
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Endorsement recommendations</h4>
          {endorsements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No endorsement statements on file.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {endorsements.map((e, i) => (
                <div key={`${e.endorserRole}-${i}`} className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">
                    {e.endorserRole || "Endorser"}
                    {e.endorserName ? ` — ${e.endorserName}` : ""}
                    {e.yearsKnownCandidate != null ? ` · known ${e.yearsKnownCandidate} yrs` : ""}
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    <span className="font-medium text-foreground">Personal:</span>{" "}
                    {e.personalKnowledge || "—"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    <span className="font-medium text-foreground">Professional:</span>{" "}
                    {e.professionalKnowledge || "—"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    <span className="font-medium text-foreground">Value:</span> {e.valueAddition || "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!r?.endorsementsComplete && endorsements.length === 0}
              onClick={() => markVerified("endorsements", "payment")}
            >
              Verify endorsements
              <ChevronRight className="size-4" />
            </Button>
            {verified.endorsements ? (
              <span className="self-center text-xs font-medium text-emerald-800">Verified</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === "payment" ? (
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Payment</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Entrance / joining fee
              </p>
              <p className={cn("mt-1 font-medium", r?.entranceFeeOk ? "text-emerald-800" : "text-amber-900")}>
                {r?.entranceFeeOk ? "Recorded" : "Missing"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Annual subscription
              </p>
              <p className={cn("mt-1 font-medium", r?.annualSubscriptionOk ? "text-emerald-800" : "text-amber-900")}>
                {r?.annualSubscriptionOk ? "Recorded" : "Missing"}
              </p>
            </div>
          </div>
          {(payments.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment rows recorded yet.</p>
          ) : (
            <ul className="space-y-1 rounded-lg border border-border p-3 text-sm">
              {(payments.data ?? []).map((p, i) => (
                <li key={`${p.feeTypeCode ?? p.feeType}-${i}`} className="flex flex-wrap justify-between gap-2">
                  <span>{p.feeTypeName || p.feeType || p.feeTypeCode || "Fee"}</span>
                  <span className="text-muted-foreground">
                    {p.paymentStatus || p.status || "—"} · {money(Number(p.amount))}
                    {p.paymentDate ? ` · ${p.paymentDate.slice(0, 10)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("endorsements")}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={r?.paymentsReady === false}
              title={
                r?.paymentsReady === false
                  ? `Awaiting: ${r.pendingPaymentItems?.join(", ") || "fees"}`
                  : undefined
              }
              onClick={() => markVerified("payment", "details")}
            >
              Verify payment
              <ChevronRight className="size-4" />
            </Button>
            {verified.payment ? (
              <span className="self-center text-xs font-medium text-emerald-800">Verified</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === "details" ? (
        <section className="space-y-4">
          <h4 className="text-sm font-semibold">Full member / applicant details</h4>
          <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full name" value={`${draft.personal.firstName ?? ""} ${draft.personal.middleName ?? ""} ${draft.personal.lastName ?? ""}`} />
            <Field label="Membership class" value={String(draft.membership.membershipType || row.membershipTypeName || "")} />
            <Field label="ID / Passport" value={String(draft.personal.idPassportNo || "")} />
            <Field label="Date of birth" value={String(draft.personal.dateOfBirth || "")} />
            <Field label="Nationality" value={String(draft.personal.nationality || "")} />
            <Field label="Occupation" value={String(draft.personal.occupation || "")} />
            <Field label="Email" value={String(draft.personal.email || "")} />
            <Field label="Mobile" value={`${draft.personal.telPrefix ?? ""} ${draft.personal.mobile ?? ""}`} />
            <Field label="City" value={String(draft.personal.city || "")} />
            <Field label="Postal address" value={String(draft.personal.postalAddress || "")} />
            <Field label="Proposer" value={detail.data?.proposerName || String(draft.supporters.proposer?.name || "")} />
            <Field label="Seconder" value={detail.data?.seconderName || String(draft.supporters.seconder?.name || "")} />
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Documents
            </p>
            {(detail.data?.documents ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents linked.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(detail.data?.documents ?? []).map((d) => (
                  <li key={d.applicationDocumentId} className="flex flex-wrap justify-between gap-2">
                    <span>{d.documentTypeName || d.fileName}</span>
                    <span className="text-muted-foreground">{d.verificationStatus || (d.isVerified ? "Verified" : "Uploaded")}</span>
                  </li>
                ))}
              </ul>
            )}
            {r ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li className={r.cvUploaded ? "text-emerald-800" : "text-amber-900"}>
                  {r.cvUploaded ? "✓" : "○"} CV
                </li>
                <li className={r.idPassportUploaded ? "text-emerald-800" : "text-amber-900"}>
                  {r.idPassportUploaded ? "✓" : "○"} ID / Passport
                </li>
                {r.pilotLicenseRequired ? (
                  <li className={r.pilotLicenseUploaded ? "text-emerald-800" : "text-amber-900"}>
                    {r.pilotLicenseUploaded ? "✓" : "○"} Pilot licence
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Club visits ({r?.clubVisitsLogged ?? 0}/{r?.clubVisitsRequired ?? 3})
            </p>
            {(visits.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No visits logged yet.</p>
            ) : (
              <ul className="mb-3 max-h-32 space-y-1 overflow-y-auto text-sm">
                {(visits.data ?? []).map((v) => (
                  <li key={v.applicationClubVisitId}>
                    <span className="font-medium">{v.visitDate}</span> — met {v.metWith}
                    {v.notes ? <span className="text-muted-foreground"> ({v.notes})</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {canLogVisit ? (
              <form
                className="grid gap-2 sm:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  addVisit.mutate();
                }}
              >
                <label className="grid gap-1 text-xs">
                  <Label>Visit date</Label>
                  <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
                </label>
                <label className="grid gap-1 text-xs sm:col-span-2">
                  <Label>Met with</Label>
                  <Input
                    value={metWith}
                    onChange={(e) => setMetWith(e.target.value)}
                    placeholder="Reception / Manager name"
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs sm:col-span-2">
                  <Label>Notes (optional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
                <Button type="submit" size="sm" className="self-end" disabled={addVisit.isPending || !metWith.trim()}>
                  {addVisit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Log visit
                </Button>
              </form>
            ) : null}
            {canOverride && r && !r.clubVisitsMet ? (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <Input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Override reason (min. 5 characters)"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={override.isPending || overrideReason.trim().length < 5}
                  onClick={() => override.mutate()}
                >
                  Override club visits gate
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("payment")}>
              Back
            </Button>
            <Button
              type="button"
              disabled={r?.documentsReady === false}
              title={
                r?.documentsReady === false
                  ? "Required documents are still missing"
                  : undefined
              }
              onClick={() => markVerified("details", "authorize")}
            >
              Verify member details
              <ChevronRight className="size-4" />
            </Button>
            {verified.details ? (
              <span className="self-center text-xs font-medium text-emerald-800">Verified</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === "authorize" ? (
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Authorize to interview</h4>
          <ul className="space-y-1.5 text-sm">
            <li className={verified.endorsements ? "text-emerald-800" : "text-amber-900"}>
              {verified.endorsements ? "✓" : "○"} Endorsements verified by manager
            </li>
            <li className={verified.payment ? "text-emerald-800" : "text-amber-900"}>
              {verified.payment ? "✓" : "○"} Payment verified by manager
            </li>
            <li className={verified.details ? "text-emerald-800" : "text-amber-900"}>
              {verified.details ? "✓" : "○"} Member details verified by manager
            </li>
            <li className={r?.canProceedToInterview ? "text-emerald-800" : "text-amber-900"}>
              {r?.canProceedToInterview ? "✓" : "○"} System gates ready (docs, fees, visits)
              {!r?.canProceedToInterview && r?.pendingItems?.length
                ? ` — ${r.pendingItems.join("; ")}`
                : ""}
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("details")}>
              Back
            </Button>
            {statusCode === "Endorsement" && canStartReview(statusCode) ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy || !allVerified}
                onClick={() => startReview.mutate()}
              >
                {startReview.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Open manager review
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={busy || !canAuthorize}
              title={
                !allVerified
                  ? "Complete verify steps 1–3 first"
                  : r?.canProceedToInterview === false
                    ? "System checklist incomplete (documents, fees or club visits)"
                    : undefined
              }
              onClick={() => authorize.mutate()}
            >
              {authorize.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Authorize to interview
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
