import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  CircleDashed,
  Download,
  FileText,
  Paperclip,
} from "lucide-react";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils/cn";
import { fetchApplication, apiRequest, extractErrorMessage } from "@/services/membership/api";
import { applicationQueryKey, validateSection } from "@/services/membership/useApplication";
import { emptyDraft } from "@/services/membership/schema";
import { isClubMember, readUser } from "@/lib/auth";
import { formatKenyaDate } from "@/utils/kenyaDate";
import { STEPS, type StepId } from "@/services/membership/steps";
import { toast } from "sonner";
import { ApplicantStageChecklist } from "@/components/admin/ManagerStagePanel";

function dash(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return s.trim() === "" ? "—" : s;
}

function yn(v: boolean | undefined) {
  return v ? "Yes" : "No";
}

function phoneLine(prefix?: string | null, number?: string | null) {
  const code = (prefix ?? "").trim();
  const line = (number ?? "").trim();
  if (!code && !line) return "—";
  if (!code) return line;
  if (!line) return code;
  return `${code} ${line}`;
}

/** Membership class written out: Full Member, Country, or Overseas. */
function membershipClassLabel(value?: string | null) {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (key === "full" || key.startsWith("fullmember")) return "Full Member";
  if (key.startsWith("country")) return "Country";
  if (key.startsWith("overseas")) return "Overseas";
  if (key.startsWith("life")) return "Life";
  if (key.startsWith("temporary")) return "Temporary";
  return raw;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function PersonBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
    </div>
  );
}

export function DocumentsPage() {
  if (isClubMember(readUser())) return <MemberDocumentsHub />;
  return <ApplicantDocumentsHub />;
}

function MemberDocumentsHub() {
  const docs = useQuery({
    queryKey: ["member-documents"],
    queryFn: () =>
      apiRequest<{
        dataConsentGiven: boolean;
        privacyPolicyAcceptedAt?: string | null;
        consentWithdrawnAt?: string | null;
        circulars: { title: string; kind: string; summary: string }[];
        receipts: { receiptNumber?: string; amount: number; paymentDate?: string; method?: string }[];
      }>("/api/members/me/documents"),
  });

  const notifications = useQuery({
    queryKey: ["member-notifications"],
    queryFn: () =>
      apiRequest<
        {
          notificationId: number;
          title: string;
          channel?: string | null;
          sentDate?: string | null;
          relatedEntityType?: string | null;
          relatedEntityId?: number | null;
        }[]
      >("/api/members/me/notifications"),
  });

  async function withdraw() {
    try {
      await apiRequest("/api/members/me/consent/withdraw", { method: "POST" });
      toast.success("Consent withdrawn. Prior lawful processing is unaffected.");
      await docs.refetch();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  const data = docs.data;
  const notes = notifications.data ?? [];
  return (
    <PageFrame>
      <PageHeader
        title="Notifications & Documents"
        description="Club circulars, AGM minutes, invoices and receipts, and the Members Privacy Policy."
      />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">Notifications</CardTitle>
          <CardDescription>Proposer/seconder requests and other club messages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notes.map((note) => (
              <div
                key={note.notificationId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{note.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.sentDate ? formatKenyaDate(note.sentDate.slice(0, 10)) : "—"}
                    {note.channel ? ` (${note.channel})` : ""}
                  </p>
                </div>
                {note.relatedEntityType === "APPLICATION" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/endorsements">Open request</Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {(data?.circulars ?? []).map((row) => (
          <Card key={row.title}>
            <CardHeader>
              <CardTitle>{row.title}</CardTitle>
              <CardDescription>{row.kind}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{row.summary}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Invoices & receipts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.receipts ?? []).length === 0 ? (
            <p className="text-muted-foreground">No receipts on file yet.</p>
          ) : (
            data?.receipts.map((row, i) => (
              <p key={i}>
                {[row.receiptNumber ?? "Receipt", row.method, row.amount].filter((part) => part != null && String(part).trim() !== "").join(", ")}
              </p>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Data Protection Act, 2019</CardTitle>
          <CardDescription>
            You may withdraw data-processing consent. Withdrawal does not affect processing that was
            lawful before you withdrew.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Consent on file: {data?.dataConsentGiven ? "Given" : "Not given / withdrawn"}
            {data?.consentWithdrawnAt ? ` (withdrawn ${data.consentWithdrawnAt})` : ""}
          </p>
          <Button type="button" variant="outline" onClick={() => void withdraw()}>
            Withdraw consent
          </Button>
        </CardContent>
      </Card>
    </PageFrame>
  );
}

function ApplicantDocumentsHub() {
  const { data: record } = useQuery({
    queryKey: applicationQueryKey(readUser()?.userAccountId),
    queryFn: fetchApplication,
    staleTime: 30_000,
    enabled: Boolean(readUser()?.userAccountId),
  });

  const draft = { ...emptyDraft(), ...record?.draft };
  const completed = record?.completedSteps ?? [];

  const sections = STEPS.filter((s) => s.key !== "review").map((s) => {
    const key = s.key as Exclude<StepId, "review">;
    const valid = Object.keys(validateSection(key, draft[key])).length === 0;
    return { ...s, done: completed.includes(key) && valid, valid };
  });

  const doneCount = sections.filter((s) => s.done).length;
  const overallPercent = (doneCount / Math.max(sections.length, 1)) * 100;

  const docs = [
    { label: "Passport photo", file: draft.personal.photo, required: true },
    { label: "Curriculum vitae", file: draft.personal.cv, required: true },
    { label: "ID / Passport copy", file: draft.personal.idPassport, required: true },
    {
      label: "Annual subscription cheque",
      file: draft.personal.annualCheque,
      required: Boolean(draft.personal.annualCheque),
    },
    {
      label: "Joining fee cheque",
      file: draft.personal.joiningCheque,
      required: Boolean(draft.personal.joiningCheque),
    },
    {
      label: "Pilot licence copy",
      file: draft.aviation.licenseFile,
      required: draft.aviation.holdsLicense,
    },
  ].filter((d) => d.required);

  return (
    <PageFrame>
      <PageBackLink to="/applications" label="Back to application" />
      <PageHeader
        title="Documents"
        description="Every section, file and payment saved on your membership application."
      />

      {record?.id ? (
        <ApplicantStageChecklist applicationId={record.id} statusCode={record.status} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Step progress — vertical 7-step plus Review (#8) */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-xs font-semibold tracking-widest uppercase">
                {doneCount} of {sections.length} sections complete
              </CardDescription>
            </CardHeader>
            <div className="px-5 pb-2">
              <Progress value={overallPercent} className="h-1.5" />
            </div>
            <CardContent className="space-y-1 p-2">
              {sections.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      s.done
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {s.done ? <CheckCircle2 className="size-4" /> : <CircleDashed className="size-4" />}
                  </span>
                  <span className="text-sm font-medium text-foreground">{s.title}</span>
                </div>
              ))}
              <div className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                  8
                </span>
                <span className="text-sm font-medium text-foreground">Review</span>
              </div>
            </CardContent>
            <div className="border-t border-border p-4">
              <Button asChild variant="outline" className="w-full">
                <Link to="/application">
                  <FileText className="size-4" /> Update form
                </Link>
              </Button>
            </div>
          </Card>
        </aside>

        {/* Right column: horizontal data + docs + payment */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal details</CardTitle>
              <CardDescription>Saved on your application. Use Update form to change them.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="First name" value={dash(draft.personal.firstName)} />
              <Field label="Middle name" value={dash(draft.personal.middleName)} />
              <Field label="Last name" value={dash(draft.personal.lastName)} />
              <Field label="Email" value={dash(draft.personal.email)} />
              <Field label="Alternate email" value={dash(draft.personal.altEmail)} />
              <Field label="Mobile" value={phoneLine(draft.personal.telPrefix, draft.personal.mobile)} />
              <Field label="Other telephone" value={dash(draft.personal.telOther)} />
              <Field label="ID or passport number" value={dash(draft.personal.idPassportNo)} />
              <Field label="Nationality" value={dash(draft.personal.nationality)} />
              <Field label="Date of birth" value={formatKenyaDate(draft.personal.dateOfBirth)} />
              <Field label="Place of birth" value={dash(draft.personal.placeOfBirth)} />
              <Field label="Country" value={dash(draft.personal.country)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Marital and family</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Married" value={yn(draft.family.isMarried)} />
                <Field label="Has children" value={yn(draft.family.hasChildren)} />
              </div>
              {(draft.family.spouses ?? []).map((spouse, index) => (
                <PersonBlock key={`spouse-${index}`} title={`Spouse ${index + 1}`}>
                  <Field label="Name" value={dash(spouse.name)} />
                  <Field label="Phone" value={dash(spouse.phone)} />
                  <Field label="Email" value={dash(spouse.email)} />
                </PersonBlock>
              ))}
              {(draft.family.children ?? []).map((child, index) => (
                <PersonBlock key={`child-${index}`} title={`Child ${index + 1}`}>
                  <Field label="Name" value={dash(child.name)} />
                  <Field label="Date of birth" value={formatKenyaDate(child.dateOfBirth)} />
                </PersonBlock>
              ))}
              {(draft.family.emergencyContacts ?? []).map((contact, index) => (
                <PersonBlock
                  key={`emergency-${index}`}
                  title={
                    (draft.family.emergencyContacts?.length ?? 0) > 1
                      ? `Emergency contact ${index + 1}`
                      : "Emergency contact"
                  }
                >
                  <Field label="Name" value={dash(contact.name)} />
                  <Field label="Phone" value={dash(contact.phone)} />
                  <Field label="Email" value={dash(contact.email)} />
                </PersonBlock>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aviation</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Affiliated" value={yn(draft.aviation.isAffiliated)} />
              {draft.aviation.isAffiliated ? (
                <>
                  <Field label="Licence type" value={dash(draft.aviation.licenseType)} />
                  <Field label="Licence number" value={dash(draft.aviation.licenseNumber)} />
                  <Field label="Licence issuer" value={dash(draft.aviation.licenseIssuer)} />
                  <Field label="Aircraft type" value={dash(draft.aviation.aircraftType)} />
                  <Field label="Registration" value={dash(draft.aviation.aircraftRegistration)} />
                  <Field label="Hangar" value={dash(draft.aviation.hangarLocation)} />
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Membership</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field label="Applied for" value={membershipClassLabel(draft.membership.membershipType)} />
              <Field label="Applicant signature" value={dash(draft.membership.applicantSignature)} />
              <Field label="Signature date" value={formatKenyaDate(draft.membership.signatureDate)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Proposer and seconder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PersonBlock title="Proposer">
                <Field label="Name" value={dash(draft.supporters.proposer?.name)} />
                <Field label="Member since" value={dash(draft.supporters.proposer?.yearOfJoining)} />
                <Field label="Phone" value={dash(draft.supporters.proposer?.phone)} />
              </PersonBlock>
              <PersonBlock title="Seconder">
                <Field label="Name" value={dash(draft.supporters.seconder?.name)} />
                <Field label="Member since" value={dash(draft.supporters.seconder?.yearOfJoining)} />
                <Field label="Phone" value={dash(draft.supporters.seconder?.phone)} />
              </PersonBlock>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Other clubs and consent</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Member of another club" value={yn(draft.clubs.memberOfOtherClub)} />
              <Field
                label="Club names"
                value={
                  (draft.clubs.otherClubs ?? [])
                    .map((club) => club.name?.trim())
                    .filter(Boolean)
                    .join(", ") || "—"
                }
              />
              <Field label="Privacy policy accepted" value={yn(draft.consent.privacyPolicyAccepted)} />
              <Field label="Declaration accepted" value={yn(draft.consent.declarationAccepted)} />
              <Field label="Declaration signature" value={dash(draft.consent.declarationSignature)} />
              <Field label="Declaration date" value={formatKenyaDate(draft.consent.declarationDate)} />
            </CardContent>
          </Card>

          <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>Uploaded supporting files.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {docs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    No documents required yet.
                  </div>
                ) : (
                  docs.map((d) => {
                    const uploaded = Boolean(d.file);
                    return (
                      <div
                        key={d.label}
                        className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{d.label}</p>
                          <p className="mt-0.5 break-words text-sm text-muted-foreground">
                            {uploaded ? d.file?.fileName ?? "Uploaded" : "Not uploaded yet"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                              uploaded
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-secondary text-secondary-foreground",
                            )}
                          >
                            {uploaded ? "Uploaded" : "Missing"}
                          </span>
                          {uploaded ? (
                            <Button asChild variant="outline" size="sm">
                              <a href={d.file?.url ?? "#"} target="_blank" rel="noreferrer">
                                <Paperclip className="size-3.5" /> View
                              </a>
                            </Button>
                          ) : (
                            <Button asChild variant="outline" size="sm">
                              <Link to="/application">
                                <Download className="size-3.5" /> Upload
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}
