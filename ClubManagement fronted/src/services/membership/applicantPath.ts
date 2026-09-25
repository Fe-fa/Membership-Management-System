import type { ApplicationDraft } from "./schema";

export const APPLICANT_PATH_KEY = "aeca-applicant-path";

export type ApplicantPath = NonNullable<ApplicationDraft["applicationPath"]> & {
  parentEmail?: string | null;
  parentPhone?: string | null;
  yearOfJoining?: number | null;
  dateOfBirth?: string | null;
};

export function saveApplicantPath(path: ApplicantPath) {
  localStorage.setItem(APPLICANT_PATH_KEY, JSON.stringify(path));
}

export function readApplicantPath(): ApplicantPath | null {
  try {
    const raw = localStorage.getItem(APPLICANT_PATH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApplicantPath;
    if (parsed.category !== "CHILD_OF_MEMBER" && parsed.category !== "STANDARD") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearApplicantPath() {
  localStorage.removeItem(APPLICANT_PATH_KEY);
}

export function applyApplicantPath(draft: ApplicationDraft): ApplicationDraft {
  const path = readApplicantPath();
  if (!path || path.category !== "CHILD_OF_MEMBER") return draft;
  if (draft.applicationPath?.category === "CHILD_OF_MEMBER") return draft;

  const proposer = draft.supporters.proposer ?? {};
  const alreadyChosen = Boolean(proposer.memberProfileId);
  const verifiedDob = path.dateOfBirth?.slice(0, 10) || "";
  return {
    ...draft,
    personal: verifiedDob && !draft.personal.dateOfBirth
      ? { ...draft.personal, dateOfBirth: verifiedDob }
      : draft.personal,
    applicationPath: {
      category: "CHILD_OF_MEMBER",
      ...(path.parentAccountId !== undefined && { parentAccountId: path.parentAccountId }),
      ...(path.parentProfileId !== undefined && { parentProfileId: path.parentProfileId }),
      ...(path.parentMembershipNo !== undefined && { parentMembershipNo: path.parentMembershipNo }),
      ...(path.parentName !== undefined && { parentName: path.parentName }),
      ...(path.parentContinuousYears !== undefined && {
        parentContinuousYears: path.parentContinuousYears,
      }),
      ...(path.entranceFeeWaiverEligible !== undefined && {
        entranceFeeWaiverEligible: path.entranceFeeWaiverEligible,
      }),
    },
    supporters: alreadyChosen
      ? draft.supporters
      : {
          ...draft.supporters,
          proposer: {
            memberProfileId: path.parentProfileId ? String(path.parentProfileId) : "",
            membershipNo: path.parentMembershipNo ?? "",
            name: path.parentName ?? "",
            phone: path.parentPhone ?? "",
            email: path.parentEmail ?? "",
            ...(path.yearOfJoining != null && { yearOfJoining: path.yearOfJoining }),
          },
        },
  };
}
