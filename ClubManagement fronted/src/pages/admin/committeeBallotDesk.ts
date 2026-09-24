import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { API_BASE } from "@/config/env";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

export type Seat = {
  committeeMemberId: number;
  profileId: number;
  name: string;
  roleName: string;
  present: boolean;
};

export type BallotPerson = {
  profileId: number;
  name: string;
  roleName: string;
  voteValue?: string | null;
  present?: boolean;
  kind?: string;
  dateElected?: string | null;
  castAt?: string | null;
  signedAt?: string | null;
};

export type BallotItem = {
  committeeBallotItemId: number;
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  photoUrl?: string | null;
  PhotoUrl?: string | null;
  applicationStatusCode?: string | null;
  itemStatus: string;
  forCount: number;
  againstCount: number;
  votesCast: number;
  quorumRequired: number;
  quorumMet: boolean;
  autoRejected: boolean;
  excludedUntil?: string | null;
  myVoteCast: boolean;
  myVoteValue?: string | null;
  votingOpen?: boolean;
  canProceedToSignatures: boolean;
  financeFeesCleared?: boolean;
  committeeSignatures: number;
  gmSignatures: number;
  chairmanSigned: boolean;
  readyForChairman: boolean;
  appliedMembershipType?: string | null;
  voted?: BallotPerson[];
  Voted?: BallotPerson[];
  notVoted?: BallotPerson[];
  NotVoted?: BallotPerson[];
  signatures?: BallotPerson[];
  Signatures?: BallotPerson[];
  awaitingSignatures?: BallotPerson[];
  AwaitingSignatures?: BallotPerson[];
};

export type Candidate = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  statusName?: string | null;
  alreadyLinked: boolean;
};

export type AdmissionDesk = {
  committeeMeetingId: number;
  meetingName: string;
  meetingDate: string;
  meetingTime?: string | null;
  status: string;
  committeeSize: number;
  quorumRequired: number;
  presentCount: number;
  meetingQuorumMet: boolean;
  deskMessage?: string | null;
  seats: Seat[];
  items: BallotItem[];
  pendingApplicants: Candidate[];
};

export function applicantInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function applicantPhotoSrc(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export function ballotPhotoUrl(row: Pick<BallotItem, "photoUrl" | "PhotoUrl">) {
  return applicantPhotoSrc(row.photoUrl ?? row.PhotoUrl);
}

export function peopleList(...candidates: unknown[]): BallotPerson[] {
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate.map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const pick = (...keys: string[]) => {
        for (const key of keys) {
          const value = row[key];
          if (value != null && String(value).trim() !== "") return value;
        }
        return undefined;
      };
      return {
        profileId: Number(pick("profileId", "ProfileId") ?? 0),
        name: String(pick("name", "Name") ?? ""),
        roleName: String(pick("roleName", "RoleName") ?? ""),
        voteValue: (pick("voteValue", "VoteValue") as string | undefined) ?? null,
        present: Boolean(pick("present", "Present") ?? false),
        kind: String(pick("kind", "Kind") ?? ""),
        dateElected: (pick("dateElected", "DateElected") as string | undefined) ?? null,
        castAt: (pick("castAt", "CastAt") as string | undefined) ?? null,
        signedAt: (pick("signedAt", "SignedAt") as string | undefined) ?? null,
      };
    });
  }
  return [];
}

/** True when joining + annual are Paid/Waived (cash, cheque, M-Pesa, bank). */
export function isFinanceFeesCleared(row: BallotItem) {
  const anyRow = row as BallotItem & { FinanceFeesCleared?: boolean };
  return anyRow.financeFeesCleared === true || anyRow.FinanceFeesCleared === true;
}

/** Signatures appear only after more than 4 members have voted on that applicant. */
export function signaturesUnlocked(row: Pick<BallotItem, "votesCast" | "itemStatus">) {
  return row.votesCast > 4 || row.itemStatus === "PASSED" || row.itemStatus === "CLOSED";
}

export function isVotingOpen(row: Pick<BallotItem, "itemStatus" | "votingOpen">) {
  return row.votingOpen === true || row.itemStatus === "OPEN";
}

export function canToggleVoting(row: Pick<BallotItem, "itemStatus" | "autoRejected">) {
  return !row.autoRejected && (row.itemStatus === "OPEN" || row.itemStatus === "CLOSED");
}

export function useAdmissionBallot() {
  const queryClient = useQueryClient();
  const [dateElected, setDateElected] = useState(kenyaTodayISO());
  const [membershipNumber, setMembershipNumber] = useState("");
  const [electedType, setElectedType] = useState<"FULL" | "COUNTRY" | "OVERSEAS" | "">("");
  const [presentIds, setPresentIds] = useState<number[] | null>(null);

  const desk = useQuery({
    queryKey: ["committee", "admission-ballot"],
    queryFn: () => apiRequest<AdmissionDesk>("/api/committees/admission-ballot"),
  });

  const data = desk.data;
  const meetingId = data?.committeeMeetingId ?? 0;
  const seats = data?.seats ?? [];
  const checked = presentIds ?? seats.filter((s) => s.present).map((s) => s.committeeMemberId);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["committee", "admission-ballot"] });
    void queryClient.invalidateQueries({ queryKey: ["committee", "ballot"] });
  };

  const saveAttendance = useMutation({
    mutationFn: () =>
      apiRequest(`/api/committees/meetings/${meetingId}/attendance`, {
        method: "POST",
        body: JSON.stringify({ committeeMemberIds: checked }),
      }),
    onSuccess: () => {
      toast.success("Attendance saved.");
      setPresentIds(null);
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const attach = useMutation({
    mutationFn: (applicationId: number) =>
      apiRequest(`/api/committees/meetings/${meetingId}/ballot`, {
        method: "POST",
        body: JSON.stringify({ applicationId }),
      }),
    onSuccess: () => {
      toast.success("Applicant added to this ballot.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const vote = useMutation({
    mutationFn: ({
      itemId,
      voteValue,
      voterProfileId,
    }: {
      itemId: number;
      voteValue: "FOR" | "AGAINST";
      voterProfileId?: number;
    }) =>
      apiRequest(`/api/committees/ballot/${itemId}/vote`, {
        method: "POST",
        body: JSON.stringify({
          voteValue,
          voterProfileId: voterProfileId || undefined,
        }),
      }),
    onSuccess: (row: BallotItem, vars) => {
      if (row.autoRejected) {
        toast.message(
          `2 adverse votes — excluded until ${row.excludedUntil ?? "one year from today"} (Article 6b).`,
        );
      } else if (vars.voterProfileId) {
        toast.success("Vote recorded on behalf of the member.");
      } else {
        toast.success("Vote recorded.");
      }
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const setVoting = useMutation({
    mutationFn: ({ itemId, open }: { itemId: number; open: boolean }) =>
      apiRequest(`/api/committees/ballot/${itemId}/voting`, {
        method: "POST",
        body: JSON.stringify({ open }),
      }),
    onSuccess: (_d, vars) => {
      toast.success(vars.open ? "Voting opened." : "Voting closed.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const proceed = useMutation({
    mutationFn: (itemId: number) =>
      apiRequest(`/api/committees/ballot/${itemId}/signatures`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Passed — collect 4 Committee signatures and the General Manager.");
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const sign = useMutation({
    mutationFn: ({
      itemId,
      kind,
    }: {
      itemId: number;
      kind: "COMMITTEE" | "GENERAL_MANAGER" | "CHAIRMAN";
    }) =>
      apiRequest(`/api/committees/ballot/${itemId}/sign`, {
        method: "POST",
        body: JSON.stringify({
          signatoryKind: kind,
          dateElected: kind === "CHAIRMAN" ? dateElected : undefined,
          membershipNumber: kind === "CHAIRMAN" ? membershipNumber.trim() : undefined,
          electedMembershipType: kind === "CHAIRMAN" ? electedType : undefined,
        }),
      }),
    onSuccess: (_d, vars) => {
      toast.success(
        vars.kind === "CHAIRMAN"
          ? "Chairman election recorded — membership number, date elected, and type assigned."
          : "Signature recorded.",
      );
      if (vars.kind === "CHAIRMAN") {
        setMembershipNumber("");
        setElectedType("");
        setDateElected(kenyaTodayISO());
      }
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const busy =
    attach.isPending ||
    vote.isPending ||
    setVoting.isPending ||
    proceed.isPending ||
    sign.isPending ||
    saveAttendance.isPending;

  const toggleSeat = (id: number) => {
    setPresentIds((prev) => {
      const current = prev ?? checked;
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  };

  return {
    desk,
    data,
    meetingId,
    seats,
    checked,
    busy,
    saveAttendance,
    attach,
    vote,
    setVoting,
    proceed,
    sign,
    toggleSeat,
    dateElected,
    setDateElected,
    membershipNumber,
    setMembershipNumber,
    electedType,
    setElectedType,
  };
}
