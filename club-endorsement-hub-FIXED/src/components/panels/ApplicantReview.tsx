import { Download, ExternalLink, FileText, ImageIcon, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DOCUMENT_TYPE_LABEL,
  type ApplicationDocumentRow,
} from "@/services/admin/membershipDesk";
import { formatKenyaDate } from "@/utils/kenyaDate";
import { readUser } from "@/lib/auth";
import { API_BASE, apiRequest, extractErrorMessage } from "@/services/membership/api";
import { emptyDraft, normalizeDraft, type ApplicationDraft, type FileRef } from "@/services/membership/schema";
import { cn } from "@/utils/cn";

function dash(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return text.trim() === "" ? "—" : text;
}

function yn(value: boolean | undefined) {
  return value ? "Yes" : "No";
}

function resolveUploadUrl(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE}${path}`;
}

function isImageFile(fileName?: string, url?: string) {
  const source = `${fileName ?? ""} ${url ?? ""}`.toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|tiff)(\?|$)/.test(source);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

export function parseApplicationDraft(formDataJson?: string | null): ApplicationDraft {
  if (!formDataJson) return emptyDraft();
  try {
    return normalizeDraft({ ...emptyDraft(), ...(JSON.parse(formDataJson) as ApplicationDraft) });
  } catch {
    return emptyDraft();
  }
}

type ReviewDoc = {
  key: string;
  applicationDocumentId?: number;
  label: string;
  fileName: string;
  url?: string;
  uploaded: boolean;
  preview: boolean;
  verificationStatus?: string | null;
  verificationNotes?: string | null;
};

function collectDocuments(draft: ApplicationDraft, stored: ApplicationDocumentRow[]): ReviewDoc[] {
  const fromStored = stored.map((doc) => {
    const url = resolveUploadUrl(doc.fileUrl);
    return {
      key: `stored-${doc.applicationDocumentId}`,
      applicationDocumentId: doc.applicationDocumentId,
      label:
        doc.documentTypeName ||
        DOCUMENT_TYPE_LABEL[doc.documentTypeId] ||
        `Document ${doc.documentTypeId}`,
      fileName: doc.fileName,
      url,
      uploaded: Boolean(url || doc.fileName),
      preview: isImageFile(doc.fileName, url),
      verificationStatus: doc.verificationStatus ?? (doc.isVerified ? "Verified" : null),
      verificationNotes: doc.verificationNotes,
    };
  });

  const fromDraft: Array<{ label: string; file?: FileRef | null }> = [
    { label: DOCUMENT_TYPE_LABEL[1], file: draft.personal.photo },
    { label: DOCUMENT_TYPE_LABEL[2], file: draft.personal.cv },
    { label: DOCUMENT_TYPE_LABEL[3], file: draft.aviation.licenseFile },
  ];

  const extras = fromDraft
    .filter((item) => item.file)
    .filter(
      (item) =>
        !fromStored.some(
          (doc) =>
            doc.label === item.label ||
            doc.fileName === item.file?.fileName ||
            doc.url === resolveUploadUrl(item.file?.url),
        ),
    )
    .map((item) => {
      const url = resolveUploadUrl(item.file?.url);
      return {
        key: `draft-${item.label}`,
        label: item.label,
        fileName: item.file?.fileName ?? "Uploaded file",
        url,
        uploaded: Boolean(item.file),
        preview: isImageFile(item.file?.fileName, url) || Boolean(item.file?.contentType?.startsWith("image/")),
      };
    });

  const requiredMissing = fromDraft
    .filter((item) => item.label !== DOCUMENT_TYPE_LABEL[3] || draft.aviation.holdsLicense)
    .filter((item) => !item.file)
    .filter((item) => !fromStored.some((doc) => doc.label === item.label))
    .map((item) => ({
      key: `missing-${item.label}`,
      label: item.label,
      fileName: "Not uploaded",
      url: undefined,
      uploaded: false,
      preview: false,
    }));

  return [...fromStored, ...extras, ...requiredMissing];
}

export function ApplicantReview({
  applicationId,
  draft,
  documents = [],
}: {
  applicationId: string;
  draft: ApplicationDraft;
  documents?: ApplicationDocumentRow[];
}) {
  const docs = collectDocuments(draft, documents);
  const photo = docs.find((doc) => doc.preview && doc.url);
  const queryClient = useQueryClient();

  const verify = useMutation({
    mutationFn: ({
      applicationDocumentId,
      verified,
    }: {
      applicationDocumentId: number;
      verified: boolean;
    }) =>
      apiRequest(`/api/applications/${applicationId}/documents/${applicationDocumentId}/verify`, {
        method: "POST",
        body: JSON.stringify({
          verified,
          verifiedByUserId: readUser()?.userAccountId ?? null,
        }),
      }),
    onSuccess: (_data, variables) => {
      toast.success(variables.verified ? "Document verified." : "Document marked as not accepted.");
      void queryClient.invalidateQueries({ queryKey: ["applications", "detail", applicationId] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Passport photo</CardTitle>
            <CardDescription>Uploaded with the application.</CardDescription>
          </CardHeader>
          <CardContent>
            {photo?.url ? (
              <a href={photo.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={photo.url}
                  alt={photo.fileName}
                  className="h-56 w-full rounded-lg border border-border object-cover"
                />
              </a>
            ) : (
              <div className="grid h-56 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <ImageIcon className="size-4" />
                  No photo uploaded
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </aside>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
            <Field label="First name" value={dash(draft.personal.firstName)} />
            <Field label="Middle name" value={dash(draft.personal.middleName)} />
            <Field label="Last name" value={dash(draft.personal.lastName)} />
            <Field label="Email" value={dash(draft.personal.email)} />
            <Field label="Alt. email" value={dash(draft.personal.altEmail)} />
            <Field
              label="Mobile"
              value={`${dash(draft.personal.telPrefix)} ${dash(draft.personal.mobile)}`}
            />
            <Field label="Tel. other" value={dash(draft.personal.telOther)} />
            <Field label="ID / Passport" value={dash(draft.personal.idPassportNo)} />
            <Field label="Nationality" value={dash(draft.personal.nationality)} />
            <Field label="Date of birth" value={formatKenyaDate(draft.personal.dateOfBirth)} />
            <Field label="Place of birth" value={dash(draft.personal.placeOfBirth)} />
            <Field label="Country" value={dash(draft.personal.country)} />
            <Field label="City" value={dash(draft.personal.city)} />
            <Field label="Postal address" value={dash(draft.personal.postalAddress)} />
            <Field label="Occupation" value={dash(draft.personal.occupation)} />
            <Field label="Company" value={dash(draft.personal.company)} />
            <Field label="Role" value={dash(draft.personal.role)} />
            <Field label="Gender" value={dash(draft.personal.gender)} />
            <Field label="Blood group" value={dash(draft.personal.bloodGroup)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Family &amp; emergency contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
              <Field label="Married" value={yn(draft.family.isMarried)} />
              <Field label="Has children" value={yn(draft.family.hasChildren)} />
            </div>
            {(draft.family.spouses ?? []).length > 0 ? (
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
                {(draft.family.spouses ?? []).map((spouse, index) => (
                  <Field
                    key={`spouse-${index}`}
                    label={`Spouse ${index + 1}`}
                    value={`${dash(spouse.name)} Â· ${dash(spouse.phone)} Â· ${dash(spouse.email)}`}
                  />
                ))}
              </div>
            ) : null}
            {(draft.family.children ?? []).length > 0 ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                {(draft.family.children ?? []).map((child, index) => (
                  <Field
                    key={`child-${index}`}
                    label={`Child ${index + 1}`}
                    value={`${dash(child.name)} Â· ${formatKenyaDate(child.dateOfBirth)}`}
                  />
                ))}
              </div>
            ) : null}
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
            <Field
              label="Licence"
              value={`${dash(draft.aviation.licenseType)} Â· ${dash(draft.aviation.licenseNumber)}`}
            />
            <Field label="Issuer" value={dash(draft.aviation.licenseIssuer)} />
            <Field label="Owns aircraft" value={yn(draft.aviation.ownsAircraft)} />
            <Field
              label="Aircraft"
              value={`${dash(draft.aviation.aircraftType)} Â· ${dash(draft.aviation.aircraftRegistration)}`}
            />
            <Field label="Hangar" value={dash(draft.aviation.hangarLocation)} />
            <Field label="Membership type" value={dash(draft.membership.membershipType)} />
            <Field
              label="Applicant signature"
              value={`${dash(draft.membership.applicantSignature)} Â· ${formatKenyaDate(draft.membership.signatureDate)}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supporters, clubs &amp; consent</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
            <Field label="Proposer" value={dash(draft.supporters.proposer?.name)} />
            <Field label="Proposer since" value={dash(draft.supporters.proposer?.yearOfJoining)} />
            <Field label="Proposer phone" value={dash(draft.supporters.proposer?.phone)} />
            <Field label="Seconder" value={dash(draft.supporters.seconder?.name)} />
            <Field label="Seconder since" value={dash(draft.supporters.seconder?.yearOfJoining)} />
            <Field label="Seconder phone" value={dash(draft.supporters.seconder?.phone)} />
            <Field label="Other clubs" value={yn(draft.clubs.memberOfOtherClub)} />
            <Field
              label="Club names"
              value={
                (draft.clubs.otherClubs ?? [])
                  .map((club) => club.name)
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            <Field label="Privacy accepted" value={yn(Boolean(draft.consent.privacyPolicyAccepted))} />
            <Field label="Declaration accepted" value={yn(Boolean(draft.consent.declarationAccepted))} />
            <Field
              label="Declaration signature"
              value={`${dash(draft.consent.declarationSignature)} Â· ${formatKenyaDate(draft.consent.declarationDate)}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uploaded documents</CardTitle>
            <CardDescription>
              Open each file, then verify that it belongs to this applicant and is acceptable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents on this application.</p>
            ) : (
              docs.map((doc) => {
                const status = (doc.verificationStatus ?? "").toLowerCase();
                const verified = status === "verified";
                const rejected = status === "rejected";
                return (
                  <div
                    key={doc.key}
                    className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                        {doc.preview ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{doc.label}</p>
                        <p className="truncate text-sm text-muted-foreground">{doc.fileName}</p>
                        {doc.verificationNotes ? (
                          <p className="mt-1 text-xs text-muted-foreground">{doc.verificationNotes}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                          verified
                            ? "bg-emerald-100 text-emerald-700"
                            : rejected
                              ? "bg-rose-100 text-rose-700"
                              : doc.uploaded
                                ? "bg-amber-100 text-amber-800"
                                : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {verified ? "Verified" : rejected ? "Not accepted" : doc.uploaded ? "Needs check" : "Missing"}
                      </span>
                      {doc.url ? (
                        <>
                          <Button asChild size="sm" variant="outline">
                            <a href={doc.url} target="_blank" rel="noreferrer">
                              <ExternalLink className="size-3.5" />
                              View
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <a href={doc.url} download={doc.fileName}>
                              <Download className="size-3.5" />
                              Download
                            </a>
                          </Button>
                        </>
                      ) : null}
                      {doc.applicationDocumentId ? (
                        <>
                          <Button
                            size="sm"
                            disabled={verify.isPending || verified}
                            onClick={() =>
                              verify.mutate({
                                applicationDocumentId: doc.applicationDocumentId!,
                                verified: true,
                              })
                            }
                          >
                            {verify.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={verify.isPending || rejected}
                            onClick={() =>
                              verify.mutate({
                                applicationDocumentId: doc.applicationDocumentId!,
                                verified: false,
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
