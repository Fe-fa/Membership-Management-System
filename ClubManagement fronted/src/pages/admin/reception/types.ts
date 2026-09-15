export type ReceptionHost = {
  profileId: number;
  membershipNo: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type ReceptionVisitRow = {
  visitId: number;
  guestId: number;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  visitSlipCode?: string | null;
  visitCount: number;
  visitDate: string;
  timeIn?: string | null;
  timeOut?: string | null;
  isCurrent: boolean;
  guestBookEntryNo?: string | null;
  accompanyingProfileId: number;
  accompanyingMemberName: string;
  introducedByName?: string | null;
  staffName?: string | null;
  notes?: string | null;
  purpose?: string | null;
  status?: string | null;
  hasSignature?: boolean;
  signature?: string | null;
};

export const VISIT_PURPOSES = ["Lunch", "Meeting", "Social", "Club event", "Overnight", "Other"] as const;

export function isOtherVisitPurpose(purpose: string) {
  return purpose === "Other";
}

/** When purpose is Other, the free-text detail is stored as the visit reason. */
export function resolveVisitPurpose(purpose: string, otherDetail: string): string | null {
  if (!purpose) return null;
  if (isOtherVisitPurpose(purpose)) {
    const detail = otherDetail.trim();
    return detail || null;
  }
  return purpose;
}
