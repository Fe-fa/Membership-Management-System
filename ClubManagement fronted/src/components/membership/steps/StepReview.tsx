import { memo, useMemo } from "react";
import { CircleAlert, CircleCheck, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ageOn, type ApplicationDraft } from "@/services/membership/schema";
import { formatKenyaDate } from "@/utils/kenyaDate";
import { STEPS, type StepId } from "@/services/membership/steps";

type Row = { label: string; value: string };

const yn = (v: boolean | undefined) => (v ? "Yes" : "No");
const dash = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return s.trim() === "" ? "—" : s;
};

function ReviewBlock({
  step,
  rows,
  complete,
  onEdit,
}: {
  step: StepId;
  rows: Row[];
  complete: boolean;
  onEdit: (step: StepId) => void;
}) {
  const meta = STEPS.find((s) => s.key === step)!;
  return (
    <section className="surface-card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border bg-secondary/50 px-4 py-3">
        {complete ? (
          <CircleCheck className="size-4 text-success" />
        ) : (
          <CircleAlert className="size-4 text-destructive" />
        )}
        <h3 className="text-sm font-semibold">{meta.title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => onEdit(step)}
        >
          <Pencil className="size-3.5" /> Edit
        </Button>
      </header>
      <dl className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
              {row.label}
            </dt>
            <dd className="mt-0.5 text-sm break-words whitespace-pre-line">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export const StepReview = memo(function StepReview({
  draft,
  sectionStatus,
  onEdit,
  hideSteps = [],
}: {
  draft: ApplicationDraft;
  sectionStatus: Record<Exclude<StepId, "review">, boolean>;
  onEdit: (step: StepId) => void;
  hideSteps?: StepId[];
}) {
  const hidden = useMemo(() => new Set(hideSteps), [hideSteps]);

  const blocks = useMemo(() => {
    const p = draft.personal;
    const f = draft.family;
    const a = draft.aviation;
    const m = draft.membership;
    const age = ageOn(p.dateOfBirth);
    const omitSupporters = hidden.has("supporters");
    const omitConsent = hidden.has("consent");

    const supporter = (key: "proposer" | "seconder"): Row[] => {
      const s = draft.supporters[key] as Record<string, unknown>;
      return [
        { label: "Selected member", value: dash(s["name"]) },
        { label: "Membership number", value: dash(s["membershipNo"]) },
        { label: "Member since", value: dash(s["yearOfJoining"]) },
        { label: "Endorsement", value: "Pending completion on the member dashboard" },
      ];
    };

    return [
      {
        step: "personal" as StepId,
        rows: [
          {
            label: "Full name",
            value: dash([p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")),
          },
          { label: "Email", value: dash(p.email) },
          { label: "Alt. email", value: dash(p.altEmail) },
          { label: "Mobile", value: `${dash(p.telPrefix)} ${dash(p.mobile)}` },
          { label: "Tel. other", value: dash(p.telOther) },
          {
            label: "Postal address",
            value: `${dash(p.postalAddress)}, ${dash(p.city)} ${dash(p.postalCode)}, ${dash(p.country)}`,
          },
          { label: "ID / Passport", value: dash(p.idPassportNo) },
          { label: "Nationality", value: dash(p.nationality) },
          {
            label: "Date of birth",
            value: `${formatKenyaDate(p.dateOfBirth)}${age !== null ? ` (age ${age})` : ""}`,
          },
          { label: "Place of birth", value: dash(p.placeOfBirth) },
          { label: "Country of residence", value: dash(p.countryOfResidence) },
          {
            label: "Occupation",
            value: `${dash(p.occupation)} · ${dash(p.company)} · ${dash(p.role)}`,
          },
          { label: "Blood group / gender", value: `${dash(p.bloodGroup)} · ${dash(p.gender)}` },
          { label: "Photo", value: dash(p.photo?.fileName) },
          { label: "CV", value: dash(p.cv?.fileName) },
          { label: "ID / Passport copy", value: dash(p.idPassport?.fileName) },
          { label: "1. Annual subscription cheque", value: dash(p.annualCheque?.fileName) },
          { label: "2. Joining fee / entrance fee cheque", value: dash(p.joiningCheque?.fileName) },
        ],
      },
      {
        step: "family" as StepId,
        rows: [
          { label: "Married", value: yn(f.isMarried) },
          ...(f.isMarried
            ? (f.spouses ?? []).map((spouse, i) => ({
                label: (f.spouses?.length ?? 0) > 1 ? `Spouse ${i + 1}` : "Spouse",
                value: `${dash(spouse.name)} · ${dash(spouse.phone)} · ${dash(spouse.email)}`,
              }))
            : []),
          { label: "Children", value: yn(f.hasChildren) },
          ...(f.hasChildren
            ? [
                {
                  label: "Children under 18",
                  value:
                    (f.children ?? [])
                      .map((c, i) => `${i + 1}. ${dash(c.name)} — ${formatKenyaDate(c.dateOfBirth)}`)
                      .join("\n") || "—",
                },
              ]
            : []),
          { label: "Emergency contact", value: dash(f.emergencyName) },
          {
            label: "Emergency contact details",
            value: `${dash(f.emergencyPhone)} · ${dash(f.emergencyEmail)}`,
          },
        ],
      },
      {
        step: "aviation" as StepId,
        rows: [
          { label: "Affiliated with aviation", value: yn(a.isAffiliated) },
          ...(a.isAffiliated ? [{ label: "Role", value: dash(a.aviationRole) }] : []),
          { label: "Holds pilot's licence", value: yn(a.holdsLicense) },
          ...(a.holdsLicense
            ? [
                {
                  label: "Licence",
                  value: `${dash(a.licenseType)} · ${dash(a.licenseNumber)} · ${dash(a.licenseIssuer)}`,
                },
                { label: "Licence copy", value: dash(a.licenseFile?.fileName) },
              ]
            : []),
          { label: "Owns / co-owns aircraft", value: yn(a.ownsAircraft) },
          ...(a.ownsAircraft
            ? [
                {
                  label: "Aircraft",
                  value: `${dash(a.aircraftType)} · ${dash(a.aircraftRegistration)}`,
                },
                { label: "Hangar location", value: dash(a.hangarLocation) },
              ]
            : []),
        ],
      },
      {
        step: "membership" as StepId,
        rows: omitSupporters
          ? [
              { label: "Membership type", value: dash(m.membershipType) },
              { label: "Joining date", value: formatKenyaDate(m.signatureDate) },
            ]
          : [
              { label: "Membership type", value: dash(m.membershipType) },
              {
                label: "Signature / date",
                value: `${dash(m.applicantSignature)} · ${formatKenyaDate(m.signatureDate)}`,
              },
            ],
      },
      ...(omitSupporters
        ? []
        : [{ step: "supporters" as StepId, rows: supporter("proposer"), label: "Proposer" }]),
      {
        step: "clubs" as StepId,
        rows: [
          { label: "Member of another club", value: yn(draft.clubs.memberOfOtherClub) },
          {
            label: "Clubs",
            value:
              (draft.clubs.otherClubs ?? [])
                .map((c, i) => `${i + 1}. ${dash(c.name)}`)
                .join("\n") || "—",
          },
        ],
      },
      ...(omitConsent
        ? []
        : [
            {
              step: "consent" as StepId,
              rows: [
                { label: "Privacy policy accepted", value: yn(draft.consent.privacyPolicyAccepted) },
                { label: "Declaration accepted", value: yn(draft.consent.declarationAccepted) },
                { label: "Name", value: dash(draft.consent.declarationName) },
                {
                  label: "Signature / date",
                  value: `${dash(draft.consent.declarationSignature)} · ${formatKenyaDate(draft.consent.declarationDate)}`,
                },
              ],
            },
          ]),
    ];
  }, [draft, hidden]);

  const seconderRows = useMemo(() => {
    if (hidden.has("supporters")) return null;
    const s = draft.supporters.seconder as Record<string, unknown>;
    return [
      { label: "Selected member", value: dash(s["name"]) },
      { label: "Membership number", value: dash(s["membershipNo"]) },
      { label: "Member since", value: dash(s["yearOfJoining"]) },
      { label: "Endorsement", value: "Pending completion on the member dashboard" },
    ];
  }, [draft.supporters.seconder, hidden]);

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <ReviewBlock
          key={`${block.step}-${"label" in block ? block.label : ""}`}
          step={block.step}
          rows={block.rows}
          complete={sectionStatus[block.step as Exclude<StepId, "review">]}
          onEdit={onEdit}
        />
      ))}
      {seconderRows ? (
        <ReviewBlock
          step="supporters"
          rows={seconderRows}
          complete={sectionStatus["supporters"]}
          onEdit={onEdit}
        />
      ) : null}
    </div>
  );
});