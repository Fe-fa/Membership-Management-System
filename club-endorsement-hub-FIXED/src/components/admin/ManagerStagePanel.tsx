import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { cn } from "@/utils/cn";
import { hasAnyRole, readUser } from "@/lib/auth";

export type ManagerReadiness = {
  applicationId: number;
  statusCode?: string | null;
  endorsementsComplete: boolean;
  entranceFeeOk: boolean;
  annualSubscriptionOk: boolean;
  cvUploaded: boolean;
  idPassportUploaded: boolean;
  pilotLicenseRequired: boolean;
  pilotLicenseUploaded: boolean;
  readyForManager: boolean;
  paymentsReady?: boolean;
  documentsReady?: boolean;
  pendingItems: string[];
  pendingPaymentItems?: string[];
  clubVisitsLogged: number;
  clubVisitsRequired: number;
  clubVisitsMet: boolean;
  clubVisitsOverride: boolean;
  clubVisitsOverrideReason?: string | null;
  canProceedToInterview: boolean;
  visibleToManager: boolean;
};

export type ClubVisitRow = {
  applicationClubVisitId: number;
  visitDate: string;
  metWith: string;
  notes?: string | null;
};

export type PaymentRow = {
  amount: number;
  feeType?: string | null;
  feeTypeCode?: string | null;
  feeTypeName?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  paymentDate?: string | null;
};

export type EndorsementRow = {
  endorserRole?: string | null;
  endorserName?: string | null;
  personalKnowledge?: string | null;
  professionalKnowledge?: string | null;
  valueAddition?: string | null;
  yearsKnownCandidate?: number | null;
};

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cn("flex items-start gap-2 text-sm", ok ? "text-emerald-800" : "text-amber-900")}>
      <span className="mt-0.5 font-semibold">{ok ? "✓" : "○"}</span>
      <span>{label}</span>
    </li>
  );
}

export function ManagerStagePanel({
  applicationId,
  endorsements,
}: {
  applicationId: string;
  endorsements?: EndorsementRow[] | null;
}) {
  const queryClient = useQueryClient();
  const user = readUser();
  const canLogVisit = hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "RECEPTIONIST"]);
  const canOverride = hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"]);
  const [visitDate, setVisitDate] = useState(kenyaTodayISO());
  const [metWith, setMetWith] = useState("");
  const [notes, setNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const readiness = useQuery({
    queryKey: ["manager-readiness", applicationId],
    queryFn: () => apiRequest<ManagerReadiness>(`/api/applications/${applicationId}/manager-readiness`),
  });

  const visits = useQuery({
    queryKey: ["club-visits", applicationId],
    queryFn: () => apiRequest<ClubVisitRow[]>(`/api/applications/${applicationId}/club-visits`),
  });

  const payments = useQuery({
    queryKey: ["application-payments", applicationId],
    queryFn: () => apiRequest<PaymentRow[]>(`/api/applications/${applicationId}/payments`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["manager-readiness", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["club-visits", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
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

  const r = readiness.data;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Stage A — Notification</h3>
        <p className="text-sm text-muted-foreground">
          After both endorsements, entrance and annual fees must be paid (or initiated). The manager then
          verifies documents, sponsor recommendations, payment and at least{" "}
          {r?.clubVisitsRequired ?? 3} club visits (who accompanied the applicant), then authorizes to
          interview.
        </p>
      </div>

      {readiness.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Stage A checklist…</p>
      ) : r ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Verification checklist
            </p>
            <ul className="space-y-1.5">
              <Check ok={r.endorsementsComplete} label="Proposer + seconder recommendations" />
              <Check ok={r.entranceFeeOk} label="Entrance / joining fee" />
              <Check ok={r.annualSubscriptionOk} label="Annual subscription fee" />
              <Check ok={r.cvUploaded} label="CV uploaded" />
              <Check ok={r.idPassportUploaded} label="ID / Passport copy uploaded" />
              {r.pilotLicenseRequired ? (
                <Check ok={r.pilotLicenseUploaded} label="Pilot licence copy uploaded" />
              ) : null}
              <Check
                ok={r.clubVisitsMet}
                label={`Club visits ≥${r.clubVisitsRequired} (who they met)`}
              />
            </ul>
            <p
              className={cn(
                "mt-2 text-sm font-medium",
                r.canProceedToInterview
                  ? "text-emerald-800"
                  : !r.paymentsReady
                    ? "text-amber-900"
                    : "text-amber-900",
              )}
            >
              {r.canProceedToInterview
                ? "Verification complete — manager may authorize to Interview."
                : !r.paymentsReady
                  ? `Applicant must pay: ${r.pendingPaymentItems?.join(", ") || "entrance and annual fees"}.`
                  : `Pending before interview: ${r.pendingItems.join("; ") || "complete checklist + visits"}`}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Club visits ({r.clubVisitsLogged}/{r.clubVisitsRequired})
            </p>
            {r.clubVisitsOverride ? (
              <p className="text-sm text-amber-900">
                Override active: {r.clubVisitsOverrideReason || "Reason on file"}
              </p>
            ) : null}
            <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
              {(visits.data ?? []).length === 0 ? (
                <li className="text-muted-foreground">No visits logged yet.</li>
              ) : (
                (visits.data ?? []).map((v) => (
                  <li key={v.applicationClubVisitId} className="border-b border-border/60 py-1">
                    <span className="font-medium">{v.visitDate}</span> — met {v.metWith}
                    {v.notes ? <span className="text-muted-foreground"> ({v.notes})</span> : null}
                  </li>
                ))
              )}
            </ul>
            {canLogVisit ? (
              <form
                className="mt-2 grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addVisit.mutate();
                }}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs">
                    <Label>Visit date</Label>
                    <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <Label>Met with</Label>
                    <Input
                      value={metWith}
                      onChange={(e) => setMetWith(e.target.value)}
                      placeholder="Reception / Manager name"
                      required
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-xs">
                  <Label>Notes (optional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
                <Button type="submit" size="sm" disabled={addVisit.isPending || !metWith.trim()}>
                  {addVisit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Log visit
                </Button>
              </form>
            ) : null}
            {canOverride && !r.clubVisitsMet ? (
              <div className="mt-2 space-y-2 border-t border-border pt-2">
                <label className="grid gap-1 text-xs">
                  <Label>Admin override reason</Label>
                  <Input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Why interview may proceed without 3 visits"
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={override.isPending || overrideReason.trim().length < 5}
                  onClick={() => override.mutate()}
                >
                  {override.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Override club visits gate
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payments
          </p>
          {(payments.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(payments.data ?? []).map((p, i) => (
                <li key={`${p.feeType ?? p.feeTypeCode}-${i}`}>
                  {p.feeTypeName || p.feeType || p.feeTypeCode || "Fee"} — {p.paymentStatus || p.status || "—"} —{" "}
                  {Number(p.amount).toLocaleString("en-KE", { style: "currency", currency: "KES" })}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proposer &amp; seconder recommendations
          </p>
          {(endorsements ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No endorsement statements yet.</p>
          ) : (
            <div className="max-h-48 space-y-3 overflow-y-auto text-sm">
              {(endorsements ?? []).map((e, i) => (
                <div key={`${e.endorserRole}-${i}`} className="border-b border-border/60 pb-2">
                  <p className="font-medium">
                    {e.endorserRole || "Endorser"}
                    {e.endorserName ? ` — ${e.endorserName}` : ""}
                    {e.yearsKnownCandidate != null ? ` (known ${e.yearsKnownCandidate} yrs)` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Personal:</span>{" "}
                    {e.personalKnowledge || "—"}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Professional:</span>{" "}
                    {e.professionalKnowledge || "—"}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Value:</span> {e.valueAddition || "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Applicant-facing Stage A checklist: what blocks Submit to Manager. */
export function ApplicantStageChecklist({
  applicationId,
  statusCode,
  compact = false,
}: {
  applicationId?: number | string | null;
  statusCode?: string | null;
  compact?: boolean;
}) {
  const id = applicationId != null && applicationId !== "" ? String(applicationId) : null;
  const readiness = useQuery({
    queryKey: ["manager-readiness", id],
    queryFn: () => apiRequest<ManagerReadiness>(`/api/applications/${id}/manager-readiness`),
    enabled: Boolean(id),
  });

  if (!id) return null;
  if (readiness.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Checking what the manager still needs…
      </div>
    );
  }

  const r = readiness.data;
  if (!r) return null;

  const code = (statusCode ?? r.statusCode ?? "").trim();
  const closed = ["Approved", "Rejected", "Withdrawn", "Draft"].includes(code);
  if (closed) return null;

  // Past interview authorization — no Stage A nag.
  if (["Interview", "InterviewReview", "Waitlist", "ElectionReview", "Committee", "CommitteeReview"].includes(code)
    && r.canProceedToInterview) {
    return null;
  }

  const missing: { label: string; href?: string }[] = [];
  if (!r.endorsementsComplete) {
    missing.push({ label: "Proposer and seconder must both submit their recommendations" });
  }
  if (!r.entranceFeeOk) {
    missing.push({ label: "Entrance / joining fee — pay or initiate", href: "/payment" });
  }
  if (!r.annualSubscriptionOk) {
    missing.push({ label: "Annual subscription fee — pay or initiate", href: "/payment" });
  }
  if (!r.cvUploaded) {
    missing.push({ label: "Upload your CV", href: "/documents" });
  }
  if (!r.idPassportUploaded) {
    missing.push({ label: "Upload ID / Passport copy", href: "/documents" });
  }
  if (r.pilotLicenseRequired && !r.pilotLicenseUploaded) {
    missing.push({ label: "Upload pilot licence copy", href: "/documents" });
  }

  if (missing.length === 0) {
    if (r.readyForManager) {
      return (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p className="font-medium">Ready for the General Manager</p>
          <p className="mt-1">
            Your fees and documents are in. The manager has been (or will be) notified to verify your
            application and authorize the interview stage.
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 text-amber-950",
        compact ? "px-3 py-2 text-sm" : "px-4 py-3 text-sm",
      )}
    >
      <p className="font-semibold">
        {r.endorsementsComplete
          ? "Action needed — manager has not received your application yet"
          : "Complete these items for the manager Notification queue (Stage A)"}
      </p>
      <p className="mt-1 text-amber-900/90">
        {r.endorsementsComplete
          ? "Both sponsors have submitted. The manager is notified only after the items below are done."
          : "Until these are complete, your application will not appear on the manager’s Notification queue."}
      </p>
      <ul className="mt-2 space-y-1.5">
        {missing.map((item) => (
          <li key={item.label} className="flex flex-wrap items-baseline gap-x-2">
            <span>○ {item.label}</span>
            {item.href ? (
              <Link to={item.href} className="font-medium underline underline-offset-2">
                Go there
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
