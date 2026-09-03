import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest } from "@/services/membership/api";

export type CommitteeMember = {
  committeeMemberId: number;
  profileId: number;
  profileName: string;
  membershipNo?: string | null;
  photoUrl?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  accountId?: number | null;
  membershipType?: string | null;
  membershipStatus?: string | null;
  membershipStatusCode?: string | null;
  accountIsActive?: boolean | null;
  joinedDate?: string | null;
  nextRenewalDate?: string | null;
  committeeRoleId: number;
  roleCode: string;
  roleName: string;
  roleSortOrder: number;
  canApproveCredit: boolean;
  isAviationAffiliated: boolean;
  appointedDate?: string | null;
  isActive: boolean;
};

export type CommitteeMeeting = {
  committeeMeetingId: number;
  meetingTypeId: number;
  meetingTypeCode: string;
  meetingTypeName: string;
  meetingDate: string;
  meetingTime?: string | null;
  meetingName?: string | null;
  chairProfileId?: number | null;
  chairName?: string | null;
  status: string;
  minutesUrl?: string | null;
  linkedInterviewCount?: number;
  pendingOutcomeCount?: number;
};

export type InterviewFormPayload = {
  suitability?: string | null;
  verbalAlignment?: string | null;
  recommendation?: string | null;
  returnReason?: string | null;
  formOutcome?: string | null;
};

export type InterviewCandidate = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  photoUrl?: string | null;
  alreadyLinked?: boolean;
  linkedMeetingId?: number | null;
  linkedMeetingLabel?: string | null;
  statusName?: string | null;
  statusCode?: string | null;
  interviewId?: number | null;
  outcome?: string | null;
  notes?: string | null;
  hasClubMembership?: boolean;
  form?: InterviewFormPayload;
};

export type MeetingInterview = {
  interviewId: number;
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  statusName?: string | null;
  statusCode?: string | null;
  outcome?: string | null;
  notes?: string | null;
  attendedFlag: boolean;
  outcomeRecorded?: boolean;
  form?: InterviewFormPayload;
  committeeMeetingId?: number | null;
  sittingLabel?: string | null;
  conductedAt?: string | null;
  canRetrieve?: boolean;
  canAmendHistory?: boolean;
  hasClubMembership?: boolean;
};

export type CommitteeDetail = {
  committeeId: number;
  committeeName: string;
  type: string;
  termStart?: string | null;
  termEnd?: string | null;
  isActive: boolean;
  members: CommitteeMember[];
  meetings: CommitteeMeeting[];
  nextMeeting?: CommitteeMeeting | null;
  nonOfficerCount: number;
  aviationActiveNonOfficers: number;
  aviationRuleMet: boolean;
};

export type RoleOption = {
  committeeRoleId: number;
  code: string;
  name: string;
  sortOrder: number;
  canApproveCredit: boolean;
  isOfficer: boolean;
};

export type MeetingTypeOption = {
  meetingTypeId: number;
  code: string;
  name: string;
  sortOrder: number;
};

export type ProfileHit = {
  profileId: number;
  name: string;
  membershipNo?: string | null;
  isAviationAffiliated: boolean;
};

export function useCurrentCommittee() {
  return useQuery({
    queryKey: ["committee", "current", "main"],
    queryFn: async () => {
      try {
        return await apiRequest<CommitteeDetail>("/api/committees/current?type=main");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

export function useInvalidateCommittee() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["committee"] });
  };
}
