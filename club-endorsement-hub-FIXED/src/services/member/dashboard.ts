import { useQuery } from "@tanstack/react-query";

import { ApiError, apiRequest } from "@/services/membership/api";
import { isClubMember, readUser, type AuthUser } from "@/lib/auth";

export type MemberDashboard = {
  isElectedMember: boolean;
  accountId: number;
  profileId: number;
  membershipNo: string;
  fullName: string;
  photoUrl?: string | null;
  classCode: string;
  className: string;
  status: string;
  statusCode: string;
  dateElected?: string | null;
  continuousMembershipYears: number;
  cards: {
    profile: boolean;
    subscriptions: boolean;
    guests: boolean;
    committee: boolean;
    committeeMode: "full" | "readonly" | "hidden" | string;
    election: boolean;
    accommodation: boolean;
    endorsements: boolean;
    documents: boolean;
    committeeBallot: boolean;
  };
  privileges: {
    canVote: boolean;
    canRunForOffice: boolean;
    canIntroduceGuests: boolean;
    reciprocationAllowed: boolean;
    paysSubscription: boolean;
    subscriptionDiscountPercent: number;
  };
  standing: string;
  standingDetail: string;
  pendingEndorsements: number;
  childrenRequiringOwnMembership: number;
};

export const memberMeQueryKey = ["member-me"] as const;

export function fallbackMemberDashboard(user: AuthUser): MemberDashboard {
  return {
    isElectedMember: true,
    accountId: 0,
    profileId: user.profileId,
    membershipNo: "AC pending",
    fullName: user.fullName,
    classCode: "FULL",
    className: "Full",
    status: "Active",
    statusCode: "ACTIVE",
    continuousMembershipYears: 0,
    cards: {
      profile: true,
      subscriptions: true,
      guests: true,
      committee: true,
      committeeMode: "full",
      election: true,
      accommodation: true,
      endorsements: true,
      documents: true,
      committeeBallot: false,
    },
    privileges: {
      canVote: true,
      canRunForOffice: true,
      canIntroduceGuests: true,
      reciprocationAllowed: true,
      paysSubscription: true,
      subscriptionDiscountPercent: 0,
    },
    standing: "InGoodStanding",
    standingDetail: "Article 5 Full-class privileges apply until class is confirmed on the register.",
    pendingEndorsements: 0,
    childrenRequiringOwnMembership: 0,
  };
}

export async function fetchMemberMe(): Promise<MemberDashboard | null> {
  try {
    return await apiRequest<MemberDashboard>("/api/members/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function useMemberDashboard() {
  const user = readUser();
  return useQuery({
    queryKey: [...memberMeQueryKey, user?.userAccountId],
    queryFn: fetchMemberMe,
    staleTime: 30_000,
    enabled: Boolean(user?.userAccountId) && isClubMember(user),
    retry: false,
  });
}
