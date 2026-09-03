import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleDashed,
  CreditCard,
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm text-foreground">{value}</p>
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
                    {note.channel ? ` Â· ${note.channel}` : ""}
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
                {row.receiptNumber ?? "Receipt"} Â· {row.method} Â· {row.amount}
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
      label: "1. Annual subscription cheque",
      file: draft.personal.annualCheque,
      required: Boolean(draft.personal.annualCheque),
    },
    {
      label: "2. Joining fee / entrance fee cheque",
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
        title="View & Details"
        description="Every section, document and payment recorded for your membership application."
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
              {sections.map((s, idx) => (
                <div
                  key={s.key}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5",
                    idx === 0 && "bg-primary text-primary-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      idx === 0
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : s.done
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {idx === 0 ? (
                      <CheckCircle2 className="size-4" />
                    ) : s.done ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <CircleDashed className="size-4" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      idx === 0 ? "text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {s.title}
                  </span>
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
              <CardDescription>From your application — editable from Continue form.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
              <Field label="First name" value={dash(draft.personal.firstName)} />
              <Field label="Middle name" value={dash(draft.personal.middleName)} />
              <Field label="Last name" value={dash(draft.personal.lastName)} />
              <Field label="Email" value={dash(draft.personal.email)} />
              <Field label="Alt. email" value={dash(draft.personal.altEmail)} />
              <Field label="Mobile" value={`${dash(draft.personal.telPrefix)} ${dash(draft.personal.mobile)}`} />
              <Field label="Tel. other" value={dash(draft.personal.telOther)} />
              <Field label="ID / Passport" value={dash(draft.personal.idPassportNo)} />
              <Field label="Nationality" value={dash(draft.personal.nationality)} />
              <Field label="Date of birth" value={formatKenyaDate(draft.personal.dateOfBirth)} />
              <Field label="Place of birth" value={dash(draft.personal.placeOfBirth)} />
              <Field label="Country" value={dash(draft.personal.country)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Marital &amp; family status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                <Field label="Married" value={yn(draft.family.isMarried)} />
                <Field label="Has children" value={yn(draft.family.hasChildren)} />
              </div>
              {(draft.family.spouses ?? []).length > 0 && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                  {(draft.family.spouses ?? []).map((spouse, i) => (
                    <Field
                      key={i}
                      label={`Spouse ${i + 1}`}
                      value={`${dash(spouse.name)} Â· ${dash(spouse.phone)} Â· ${dash(spouse.email)}`}
                    />
                  ))}
                </div>
              )}
              {(draft.family.children ?? []).length > 0 && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                  {(draft.family.children ?? []).map((c, i) => (
                    <Field
                      key={i}
                      label={`Child ${i + 1}`}
                      value={`${dash(c.name)} Â· ${formatKenyaDate(c.dateOfBirth)}`}
                    />
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                <Field label="Emergency contact" value={dash(draft.family.emergencyName)} />
                <Field label="Emergency phone" value={dash(draft.family.emergencyPhone)} />
                <Field label="Emergency email" value={dash(draft.family.emergencyEmail)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aviation &amp; membership</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
              <Field label="Affiliated" value={yn(draft.aviation.isAffiliated)} />
              <Field label="Aviation role" value={dash(draft.aviation.aviationRole)} />
              <Field label="Holds licence" value={yn(draft.aviation.holdsLicense)} />
              <Field label="Licence" value={`${dash(draft.aviation.licenseType)} Â· ${dash(draft.aviation.licenseNumber)}`} />
              <Field label="Issuer" value={dash(draft.aviation.licenseIssuer)} />
              <Field label="Owns aircraft" value={yn(draft.aviation.ownsAircraft)} />
              <Field label="Aircraft" value={`${dash(draft.aviation.aircraftType)} Â· ${dash(draft.aviation.aircraftRegistration)}`} />
              <Field label="Hangar" value={dash(draft.aviation.hangarLocation)} />
              <Field label="Membership type" value={dash(draft.membership.membershipType)} />
              <Field label="Applicant signature" value={`${dash(draft.membership.applicantSignature)} Â· ${formatKenyaDate(draft.membership.signatureDate)}`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Supporters &amp; consent</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
              <Field label="Proposer" value={dash(draft.supporters.proposer?.name)} />
              <Field label="Proposer since" value={dash(draft.supporters.proposer?.yearOfJoining)} />
              <Field label="Proposer phone" value={dash(draft.supporters.proposer?.phone)} />
              <Field label="Seconder" value={dash(draft.supporters.seconder?.name)} />
              <Field label="Seconder since" value={dash(draft.supporters.seconder?.yearOfJoining)} />
              <Field label="Seconder phone" value={dash(draft.supporters.seconder?.phone)} />
              <Field label="Privacy accepted" value={yn(draft.consent.privacyPolicyAccepted)} />
              <Field label="Declaration accepted" value={yn(draft.consent.declarationAccepted)} />
              <Field label="Declaration signature" value={`${dash(draft.consent.declarationSignature)} Â· ${formatKenyaDate(draft.consent.declarationDate)}`} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
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
                        className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{d.label}</p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
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

            <Card>
              <CardHeader>
                <CardTitle>Payment history</CardTitle>
                <CardDescription>Most recent transactions first.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/payment">
                    <CreditCard className="size-4" /> Open payment page
                  </Link>
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  Record and verify M-Pesa / cheque payments from the dedicated payment page — that page only handles payments, nothing else.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
