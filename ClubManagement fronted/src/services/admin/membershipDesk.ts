export type ApplicationPaymentLine = {
  feeCode?: string | null;
  feeLabel?: string | null;
  amount: number;
  receiptNumber?: string | null;
  paymentDate?: string | null;
  status?: string | null;
  received?: boolean;
};

export type ApplicationRow = {
  applicationId: number;
  referenceNumber?: string | null;
  applicationNo?: string | null;
  applicantName?: string | null;
  statusCode?: string | null;
  statusName?: string | null;
  membershipTypeName?: string | null;
  appliedAt?: string | null;
  updatedAt?: string | null;
  sectionsCompleted?: number;
  totalSections?: number;
  paymentStatus?: string | null;
  paymentStatusCode?: string | null;
  paymentReceiptNumber?: string | null;
  paymentAmount?: number | null;
  paymentDate?: string | null;
  paymentLines?: ApplicationPaymentLine[] | null;
  sponsorStatus?: string | null;
  sponsorStatusCode?: string | null;
  sponsorCompletedAt?: string | null;
  endorsementsCompleted?: number;
  endorsementsRequired?: number;
  stageAReadyForManager?: boolean | null;
  stageAPaymentsReady?: boolean | null;
  stageADocumentsReady?: boolean | null;
  clubVisitsLogged?: number | null;
  clubVisitsMet?: boolean | null;
  canAuthorizeToInterview?: boolean | null;
  memberDetailsComplete?: boolean | null;
  committeeMeetingId?: number | null;
  committeeMeetingDate?: string | null;
  committeeMeetingName?: string | null;
  committeeMeetingTime?: string | null;
  assignedToMeeting?: boolean | null;
};

export function applicationReference(row: ApplicationRow) {
  return row.referenceNumber || row.applicationNo || `APP-${String(row.applicationId).padStart(4, "0")}`;
}

export function applicantDisplayName(row: ApplicationRow) {
  return row.applicantName?.trim() || "Applicant";
}

export function applicationProgress(row: ApplicationRow) {
  const done = row.sectionsCompleted ?? 0;
  const total = row.totalSections || 7;
  return { done, total, percent: (done / Math.max(total, 1)) * 100 };
}

export function applicationStage(row: Pick<ApplicationRow, "statusCode" | "statusName">) {
  // Prefer Application_status.name from the database; code map is fallback only.
  const fromDb = row.statusName?.trim();
  if (fromDb) return fromDb;
  return APPLICATION_STAGE[row.statusCode ?? ""] ?? row.statusCode ?? "—";
}

export type MemberRow = {
  accountId: number;
  profileId?: number;
  membershipNo: string;
  fullName: string;
  membershipTypeId: number;
  membershipType: string;
  status: string;
  joinedDate?: string | null;
  canVote: boolean;
  canRunForOffice: boolean;
  reciprocationAllowed: boolean;
  canIntroduceGuests: boolean;
  isPermanent: boolean;
  outstandingArrears: number;
};

export type MembershipTypeRow = {
  membershipTypeId: number;
  code: string;
  name: string;
  description?: string | null;
  canVote: boolean;
  canRunForOffice: boolean;
  reciprocationAllowed: boolean;
  canIntroduceGuests: boolean;
  canAccessSubscriptions: boolean;
  canAccessCommittee: boolean;
  canAccessAccommodation: boolean;
  canAccessEndorsements: boolean;
  canAccessDocuments: boolean;
  isPermanent: boolean;
  maxDurationDays?: number | null;
};

export type LookupRow = { id?: number; code: string; name: string };

export const APPLICATION_STAGE: Record<string, string> = {
  Draft: "Draft",
  Submitted: "Pre-requisites",
  UnderReview: "Screening",
  Endorsement: "Endorsement",
  EndorsementReview: "Endorsement Review",
  Interview: "Interview",
  InterviewReview: "Interview Review",
  TemporaryMember: "Temporary Member",
  Waitlist: "Waitlisted",
  ElectionReview: "Election Review",
  Committee: "Committee signatures",
  CommitteeReview: "Committee Review",
  Approved: "Fully approved",
  Rejected: "Rejected",
  NotElected: "Not Elected",
  Withdrawn: "Withdrawn",
};

export const PENDING_DESK_STATUSES = new Set(["Submitted", "UnderReview"]);
export const AUTHORIZE_DESK_STATUSES = new Set(["Endorsement", "EndorsementReview"]);
export const CLOSED_APPLICATION_STATUSES = new Set(["Approved", "Rejected", "Withdrawn"]);

export function isPendingDesk(statusCode?: string | null) {
  return PENDING_DESK_STATUSES.has(statusCode ?? "");
}

export function isAuthorizeDesk(statusCode?: string | null) {
  return AUTHORIZE_DESK_STATUSES.has(statusCode ?? "");
}

const REVIEW_STATUSES = new Set([
  "UnderReview",
  "EndorsementReview",
  "InterviewReview",
  "ElectionReview",
  "CommitteeReview",
]);

export function isReviewStatus(statusCode?: string | null) {
  return REVIEW_STATUSES.has(statusCode ?? "");
}

export function displayApplicationStatus(statusCode?: string | null, statusName?: string | null) {
  const fromDb = statusName?.trim();
  if (fromDb) return fromDb;
  return APPLICATION_STAGE[statusCode ?? ""] ?? statusCode ?? "—";
}

export function reviewTargetStatus(statusCode?: string | null) {
  switch (statusCode) {
    case "Submitted":
      return { code: "UnderReview", stage: "Screening" };
    case "Endorsement":
      return { code: "EndorsementReview", stage: "Endorsement Review" };
    case "Interview":
      return { code: "InterviewReview", stage: "Interview Review" };
    case "Waitlist":
      return { code: "ElectionReview", stage: "Election Review" };
    case "Committee":
      return { code: "CommitteeReview", stage: "Committee Review" };
    default:
      return null;
  }
}

export function canStartReview(statusCode?: string | null) {
  return reviewTargetStatus(statusCode) != null;
}

export function nextApplicationStage(statusCode?: string | null) {
  switch (statusCode) {
    case "UnderReview":
      return { code: "Endorsement", stage: "Endorsement" };
    case "EndorsementReview":
      return { code: "Interview", stage: "Interview" };
    case "InterviewReview":
      return { code: "Waitlist", stage: "Waitlisted" };
    case "ElectionReview":
      return { code: "Committee", stage: "Committee signatures" };
    case "CommitteeReview":
      return { code: "Approved", stage: "Fully approved" };
    default:
      return null;
  }
}

export function formatMembershipDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export function privilegeLabels(row: {
  canVote: boolean;
  canRunForOffice: boolean;
  reciprocationAllowed: boolean;
  canIntroduceGuests: boolean;
  isPermanent: boolean;
}) {
  const labels: string[] = [];
  if (row.canVote) labels.push("Vote");
  if (row.canRunForOffice) labels.push("Stand for office");
  if (row.canIntroduceGuests) labels.push("Introduce guests");
  if (row.reciprocationAllowed) labels.push("Reciprocation");
  if (row.isPermanent) labels.push("Permanent");
  return labels;
}

export type ApplicationDocumentRow = {
  applicationDocumentId: number;
  documentTypeId: number;
  documentTypeName?: string | null;
  documentTypeCode?: string | null;
  fileName: string;
  fileUrl: string;
  uploadedAt?: string | null;
  isVerified?: boolean;
  verificationStatus?: string | null;
  verificationNotes?: string | null;
  verifiedAt?: string | null;
};

export type ApplicationDetailAdmin = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  statusCode?: string | null;
  statusName?: string | null;
  formDataJson?: string | null;
  completedSteps?: string[] | null;
  documents?: ApplicationDocumentRow[];
  endorsements?: {
    endorserRole?: string | null;
    endorserName?: string | null;
    endorserMembershipNo?: string | null;
    personalKnowledge?: string | null;
    professionalKnowledge?: string | null;
    valueAddition?: string | null;
    yearsKnownCandidate?: number | null;
  }[];
  proposerName?: string | null;
  seconderName?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  clubVisitsCount?: number;
  lastRejectionReason?: string | null;
};

export const DOCUMENT_TYPE_LABEL: Record<number, string> = {
  1: "Passport photo",
  2: "Curriculum vitae",
  3: "Pilot licence copy",
};

export type MemberLink = {
  profileId: number;
  fullName: string;
  membershipNo?: string | null;
};

export type MemberProfile = {
  accountId: number;
  profileId: number;
  applicationId?: number | null;
  membershipNo: string;
  fullName: string;
  status: string;
  statusCode: string;
  isActive: boolean;
  joinedDate?: string | null;
  startDate?: string | null;
  outstandingArrears: number;
  identity: {
    title?: string | null;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    photoUrl?: string | null;
    cvUrl?: string | null;
    idPassportNo?: string | null;
    nationality?: string | null;
    dateOfBirth?: string | null;
    placeOfBirth?: string | null;
    ageYears?: number | null;
    bloodGroup?: string | null;
    gender?: string | null;
    maritalStatus?: string | null;
    occupation?: string | null;
    company?: string | null;
    role?: string | null;
  };
  contact: {
    postalAddress?: string | null;
    city?: string | null;
    stateCountry?: string | null;
    postalCode?: string | null;
    country?: string | null;
    countryOfResidence?: string | null;
    email?: string | null;
    altEmail?: string | null;
    telIntlPrefix?: string | null;
    mobile?: string | null;
    telOther?: string | null;
  };
  spouses: { dependantId?: number | null; name: string; phone?: string | null; email?: string | null }[];
  children: {
    dependantId?: number | null;
    name: string;
    dateOfBirth?: string | null;
    ageYears?: number | null;
    requiresOwnMembership: boolean;
    note?: string | null;
  }[];
  emergencyContacts: {
    memberEmergencyContactId?: number | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    isPrimary: boolean;
  }[];
  aviation: {
    isAffiliated: boolean;
    aviationRole?: string | null;
    holdsLicense: boolean;
    ownsAircraft: boolean;
    licenses: {
      memberLicenseId?: number | null;
      licenseType?: string | null;
      licenseNumber: string;
      issuer?: string | null;
      copyFileName?: string | null;
      copyFileUrl?: string | null;
    }[];
    aircraft: {
      memberAircraftId?: number | null;
      aircraftType?: string | null;
      countryOfRegistration?: string | null;
      registrationNumber: string;
      hangarLocation?: string | null;
    }[];
  };
  clubs?: {
    memberOfOtherClub: boolean;
    otherClubs: { name: string }[];
  };
  consent?: {
    privacyPolicyAccepted: boolean;
    declarationAccepted: boolean;
    declarationName?: string | null;
    declarationSignature?: string | null;
    declarationDate?: string | null;
  };
  governance: {
    membershipTypeId: number;
    membershipTypeCode: string;
    membershipTypeName: string;
    classAllowsVote: boolean;
    inGoodStanding: boolean;
    eligibleToVote: boolean;
    votingReason: string;
    continuousMembershipYears: number;
    eligibleForSenior: boolean;
    eligibleForSeniorLife: boolean;
    subscriptionDiscountPercent: number;
    recommendedMembershipTypeCode?: string | null;
    recommendedMembershipTypeName?: string | null;
    seniorityReason: string;
    proposer?: MemberLink | null;
    seconder?: MemberLink | null;
  };
};

export type MemberAuditEntry = {
  at: string;
  action: string;
  source: string;
  actor?: string | null;
  summary?: string | null;
};
