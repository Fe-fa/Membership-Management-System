/**
 * Club member register lookups used by the proposer / seconder step.
 * Lookup is by membership number (unique). Names are not used for search
 * because they can collide.
 */
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
    membershipNo: "ACEA/F/1041",
    fullName: "Capt. Miriam Wanjiku",
    email: "m.wanjiku@example.co.ke",
    phone: "+254 722 100 220",
    membershipType: "Full",
    yearOfJoining: 2009,
    isActive: true,
    inGoodStanding: true,
  },
  {
    profileId: "1088",
    membershipNo: "ACEA/F/1088",
    fullName: "Eng. Peter Oduor",
    email: "p.oduor@example.co.ke",
    phone: "+254 733 441 908",
    membershipType: "Full",
    yearOfJoining: 2014,
    isActive: true,
    inGoodStanding: true,
  },
  {
    profileId: "1120",
    membershipNo: "ACEA/C/1120",
    fullName: "Ms. Amina Hassan",
    email: "a.hassan@example.co.ke",
    phone: "+254 711 880 441",
    membershipType: "Country",
    yearOfJoining: 2012,
    isActive: true,
    inGoodStanding: true,
  },
  {
    profileId: "1203",
    membershipNo: "ACEA/F/1203",
    fullName: "Dr. Grace Mumbi",
    email: "g.mumbi@example.co.ke",
    phone: "+254 701 223 991",
    membershipType: "Full",
    yearOfJoining: 2011,
    isActive: true,
    inGoodStanding: false,
  },
  {
    profileId: "1455",
    membershipNo: "ACEA/C/1455",
    fullName: "Mr. Samuel Kiptoo",
    email: "s.kiptoo@example.co.ke",
    phone: "+254 715 662 004",
    membershipType: "Country",
    isActive: false,
    yearOfJoining: 2001,
    inGoodStanding: true,
  },
];

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

/**
 * Look up proposer/seconder candidates by membership number.
 * Includes ineligible matches so the UI can explain why a registered member cannot be selected.
 */
export async function searchEligibleMembers(search: string): Promise<EligibleMember[]> {
  const term = search.trim();
  if (!term) return [];

  if (API_BASE) {
    const members = await apiRequest<MemberSummary[]>(
      `/api/members/eligible-supporters?search=${encodeURIComponent(term)}&minYears=${MIN_SUPPORTER_YEARS}`,
    );
    return members
      .map(decorate)
      .sort((a, b) => {
        const aExact = a.membershipNo.toLowerCase() === term.toLowerCase() ? 0 : 1;
        const bExact = b.membershipNo.toLowerCase() === term.toLowerCase() ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return a.membershipNo.localeCompare(b.membershipNo);
      });
  }

  const needle = term.toLowerCase();
  return DEMO_REGISTER.map(decorate)
    .filter((m) => m.membershipNo.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aExact = a.membershipNo.toLowerCase() === needle ? 0 : 1;
      const bExact = b.membershipNo.toLowerCase() === needle ? 0 : 1;
      return aExact - bExact || a.membershipNo.localeCompare(b.membershipNo);
    });
}
