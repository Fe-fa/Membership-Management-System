import type { ApplicationDraft, FileRef } from "./schema";
import { emptyDraft, normalizeDraft } from "./schema";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { authHeaders, readUser } from "@/lib/auth";

import { API_BASE, TENANT_CODE } from "@/config/env";
export { API_BASE };

const DRAFT_KEY = "acea.application.draft.v1";
const RECORD_KEY = "acea.application.record.v1";

export type ApplicationStatus =
  | "Draft"
  | "Submitted"
  | "UnderReview"
  | "Waitlist"
  | "Approved"
  | "Rejected"
  | "Withdrawn";

export type ApplicationRecord = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  submittedAt: string | null;
  updatedAt: string;
  completedSteps: string[];
  draft: ApplicationDraft;
};

/** Shape returned by ApplicationsController (ApplicationDetailDto + form payload). */
type ApplicationDetailDto = {
  applicationId: number | string;
  applicationNo: string;
  applicationStatusId?: number;
  statusCode?: string;
  submittedAt?: string | null;
  updatedAt?: string | null;
  completedSteps?: string[] | null;
  formDataJson?: string | null;
  /** Present when the backend links an applicant profile; used to avoid re-creating one. */
  applicantProfileId?: number | string | null;
};

const isBrowser = typeof window !== "undefined";

function readLocal<T>(key: string): T | null {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — draft simply isn't cached */
  }
}

/**
 * Error thrown by `apiRequest` for any non-2xx response.
 *
 * `.message` always holds the **human-readable** reason the backend gave, so
 * toasts/UI can render it directly. The original body and HTTP status are
 * preserved on `.bodyText` / `.status` for callers that need them.
 *
 * The backend may respond with any of these shapes:
 *   1. `{ "message": "…" }` — produced by `BadRequest(new { message = ex.Message })`
 *      in `ApplicationsController.Submit`, and the source of the
 *      `{"message":"Applicant should visit the club at least three times before joining."}`
 *      string the wizard was previously rendering verbatim.
 *   2. `{ "messages": ["…", "…"] }` — ASP.NET Core's `BadRequest(ModelState)`.
 *   3. RFC 7807 `ProblemDetails`: `{ "title"|"detail": "…" }`.
 *   4. Plain text.
 */
export class ApiError extends Error {
  status: number;
  bodyText: string;

  constructor(message: string, status: number, bodyText: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

function parseApiError(text: string, status: number): ApiError {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const pickString = (...keys: string[]): string | null => {
        for (const k of keys) {
          const v = obj[k];
          if (typeof v === "string" && v.trim().length > 0) return v;
        }
        return null;
      };
      const msg =
        pickString("message", "detail", "title", "error") ??
        (Array.isArray(obj["messages"])
          ? (obj["messages"] as unknown[])
              .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
              .join(" ")
          : null) ??
        (Array.isArray(obj["errors"])
          ? (obj["errors"] as unknown[])
              .map((e) =>
                e &&
                typeof e === "object" &&
                typeof (e as Record<string, unknown>)["message"] === "string"
                  ? ((e as Record<string, string>)["message"] as string)
                  : null,
              )
              .filter((s): s is string => Boolean(s))
              .join(" ")
          : null);
      if (msg) return new ApiError(msg, status, text);
    } catch {
      /* not JSON — fall through */
    }
  }
  return new ApiError(trimmed || `Request failed (${status})`, status, text);
}

/**
 * Best-effort extraction of a human-readable message from anything thrown by
 * `apiRequest` (or a plain JS error). Use this anywhere the UI wants to toast
 * a server failure.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const auth = authHeaders();
  const authorization = auth["Authorization"];
  if (authorization) headers.set("Authorization", authorization);
  if (!headers.has("X-Tenant-Code")) headers.set("X-Tenant-Code", TENANT_CODE);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) throw parseApiError(await res.text(), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const STATUS_BY_ID: Record<number, ApplicationStatus> = {
  1: "Draft",
  2: "Submitted",
  3: "UnderReview",
  4: "Approved",
  5: "Rejected",
  6: "Waitlist",
  7: "Withdrawn",
};

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function toRecord(dto: ApplicationDetailDto, fallbackDraft?: ApplicationDraft): ApplicationRecord {
  let draft = fallbackDraft as ApplicationDraft;
  if (dto.formDataJson) {
    try {
      draft = JSON.parse(dto.formDataJson) as ApplicationDraft;
    } catch {
      /* keep fallback */
    }
  }
  return {
    id: String(dto.applicationId),
    reference: dto.applicationNo,
    status:
      (dto.statusCode as ApplicationStatus | undefined) ??
      STATUS_BY_ID[Number(dto.applicationStatusId ?? 1)] ??
      "Draft",
    submittedAt: dto.submittedAt ?? null,
    updatedAt: dto.updatedAt ?? new Date().toISOString(),
    completedSteps: dto.completedSteps ?? [],
    draft: normalizeDraft({ ...emptyDraft(), ...(draft ?? {}) }),
  };
}

export async function fetchApplication(): Promise<ApplicationRecord | null> {
  if (API_BASE) {
    try {
      const dto = await apiRequest<ApplicationDetailDto | undefined>("/api/applications/current");
      if (!dto?.applicationId) return null;
      return toRecord(dto);
    } catch {
      return null;
    }
  }
  const user = readUser();
  if (!user) return null;
  return (
    readLocal<ApplicationRecord>(`acea.application.record.${user.userAccountId}`) ??
    readLocal<ApplicationRecord>(`acea.application.draft.${user.userAccountId}`)
  );
}

function draftPayload(draft: ApplicationDraft, completedSteps: string[]) {
  return {
    formDataJson: JSON.stringify(draft),
    completedSteps,
    electionTypeId: 1,
    proposerProfileId: draft.supporters?.proposer?.memberProfileId
      ? Number(draft.supporters.proposer.memberProfileId)
      : null,
    seconderProfileId: draft.supporters?.seconder?.memberProfileId
      ? Number(draft.supporters.seconder.memberProfileId)
      : null,
  };
}

export async function saveDraft(payload: {
  draft: ApplicationDraft;
  completedSteps: string[];
}): Promise<ApplicationRecord> {
  if (API_BASE) {
    const body = {
      ...draftPayload(payload.draft, payload.completedSteps),
      applicantProfileId: readUser()?.profileId ?? null,
    };
    const current = await fetchApplication();
    const dto = current?.id
      ? await apiRequest<ApplicationDetailDto>(`/api/applications/${current.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
      : await apiRequest<ApplicationDetailDto>("/api/applications", {
          method: "POST",
          body: JSON.stringify({ ...body, applicationStatusId: 1 }),
        });
    return toRecord(dto, payload.draft);
  }

  const user = readUser();
  const recordKey = user ? `acea.application.record.${user.userAccountId}` : RECORD_KEY;
  const existing = readLocal<ApplicationRecord>(recordKey);
  const record: ApplicationRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    reference: existing?.reference ?? makeReference(),
    status: existing?.status === "Submitted" ? "Submitted" : "Draft",
    submittedAt: existing?.submittedAt ?? null,
    updatedAt: new Date().toISOString(),
    completedSteps: payload.completedSteps,
    draft: payload.draft,
  };
  writeLocal(recordKey, record);
  return record;
}

const DOCUMENT_TYPE_BY_PURPOSE: Record<string, number> = {
  photo: 1,
  cv: 2,
  license: 3,
  idPassport: 4,
};

/** Parse a numeric profile id picked from the register; null when not selectable. */
function asProfileId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Creates the applicant profile on first submit, or updates the existing one on
 * every subsequent submit/retry — instead of creating a brand-new profile (and
 * silently orphaning the previous one) every time this function runs.
 */
async function ensureApplicantProfile(draft: ApplicationDraft): Promise<number> {
  const profileId = readUser()?.profileId;
  if (!profileId) {
    throw new Error("Sign in to continue your application.");
  }

  const p = draft.personal;
  const body = JSON.stringify({
    firstName: p.firstName,
    middleName: p.middleName || null,
    lastName: p.lastName,
    genderName: p.gender || null,
    bloodGroupName: p.bloodGroup || null,
    maritalStatusName: draft.family.isMarried ? "Married" : "Single",
    dateOfBirth: p.dateOfBirth || null,
    nationalityName: p.nationality || null,
    countryOfResidenceName: p.countryOfResidence || null,
    countryName: p.country || null,
    postalAddress: p.postalAddress,
    city: p.city,
    stateCountry: p.stateCountry || null,
    postalCode: p.postalCode || null,
    email: p.email,
    altEmail: p.altEmail || null,
    telIntlPrefix: p.telPrefix,
    mobile: p.mobile,
    telOther: p.telOther || null,
    idPassportNo: p.idPassportNo,
    placeOfBirth: p.placeOfBirth,
    occupation: p.occupation,
    company: p.company || null,
    role: p.role || null,
    photoUrl: p.photo?.url || null,
    dataConsentGiven: Boolean(draft.consent.declarationAccepted),
    privacyPolicyAcceptedAt: draft.consent.privacyPolicyAccepted ? new Date().toISOString() : null,
  });

  await apiRequest(`/api/profiles/${profileId}`, { method: "PUT", body });
  return profileId;
}
async function submitApplicationRemote(
  draft: ApplicationDraft,
  completedSteps: string[],
): Promise<ApplicationRecord> {
  const p = draft.personal;
  const profileId = await ensureApplicantProfile(draft);
  
  const current = await fetchApplication();
  const supporter = draft.supporters;
  const saveBody = {
    formDataJson: JSON.stringify(draft),
    completedSteps,
    electionTypeId: 1,
    applicantProfileId: profileId,
    proposerProfileId: asProfileId(supporter.proposer.memberProfileId),
    seconderProfileId: asProfileId(supporter.seconder.memberProfileId),
  };
  const saved = current?.id
    ? await apiRequest<ApplicationDetailDto>(`/api/applications/${current.id}`, {
        method: "PUT",
        body: JSON.stringify(saveBody),
      })
    : await apiRequest<ApplicationDetailDto>("/api/applications", {
        method: "POST",
        body: JSON.stringify({ ...saveBody, applicationStatusId: 1 }),
      });
  const applicationId = String(saved.applicationId);

  // 3. Register attachment metadata and supporter endorsements in parallel.
  // The binary files are already uploaded when chosen in the form; the submit
  // step only links those uploaded files to the application record.
  const timings: Record<string, number> = {};
  const relatedWritesStartedAt = nowMs();
  const attachments: Array<[string, FileRef | null | undefined]> = [
    ["photo", p.photo],
    ["cv", p.cv],
    ["idPassport", p.idPassport],
    ["chequeAnnual", p.annualCheque],
    ["chequeJoining", p.joiningCheque],
    ["license", draft.aviation.licenseFile],
  ];
  const attachmentPromise = Promise.all(
    attachments.map(async ([purpose, file]) => {
      if (!file || !file.fileName) {
        return { purpose, applicationDocumentId: null as number | null };
      }
      const doc = await apiRequest<{ applicationDocumentId?: number }>(
        `/api/applications/${applicationId}/documents`,
        {
          method: "POST",
          body: JSON.stringify({
            documentTypeId: DOCUMENT_TYPE_BY_PURPOSE[purpose] ?? 0,
            purpose,
            fileName: file.fileName,
            fileUrl: file.url ?? file.fileName,
          }),
        },
      );
      return {
        purpose,
        applicationDocumentId: doc?.applicationDocumentId ?? null,
      };
    }),
  );

  // Proposer/seconder are named on the application (profile ids). Do not create
  // Endorsement rows here — those are completed later by the member on /endorsements.
  const [registeredAttachments] = await Promise.all([attachmentPromise]);
  timings["relatedWritesMs"] = Math.round(nowMs() - relatedWritesStartedAt);

  const licenseDocumentId =
    registeredAttachments.find((entry) => entry.purpose === "license")?.applicationDocumentId ?? null;

  // 4. Persist the relational slices (family, aviation, clubs, signatures) once
  // the attachment ids are available.
  const detailsStartedAt = nowMs();
  await apiRequest(`/api/applications/${applicationId}/details`, {
    method: "PUT",
    body: JSON.stringify({
      profileId,
      family: {
        isMarried: draft.family.isMarried,
        spouses: (draft.family.spouses ?? [])
          .filter((s) => s.name)
          .map((s) => ({
            name: s.name ?? "",
            phone: s.phone || null,
            email: s.email || null,
          })),
        hasChildren: draft.family.hasChildren,
        children: (draft.family.children ?? []).map((c) => ({
          name: c.name ?? "",
          dateOfBirth: c.dateOfBirth ?? null,
        })),
        emergencyName: draft.family.emergencyName || null,
        emergencyPhone: draft.family.emergencyPhone || null,
        emergencyEmail: draft.family.emergencyEmail || null,
      },
      aviation: {
        isAffiliated: draft.aviation.isAffiliated,
        aviationRole: draft.aviation.aviationRole || null,
        holdsLicense: draft.aviation.holdsLicense,
        licenseType: draft.aviation.licenseType || null,
        licenseNumber: draft.aviation.licenseNumber || null,
        licenseIssuer: draft.aviation.licenseIssuer || null,
        ownsAircraft: draft.aviation.ownsAircraft,
        aircraftType: draft.aviation.aircraftType || null,
        aircraftRegistration: draft.aviation.aircraftRegistration || null,
        hangarLocation: draft.aviation.hangarLocation || null,
      },
      clubs: {
        memberOfOtherClub: draft.clubs.memberOfOtherClub,
        otherClubs: (draft.clubs.otherClubs ?? []).map((c) => ({ name: c.name ?? "" })),
      },
      signature: {
        name: draft.membership.applicantSignature || null,
        signedAt: draft.membership.signatureDate || null,
      },
      declarationSignature: {
        name: draft.consent.declarationName || null,
        signedAt: draft.consent.declarationDate || null,
      },
      licenseDocumentId,
    }),
  });
  timings["detailsMs"] = Math.round(nowMs() - detailsStartedAt);

  // 5. Flip the status to Submitted.
  const submitStartedAt = nowMs();
  const submitted = await apiRequest<ApplicationDetailDto>(
    `/api/applications/${applicationId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ submittedAt: `${kenyaTodayISO()}T00:00:00+03:00` }),
    },
  );
  timings["submitEndpointMs"] = Math.round(nowMs() - submitStartedAt);
  console.info("[membership] submit timing", timings);
  return toRecord(submitted, draft);
}

export async function submitApplication(
  draft: ApplicationDraft,
  completedSteps: string[] = [],
): Promise<ApplicationRecord> {
  if (API_BASE) {
    return submitApplicationRemote(draft, completedSteps);
  }

  const existing = readLocal<ApplicationRecord>(DRAFT_KEY);
  const record: ApplicationRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    reference: existing?.reference ?? makeReference(),
    status: "Submitted",
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedSteps: existing?.completedSteps ?? [],
    draft,
  };
  writeLocal(DRAFT_KEY, record);
  writeLocal(RECORD_KEY, record);
  return record;
}

/** Multipart upload of a supporting document (photo, CV, licence copy). */
export async function uploadFile(file: File, purpose: string): Promise<FileRef> {
  if (API_BASE) {
    const body = new FormData();
    body.append("file", file);
    body.append("purpose", purpose);
    const res = await fetch(`${API_BASE}/api/applications/documents`, {
      method: "POST",
      body,
      credentials: "include",
      headers: authHeaders(),
    });
    if (!res.ok) throw parseApiError(await res.text(), res.status);
    return (await res.json()) as FileRef;
  }
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  };
}

function makeReference() {
  const now = new Date();
  return `ACEA-${now.getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
}
