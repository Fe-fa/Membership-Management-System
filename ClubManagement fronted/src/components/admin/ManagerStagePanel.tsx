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
import { formatKes } from "@/utils/format";
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
  endorserRole?: string | null;
  endorserName?: string | null;
  endorserMembershipNo?: string | null;
  personalKnowledge?: string | null;
  professionalKnowledge?: string | null;
  valueAddition?: string | null;
  yearsKnownCandidate?: number | null;
};

function Check({
  ok,
  label,
  requestLabel,
  onRequest,
  requesting,
}: {
  ok: boolean;
  label: string;
  requestLabel?: string;
  onRequest?: () => void;
  requesting?: boolean;
}) {
  return (
    <li className={cn("flex items-center gap-2 text-sm", ok ? "text-emerald-800" : "text-amber-900")}>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          ok ? "bg-emerald-600 text-white" : "border border-amber-400 text-amber-800",
        )}
      >
        {ok ? "âœ“" : "â—‹"}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {!ok && onRequest ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={requesting}
          onClick={onRequest}
        >
          {requesting ? <Loader2 className="size-3 animate-spin" /> : null}
          {requestLabel ?? "Request"}
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

function roleKey(role?: string | null) {
  return (role ?? "").trim().toUpperCase();
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
}) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
  if (!win) {
    toast.error("Allow pop-ups to print the receipt.");
    return;
  }
  const reference = escapeHtml(args.reference?.trim() || "—");
  const method = escapeHtml(args.method?.trim() || "—");
  const receiptNumber = escapeHtml(args.receiptNumber);
  const applicantName = escapeHtml(args.applicantName);
  const item = escapeHtml(args.item);
  const status = escapeHtml(args.status);
  const date = escapeHtml(args.date);
  const applicationNo = args.applicationNo ? escapeHtml(args.applicationNo) : "";
  win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${receiptNumber} — Aero Club of East Africa</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 40px; }
      h1 { font-size: 20px; margin: 0; }
      .muted { color: #555; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; margin-top: 24px; }
      th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #ddd; font-size: 14px; }
      .amount { font-size: 18px; font-weight: 700; }
      .foot { margin-top: 36px; font-size: 12px; color: #555; }
    </style>
  </head>
  <body>
    <h1>Aero Club of East Africa</h1>
    <p class="muted">Official payment receipt</p>
    <table>
      <tr><th>Receipt</th><td>${receiptNumber}</td></tr>
      <tr><th>Received from</th><td>${applicantName}</td></tr>
      ${applicationNo ? `<tr><th>Application</th><td>${applicationNo}</td></tr>` : ""}
      <tr><th>Item</th><td>${item}</td></tr>
      <tr><th>Date</th><td>${date}</td></tr>
      <tr><th>Method</th><td>${method}</td></tr>
      <tr><th>Reference</th><td>${reference}</td></tr>
      <tr><th>Status</th><td>${status}</td></tr>
      <tr><th>Amount</th><td class="amount">${escapeHtml(formatKes(args.amount))}</td></tr>
    </table>
    <p class="foot">Applicant payment receipt. Keep this copy with the application record.</p>
  </body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
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
  const feeChequesOk = Boolean(applicationCheques.annual && applicationCheques.joining);

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

  const joiningChequeOk = Boolean(r?.joiningChequeUploaded) || Boolean(applicationCheques.joining);
  const annualChequeOk = Boolean(r?.annualChequeUploaded) || Boolean(applicationCheques.annual);
  const entranceFeeOk = Boolean(r?.entranceFeeOk) || joiningChequeOk;
  const annualFeeOk = Boolean(r?.annualSubscriptionOk) || annualChequeOk;
  const paymentsRepresented = entranceFeeOk && annualFeeOk;
  const pendingItems = (r?.pendingItems ?? []).filter(
    (item) =>
      !(licenseOk && /pilot licence/i.test(item)) &&
      !(paymentsRepresented && /fee|cheque/i.test(item)),
  );
  const checklist = r
    ? [
        { ok: r.endorsementsComplete, label: "Proposer + Seconder", type: "endorsements" as const },
        { ok: entranceFeeOk, label: "Entrance Fee", type: "payment" as const },
        { ok: annualFeeOk, label: "Annual Fee", type: "payment" as const },
        { ok: r.cvUploaded, label: "CV", type: "documents" as const },
        { ok: r.idPassportUploaded, label: "ID/Passport", type: "documents" as const },
        {
          ok: Boolean(r.feeChequesUploaded) || feeChequesOk,
          label: "Fee cheques",
          type: "documents" as const,
        },
        ...(r.pilotLicenseRequired
          ? [{ ok: licenseOk, label: "Pilot licence", type: "documents" as const }]
          : []),
        { ok: r.clubVisitsMet, label: "Club Visits", type: null },
      ]
    : [];
  const metCount = checklist.filter((c) => c.ok).length;

  const sponsorRows = endorsements ?? detail?.endorsements ?? [];
  const proposer =
    sponsorRows.find((e) => roleKey(e.endorserRole).includes("PROPOSER")) ??
    sponsorRows[0] ??
    null;
  const seconder =
    sponsorRows.find((e) => roleKey(e.endorserRole).includes("SECONDER")) ??
    (sponsorRows.length > 1 ? sponsorRows[1] : null);

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
              {checklist.map((item) => (
                <Check
                  key={item.label}
                  ok={item.ok}
                  label={item.label}
                  requesting={requestItem.isPending}
                  onRequest={
                    item.type
                      ? () => requestItem.mutate(item.type)
                      : undefined
                  }
                />
              ))}
            </ul>
            <p
              className={cn(
                "mt-3 text-sm font-medium",
                (r.canProceedToInterview || (paymentsRepresented && r.endorsementsComplete && r.cvUploaded && r.idPassportUploaded && r.clubVisitsMet && licenseOk)) && feeChequesOk
                  ? "text-emerald-800"
                  : "text-amber-900",
              )}
            >
              {(r.canProceedToInterview || (paymentsRepresented && r.endorsementsComplete && r.cvUploaded && r.idPassportUploaded && r.clubVisitsMet && licenseOk)) && feeChequesOk
                ? "Verification complete. All requirements verified."
                : !feeChequesOk
                  ? "Upload annual subscription and joining / entrance fee cheques on the application before authorizing."
                  : !paymentsRepresented
                  ? `Applicant must pay: ${r.pendingPaymentItems?.join(", ") || "entrance and annual fees"}.`
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
          Uploaded annual and joining / entrance cheques count as payment. Authorize needs both files attached.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 font-medium">File</th>
              <th className="pb-2 text-right font-medium">Cheque</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((row) => (
              <tr key={row.key} className="border-t border-border/60">
                <td className="py-3 pr-3 font-medium">{row.label}</td>
                <td className="py-3 pr-3 text-muted-foreground">{row.cheque?.fileName ?? "—"}</td>
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
                    <span className="text-xs text-muted-foreground">Not uploaded</span>
                  )}
                </td>
              </tr>
            ))}
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
            const hasRecommendation = Boolean(
              row &&
                [row.personalKnowledge, row.professionalKnowledge, row.valueAddition].some(
                  (part) => (part ?? "").trim(),
                ),
            );
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
  if (r.annualChequeUploaded === false) {
    missing.push({ label: "Upload annual subscription cheque", href: "/application" });
  }
  if (r.joiningChequeUploaded === false) {
    missing.push({ label: "Upload joining / entrance fee cheque", href: "/application" });
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
