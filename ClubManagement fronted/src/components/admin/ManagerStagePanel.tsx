import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Receipt } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { emptyDraft, type ApplicationDraft } from "@/services/membership/schema";
import type { ApplicationDetailAdmin } from "@/services/admin/membershipDesk";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { printHtmlDocument } from "@/utils/financeExport";
import { mergePaymentSetup, type PaymentSetup } from "@/utils/invoiceSetup";
import { buildReceiptHtml } from "@/utils/receiptDocument";
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
  annualChequeUploaded?: boolean;
  joiningChequeUploaded?: boolean;
  feeChequesUploaded?: boolean;
  pilotLicenseRequired: boolean;
  pilotLicenseUploaded: boolean;
  readyForManager: boolean;
  paymentsReady?: boolean;
  paymentsReceived?: boolean;
  memberDetailsComplete?: boolean;
  documentsReady?: boolean;
  pendingItems: string[];
  pendingPaymentItems?: string[];
  paymentLines?: {
    feeCode?: string | null;
    feeLabel?: string | null;
    amount?: number | null;
    receiptNumber?: string | null;
    paymentDate?: string | null;
    status?: string | null;
    received?: boolean | null;
  }[];
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
  transactionId?: number | null;
  amount: number;
  feeType?: string | null;
  feeTypeCode?: string | null;
  feeTypeName?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  paymentDate?: string | null;
  receiptNumber?: string | null;
  method?: string | null;
  memberName?: string | null;
  mpesaCode?: string | null;
  chequeNo?: string | null;
  chequeBankName?: string | null;
  chequeBankCode?: string | null;
  chequeDate?: string | null;
  chequeFileName?: string | null;
  chequeFileUrl?: string | null;
  referenceNote?: string | null;
};

export type EndorsementRow = {
  endorsementId?: number | null;
  endorserProfileId?: number | null;
  endorserRole?: string | null;
  endorserName?: string | null;
  endorserMembershipNo?: string | null;
  personalKnowledge?: string | null;
  professionalKnowledge?: string | null;
  valueAddition?: string | null;
  yearsKnownCandidate?: number | null;
  status?: string | null;
  declineReason?: string | null;
};

function roleKey(role?: string | null) {
  return (role ?? "").trim().toUpperCase().replace(/[\s_-]/g, "");
}

export function isDeclinedEndorsement(row?: {
  status?: string | null;
  personalKnowledge?: string | null;
} | null) {
  if (!row) return false;
  if ((row.status ?? "").toUpperCase() === "DECLINED") return true;
  return (row.personalKnowledge ?? "").toUpperCase().startsWith("DECLINED:");
}

export function isCompleteEndorsement(row?: EndorsementRow | null) {
  if (!row || isDeclinedEndorsement(row)) return false;
  return Boolean(
    row.personalKnowledge?.trim() &&
      row.professionalKnowledge?.trim() &&
      row.valueAddition?.trim(),
  );
}

export function pickActiveEndorsement(
  rows: EndorsementRow[],
  role: "PROPOSER" | "SECONDER",
  namedProfileId?: number | null,
) {
  const forRole = rows
    .filter((e) => roleKey(e.endorserRole).includes(role))
    .slice()
    .sort((a, b) => (a.endorsementId ?? 0) - (b.endorsementId ?? 0));
  const named = namedProfileId
    ? forRole.filter((e) => e.endorserProfileId === namedProfileId)
    : [];
  const latestComplete = (list: EndorsementRow[]) => {
    const complete = list.filter(isCompleteEndorsement);
    return complete.at(-1) ?? null;
  };
  return (
    latestComplete(named) ??
    latestComplete(forRole) ??
    named.filter((e) => !isDeclinedEndorsement(e)).at(-1) ??
    forRole.filter((e) => !isDeclinedEndorsement(e)).at(-1) ??
    null
  );
}

/** Manager readiness checklist row. */
function Check({
  ok,
  label,
  actionLabel,
  onAction,
  busy,
  showWhenMet,
}: {
  ok: boolean;
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
  showWhenMet?: boolean;
}) {
  const showAction = Boolean(onAction) && (showWhenMet || !ok);
  return (
    <li className={cn("flex items-center gap-2 text-sm", ok ? "text-emerald-800" : "text-amber-900")}>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          ok ? "bg-emerald-600 text-white" : "border border-amber-400 text-amber-800",
        )}
      >
        {ok ? "✓" : "○"}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {showAction ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={busy}
          onClick={onAction}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          {actionLabel ?? "Request"}
        </Button>
      ) : null}
    </li>
  );
}

function dash(value?: string | null) {
  const s = (value ?? "").trim();
  return s || "—";
}

function formatLedgerDate(value?: string | null) {
  if (!value) return "—";
  const day = value.slice(0, 10);
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPersonDate(value?: string | null) {
  if (!value) return "—";
  const day = value.slice(0, 10);
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function feeLabel(p: PaymentRow) {
  return p.feeTypeName || p.feeType || p.feeTypeCode || "Fee";
}

function paymentIsPaid(p: PaymentRow) {
  const status = p.paymentStatus || p.status || "";
  return /paid|waived|received|cleared|complete/i.test(status);
}

function paymentReference(p: PaymentRow) {
  return p.mpesaCode || p.chequeNo || p.referenceNote || "";
}

function feeKind(p: PaymentRow) {
  const hay = `${p.feeTypeCode ?? ""} ${p.feeType ?? ""} ${p.feeTypeName ?? ""}`.toUpperCase();
  if (hay.includes("ANNUAL") || hay.includes("SUBSCR")) return "ANNUAL";
  if (hay.includes("JOIN") || hay.includes("ENTRANCE")) return "JOINING";
  return hay.trim() || "OTHER";
}

type ApplicationCheque = { fileName: string; url: string };

function fileFromAttachment(file?: { fileName?: string; url?: string } | null): ApplicationCheque | null {
  const url = file?.url?.trim();
  if (!url) return null;
  return { fileName: file?.fileName?.trim() || "Cheque", url };
}

export function pickApplicationCheques(detail?: ApplicationDetailAdmin | null): {
  annual: ApplicationCheque | null;
  joining: ApplicationCheque | null;
} {
  let annual: ApplicationCheque | null = null;
  let joining: ApplicationCheque | null = null;
  if (detail?.formDataJson) {
    try {
      const parsed = JSON.parse(detail.formDataJson) as {
        personal?: {
          annualCheque?: { fileName?: string; url?: string } | null;
          joiningCheque?: { fileName?: string; url?: string } | null;
        };
      };
      annual = fileFromAttachment(parsed.personal?.annualCheque);
      joining = fileFromAttachment(parsed.personal?.joiningCheque);
    } catch {
      /* ignore */
    }
  }
  for (const doc of detail?.documents ?? []) {
    const code = (doc.documentTypeCode ?? "").toUpperCase();
    const name = doc.documentTypeName ?? "";
    const file = fileFromAttachment({ fileName: doc.fileName, url: doc.fileUrl });
    if (!file) continue;
    if (!annual && (code === "CHEQUE_ANNUAL" || /annual subscription cheque/i.test(name))) annual = file;
    if (!joining && (code === "CHEQUE_JOINING" || /joining.*cheque|entrance.*cheque/i.test(name))) joining = file;
  }
  return { annual, joining };
}

function chequeLedgerItems(cheques: { annual: ApplicationCheque | null; joining: ApplicationCheque | null }) {
  return [
    { key: "annual", label: "1. Annual subscription cheque", cheque: cheques.annual },
    { key: "joining", label: "2. Joining fee / entrance fee cheque", cheque: cheques.joining },
  ];
}

function printPaymentReceipt(args: {
  receiptNumber: string;
  applicantName: string;
  applicationNo?: string | null;
  item: string;
  amount: number;
  status: string;
  date: string;
  method?: string | null;
  reference?: string | null;
  setup?: PaymentSetup;
}) {
  const html = buildReceiptHtml({
    transactionId: 0,
    receiptId: 0,
    clubName: "Aero Club of East Africa",
    receiptNumber: args.receiptNumber,
    issuedDate: args.date,
    paymentDate: args.date,
    payerName: args.applicantName,
    payerCategory: "Applicant",
    applicationNo: args.applicationNo,
    feeType: args.item,
    paymentMethod: args.method?.trim() || "Payment",
    mpesaCode: args.reference?.trim() && args.reference.trim() !== "—" ? args.reference.trim() : null,
    amount: args.amount,
    amountInWords: "",
    currency: "KES",
    status: args.status,
    purpose: args.item,
    setup: mergePaymentSetup(args.setup),
  });
  if (!printHtmlDocument(html)) {
    toast.error("Allow pop-ups to print the receipt.");
  }
}

function EndorsementField({ label, value }: { label: string; value?: string | null }) {
  const text = (value ?? "").trim();
  if (!text) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

export function ManagerStagePanel({
  applicationId,
  detail,
  membershipTypeName,
  endorsements,
  committeeNote,
  onCommitteeNoteChange,
  onViewFull,
}: {
  applicationId: string;
  detail?: ApplicationDetailAdmin | null;
  membershipTypeName?: string | null;
  endorsements?: EndorsementRow[] | null;
  committeeNote?: string;
  onCommitteeNoteChange?: (value: string) => void;
  onViewFull?: () => void;
}) {
  const queryClient = useQueryClient();
  const user = readUser();
  const canLogVisit = hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "RECEPTIONIST"]);
  const canOverride = hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"]);
  const [visitDate, setVisitDate] = useState(kenyaTodayISO());
  const [metWith, setMetWith] = useState("");
  const [notes, setNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [viewingCheque, setViewingCheque] = useState<{
    label: string;
    fileName: string;
    url: string;
  } | null>(null);

  const readiness = useQuery({
    queryKey: ["manager-readiness", applicationId],
    queryFn: () => apiRequest<ManagerReadiness>(`/api/applications/${applicationId}/manager-readiness`),
  });

  const visits = useQuery({
    queryKey: ["club-visits", applicationId],
    queryFn: () => apiRequest<ClubVisitRow[]>(`/api/applications/${applicationId}/club-visits`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["manager-readiness", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["club-visits", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  const applicationCheques = pickApplicationCheques(detail);
  const ledgerRows = chequeLedgerItems(applicationCheques);

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

  const requestItem = useMutation({
    mutationFn: (requestType: "payment" | "documents" | "endorsements" | "details") =>
      apiRequest(`/api/applications/${applicationId}/manager-requests`, {
        method: "POST",
        body: JSON.stringify({
          requestType,
          message: requestNote.trim() || null,
        }),
      }),
    onSuccess: (_data, requestType) => {
      const copy =
        requestType === "payment"
          ? "Payment request sent to the applicant."
          : requestType === "documents"
            ? "Document request sent to the applicant."
            : requestType === "endorsements"
              ? "Sponsor request sent to the applicant and named endorsers."
              : "Details request sent to the applicant.";
      toast.success(copy);
      setRequestNote("");
      void queryClient.invalidateQueries({ queryKey: ["member-notifications"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const depositFee = useMutation({
    mutationFn: (feeCode: "JOINING" | "ANNUAL") =>
      apiRequest(`/api/applications/${applicationId}/fee-invoices`, {
        method: "POST",
        body: JSON.stringify({ feeCode }),
      }),
    onSuccess: (_data, feeCode) => {
      toast.success(
        feeCode === "JOINING"
          ? "Entrance fee invoice issued. The applicant can pay it now."
          : "Annual subscription invoice issued. The applicant can pay it now.",
      );
      void queryClient.invalidateQueries({ queryKey: ["application-dues", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["billing-queue"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const depositCheque = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/cheque-deposit`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Finance has been asked to deposit this applicant's cheque.");
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const r = readiness.data;
  let draft = emptyDraft();
  if (detail?.formDataJson) {
    try {
      const parsed = JSON.parse(detail.formDataJson) as Partial<ApplicationDraft>;
      draft = {
        ...emptyDraft(),
        ...parsed,
        personal: { ...emptyDraft().personal, ...parsed.personal },
        aviation: { ...emptyDraft().aviation, ...parsed.aviation },
        membership: { ...emptyDraft().membership, ...parsed.membership },
      };
    } catch {
      draft = emptyDraft();
    }
  }

  const displayName = detail?.applicantName?.trim() || "Applicant";
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const initials = ((nameParts[0]?.[0] ?? "") + (nameParts[1]?.[0] ?? "")).toUpperCase();
  const photoUrl = draft.personal.photo?.url;
  const className =
    membershipTypeName?.trim() ||
    draft.membership.membershipType ||
    "Membership";
  const applicationNo = detail?.applicationNo || `APP-${applicationId}`;

  const formLicenseCopy = Boolean(
    draft.aviation.licenseFile?.fileName || draft.aviation.licenseFile?.url,
  );
  const licenseOk = !r?.pilotLicenseRequired || Boolean(r?.pilotLicenseUploaded) || formLicenseCopy;

  const feeChequesOk = Boolean(r?.feeChequesUploaded) || Boolean(applicationCheques.annual && applicationCheques.joining);
  // Entrance / annual verified for manager when cheque uploaded or payment initiated.
  // Finance Paid clearance stays separate (after ballot / before signatures).
  const entranceFeeOk = Boolean(r?.entranceFeeOk) || Boolean(applicationCheques.joining);
  const annualFeeOk = Boolean(r?.annualSubscriptionOk) || Boolean(applicationCheques.annual);
  const paymentsReady = Boolean(r?.paymentsReady) || (entranceFeeOk && annualFeeOk);
  const paymentsCleared = Boolean(r?.paymentsReceived);
  const pendingItems = (r?.pendingItems ?? []).filter(
    (item) =>
      !(licenseOk && /pilot licence/i.test(item)) &&
      !(paymentsReady && /fee|cheque/i.test(item)),
  );
  const checklist = r
    ? [
        { ok: r.endorsementsComplete, label: "Proposer + Seconder", type: "endorsements" as const },
        { ok: entranceFeeOk, label: "Entrance Fee", deposit: "JOINING" as const },
        { ok: annualFeeOk, label: "Annual Fee", deposit: "ANNUAL" as const },
        { ok: r.cvUploaded, label: "CV", type: "documents" as const },
        { ok: r.idPassportUploaded, label: "ID/Passport", type: "documents" as const },
        {
          ok: feeChequesOk,
          label: "Fee cheques (uploaded)",
          deposit: "CHEQUE" as const,
          showWhenMet: true,
        },
        ...(r.pilotLicenseRequired
          ? [{ ok: licenseOk, label: "Pilot licence", type: "documents" as const }]
          : []),
        { ok: r.clubVisitsMet, label: "Club Visits", type: null },
      ]
    : [];
  const metCount = checklist.filter((c) => c.ok).length;

  const sponsorRows = endorsements ?? detail?.endorsements ?? [];
  const proposer = pickActiveEndorsement(sponsorRows, "PROPOSER", detail?.proposerProfileId);
  const seconder = pickActiveEndorsement(sponsorRows, "SECONDER", detail?.seconderProfileId);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                {initials || "—"}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight">{displayName}</p>
              <p className="text-xs text-muted-foreground">Applicant summary</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Membership type applied for
              </dt>
              <dd className="font-medium">{dash(className)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Application number
              </dt>
              <dd className="font-medium">{applicationNo}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Blood group
              </dt>
              <dd className="font-medium">{dash(draft.personal.bloodGroup)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Gender
              </dt>
              <dd className="font-medium">{dash(draft.personal.gender)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Date of birth
              </dt>
              <dd className="font-medium">{formatPersonDate(draft.personal.dateOfBirth)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Occupation
              </dt>
              <dd className="font-medium">{dash(draft.personal.occupation)}</dd>
            </div>
          </dl>
          <Button type="button" variant="secondary" className="mt-4 w-full" onClick={onViewFull}>
            View full application details &amp; CV
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Final committee note
          </p>
          <Textarea
            className="mt-2 min-h-28"
            value={committeeNote ?? ""}
            onChange={(e) => onCommitteeNoteChange?.(e.target.value)}
            placeholder="Add your final review notes to the applicant's record."
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Aviation affiliation &amp; aircraft
          </p>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pilot license
              </p>
              <p className="font-medium">
                Type: {draft.aviation.holdsLicense ? dash(draft.aviation.licenseType) : "None on file"}
              </p>
              <p className="text-muted-foreground">
                Issuer: {draft.aviation.holdsLicense ? dash(draft.aviation.licenseIssuer) : "—"}
              </p>
              {draft.aviation.holdsLicense && draft.aviation.licenseNumber ? (
                <p className="text-muted-foreground">No. {draft.aviation.licenseNumber}</p>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Aircraft ownership
              </p>
              <p className="font-medium">
                Type: {draft.aviation.ownsAircraft ? dash(draft.aviation.aircraftType) : "None on file"}
              </p>
              <p className="text-muted-foreground">
                Reg: {draft.aviation.ownsAircraft ? dash(draft.aviation.aircraftRegistration) : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {readiness.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading verification checklist…</p>
        ) : r ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Verification checklist ({metCount} of {checklist.length} met)
            </p>
            <ul className="mt-3 space-y-2">
              {checklist.map((item) => {
                const deposit = "deposit" in item ? item.deposit : undefined;
                const showWhenMet = "showWhenMet" in item ? item.showWhenMet : false;
                const requestType = "type" in item ? item.type : undefined;
                return (
                  <Check
                    key={item.label}
                    ok={item.ok}
                    label={item.label}
                    actionLabel={deposit ? "Deposit" : "Request"}
                    showWhenMet={Boolean(deposit && showWhenMet)}
                    busy={deposit ? depositFee.isPending || depositCheque.isPending : requestItem.isPending}
                    onAction={
                      deposit === "JOINING" || deposit === "ANNUAL"
                        ? () => depositFee.mutate(deposit)
                        : deposit === "CHEQUE"
                          ? () => depositCheque.mutate()
                          : requestType
                            ? () => requestItem.mutate(requestType)
                            : undefined
                    }
                  />
                );
              })}
            </ul>
            <p
              className={cn(
                "mt-3 text-sm font-medium",
                r.canProceedToInterview || (paymentsReady && r.endorsementsComplete && r.cvUploaded && r.idPassportUploaded && r.clubVisitsMet && licenseOk)
                  ? "text-emerald-800"
                  : "text-amber-900",
              )}
            >
              {r.canProceedToInterview || (paymentsReady && r.endorsementsComplete && r.cvUploaded && r.idPassportUploaded && r.clubVisitsMet && licenseOk)
                ? paymentsCleared
                  ? "Verification complete. Fees are also finance-cleared."
                  : "Verification complete for authorize. Finance clearance of cheques stays pending until after the ballot (before signatures / membership no.)."
                : r.pilotLicenseRequired && !licenseOk
                  ? "Pilot licence copy is missing. Send a document request before authorizing."
                  : `Pending: ${pendingItems.join("; ") || "complete checklist + visits"}`}
            </p>
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <Input
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="Optional note with a request to the applicant"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={requestItem.isPending}
                onClick={() => requestItem.mutate("details")}
              >
                {requestItem.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Request more details
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Financial ledger
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Manager can view uploaded cheques and payment proofs. Cheque upload verifies Entrance / Annual for authorize.
          Finance / Treasurer clearance to Paid is required later — after voting, before signatures and membership number.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 font-medium">File</th>
              <th className="pb-2 font-medium">Clearance</th>
              <th className="pb-2 text-right font-medium">Proof</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((row) => {
              const line = (r?.paymentLines ?? []).find((p) =>
                row.key === "annual"
                  ? /annual|subscri/i.test(`${p.feeCode ?? ""} ${p.feeLabel ?? ""}`)
                  : /join|entrance/i.test(`${p.feeCode ?? ""} ${p.feeLabel ?? ""}`),
              );
              const cleared = Boolean(line?.received);
              const statusLabel = cleared
                ? line?.status || "Paid"
                : line?.status
                  ? line.status
                  : row.cheque
                    ? "Pending finance clearance"
                    : "Not submitted";
              return (
                <tr key={row.key} className="border-t border-border/60">
                  <td className="py-3 pr-3 font-medium">{row.label}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{row.cheque?.fileName ?? "—"}</td>
                  <td className="py-3 pr-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        cleared
                          ? "bg-emerald-100 text-emerald-900"
                          : row.cheque || line
                            ? "bg-amber-100 text-amber-900"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {statusLabel}
                    </span>
                    {cleared && line?.receiptNumber ? (
                      <p className="mt-1 text-xs text-muted-foreground">{line.receiptNumber}</p>
                    ) : null}
                  </td>
                  <td className="py-3 text-right">
                    {row.cheque?.url ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setViewingCheque({
                            label: row.label,
                            fileName: row.cheque!.fileName,
                            url: row.cheque!.url,
                          })
                        }
                      >
                        <Receipt className="size-3.5" />
                        View cheque
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Club visits
          </p>
          {r ? (
            <p className="text-xs text-muted-foreground">
              {r.clubVisitsLogged} of {r.clubVisitsRequired} logged
              {r.clubVisitsOverride ? " · override recorded" : ""}
            </p>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Applicant visits to the club: who they met, and the reason for the visit.
        </p>
        {r?.clubVisitsOverrideReason ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Override reason: {r.clubVisitsOverrideReason}
          </p>
        ) : null}
        {visits.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading club visits…</p>
        ) : (visits.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No club visits logged for this applicant yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Applicant</th>
                  <th className="pb-2 pr-3 font-medium">Visited / met with</th>
                  <th className="pb-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {(visits.data ?? []).map((v) => (
                  <tr key={v.applicationClubVisitId} className="border-t border-border/60 align-top">
                    <td className="py-3 pr-3 whitespace-nowrap">{formatPersonDate(v.visitDate)}</td>
                    <td className="py-3 pr-3 font-medium">{displayName}</td>
                    <td className="py-3 pr-3">{dash(v.metWith)}</td>
                    <td className="py-3 whitespace-pre-wrap leading-relaxed">{dash(v.notes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canLogVisit ? (
          <form
            className="mt-4 grid gap-2 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              addVisit.mutate();
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Log a visit</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
              <Input
                value={metWith}
                onChange={(e) => setMetWith(e.target.value)}
                placeholder="Who they visited / met with"
                required
              />
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for the visit"
              className="min-h-20"
            />
            <Button type="submit" size="sm" className="w-fit" disabled={addVisit.isPending || !metWith.trim()}>
              {addVisit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Log visit
            </Button>
          </form>
        ) : null}
        {canOverride && r && !r.clubVisitsMet ? (
          <div className="mt-3 grid gap-2 border-t border-border pt-3">
            <Input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Override reason (min. 5 characters)"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              disabled={override.isPending || overrideReason.trim().length < 5}
              onClick={() => override.mutate()}
            >
              Override club visits gate
            </Button>
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proposer &amp; seconder details
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Full recommendations from the named proposer and seconder.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[
            { label: "Proposer", row: proposer, fallbackName: detail?.proposerName },
            { label: "Seconder", row: seconder, fallbackName: detail?.seconderName },
          ].map(({ label, row, fallbackName }) => {
            const name = row?.endorserName || fallbackName;
            const initialsFor =
              (name || label)
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase() || "—";
            const hasRecommendation = isCompleteEndorsement(row);
            return (
              <div key={label} className="rounded-lg border border-border/80 bg-muted/20 p-4">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {initialsFor}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-tight">{dash(name)}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Member ID: {dash(row?.endorserMembershipNo)}
                      {row?.yearsKnownCandidate != null ? ` · known ${row.yearsKnownCandidate} yrs` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {hasRecommendation ? (
                    <>
                      <EndorsementField label="Personal knowledge" value={row?.personalKnowledge} />
                      <EndorsementField label="Professional knowledge" value={row?.professionalKnowledge} />
                      <EndorsementField label="Value to the club" value={row?.valueAddition} />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recommendation on file yet.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={viewingCheque != null} onOpenChange={(open) => { if (!open) setViewingCheque(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewingCheque?.label ?? "Fee cheque"}</DialogTitle>
            <DialogDescription>
              Cheque uploaded on the application.
            </DialogDescription>
          </DialogHeader>
          {viewingCheque ? (
            <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Applicant</dt>
              <dd className="font-medium">{displayName}</dd>
              <dt className="text-muted-foreground">Application</dt>
              <dd className="font-medium">{applicationNo}</dd>
              <dt className="text-muted-foreground">Item</dt>
              <dd className="font-medium">{viewingCheque.label}</dd>
              <dt className="text-muted-foreground">Cheque file</dt>
              <dd className="font-medium">
                <a
                  href={viewingCheque.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  Open {viewingCheque.fileName || "cheque"}
                </a>
              </dd>
            </dl>
            {/\.(png|jpe?g|webp|gif|bmp)$/i.test(`${viewingCheque.fileName} ${viewingCheque.url}`) ? (
              <img
                src={viewingCheque.url}
                alt="Uploaded cheque"
                className="mt-2 max-h-64 w-full rounded-md border border-border object-contain bg-muted"
              />
            ) : null}
            </>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewingCheque(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  if (code === "Rejected") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
        <p className="font-medium">Application rejected</p>
        <p className="mt-1">The manager&apos;s reason is shown on your application home and notifications.</p>
      </div>
    );
  }
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
  if (!r.paymentsReady) {
    missing.push({ label: "Entrance / joining fee — pay or upload cheque", href: "/payment" });
    missing.push({ label: "Annual subscription fee — pay or upload cheque", href: "/payment" });
  }
  if (!r.cvUploaded) {
    missing.push({ label: "Upload your CV", href: "/documents" });
  }
  if (!r.idPassportUploaded) {
    missing.push({ label: "Upload ID / Passport copy", href: "/documents" });
  }
  if (r.annualChequeUploaded === false && !r.paymentsReady) {
    missing.push({ label: "Upload annual subscription cheque (if paying by cheque)", href: "/application" });
  }
  if (r.joiningChequeUploaded === false && !r.paymentsReady) {
    missing.push({ label: "Upload joining / entrance fee cheque (if paying by cheque)", href: "/application" });
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
            Your fees and documents are submitted. The manager can authorize interview. Finance will clear cheques after the ballot, before signatures and membership number.
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
            <span>â—‹ {item.label}</span>
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
