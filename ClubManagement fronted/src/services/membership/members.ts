import { API_BASE, apiRequest } from "./api";
import { MIN_SUPPORTER_YEARS } from "./schema";

export type MemberSummary = {
  profileId: string;
  membershipNo: string;
  fullName: string;
  email: string;
  phone: string;
  membershipType: string;
  yearOfJoining: number;
  joinedDate?: string | null;
  isActive: boolean;
  inGoodStanding: boolean;
  eligible?: boolean;
  ineligibleReason?: string | null;
  tenureYears?: number;
};

export type EligibleMember = MemberSummary & {
  tenureYears: number;
  eligible: boolean;
  ineligibleReason: string | null;
};

const DEMO_REGISTER: MemberSummary[] = [
  {
    profileId: "1041",
    membershipNo: "AC-0001",
    fullName: "Capt. Miriam Wanjiku",
    email: "m.wanjiku@example.co.ke",
    phone: "+254 722 100 220",
    membershipType: "Full",
    yearOfJoining: 2009,
    joinedDate: "2009-03-15",
    isActive: true,
    inGoodStanding: true,
  },
  {
    profileId: "1088",
    membershipNo: "AC-0002",
    fullName: "Eng. Peter Oduor",
    email: "p.oduor@example.co.ke",
    phone: "+254 733 441 908",
    membershipType: "Full",
    yearOfJoining: 2014,
    joinedDate: "2014-07-01",
    isActive: true,
    inGoodStanding: true,
  },
];

function normalizeMembershipNo(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function decorate(member: MemberSummary): EligibleMember {
  const tenureYears =
    member.tenureYears ??
    Math.max(0, new Date().getFullYear() - Number(member.yearOfJoining || 0));

  if (typeof member.eligible === "boolean") {
    return {
      ...member,
      tenureYears,
      eligible: member.eligible,
      ineligibleReason: member.ineligibleReason ?? null,
    };
  }

  let ineligibleReason: string | null = null;
  if (!member.isActive) ineligibleReason = "Membership is not active";
  else if (!member.inGoodStanding) ineligibleReason = "Subscriptions are not in good standing";
  else if (tenureYears < MIN_SUPPORTER_YEARS)
    ineligibleReason = `Only ${tenureYears} year${tenureYears === 1 ? "" : "s"} of continuous membership (minimum ${MIN_SUPPORTER_YEARS})`;
  return { ...member, tenureYears, eligible: ineligibleReason === null, ineligibleReason };
}

/** Exact membership-number lookup for proposer / seconder. */
export async function searchEligibleMembers(
  search: string,
  applicationId?: number | string | null,
): Promise<EligibleMember[]> {
  const term = search.trim();
  if (!term) return [];

  if (API_BASE) {
    const params = new URLSearchParams({
      search: term,
      minYears: String(MIN_SUPPORTER_YEARS),
      exact: "true",
    });
    const id = Number(applicationId);
    if (Number.isFinite(id) && id > 0) params.set("applicationId", String(id));
    const members = await apiRequest<MemberSummary[]>(
      `/api/members/eligible-supporters?${params.toString()}`,
    );
    const needle = normalizeMembershipNo(term);
    return members
      .map(decorate)
      .filter((member) => normalizeMembershipNo(member.membershipNo) === needle);
  }

  const needle = normalizeMembershipNo(term);
  return DEMO_REGISTER.map(decorate).filter(
    (m) => normalizeMembershipNo(m.membershipNo) === needle,
  );
}
