import { ApiError, apiRequest } from "@/services/membership/api";

export type CommitteeSeatInput = {
  committeeMemberId: number;
  profileId: number;
  profileName?: string;
  name?: string;
  roleName: string;
};

export type SittingAttendance = {
  meetingId: number;
  members: Array<{
    committeeMemberId: number;
    profileId: number;
    name: string;
    roleCode: string;
    roleName: string;
    present: boolean;
    isGeneralManager: boolean;
    countsAsCommitteeSignature: boolean;
  }>;
  committeePresentCount: number;
  gmPresent: boolean;
  gateMet: boolean;
};

type BallotSeat = {
  committeeMemberId: number;
  profileId: number;
  name: string;
  roleName: string;
  present: boolean;
};

type BallotMeeting = {
  seats?: BallotSeat[];
};

function isGm(roleName: string) {
  const n = roleName.toLowerCase();
  return n.includes("general manager") || n === "manager" || n.includes("gm");
}

function fromSeats(meetingId: number, seats: BallotSeat[]): SittingAttendance {
  const members = seats.map((s) => {
    const gm = isGm(s.roleName);
    return {
      committeeMemberId: s.committeeMemberId,
      profileId: s.profileId,
      name: s.name,
      roleCode: gm ? "GENERAL_MANAGER" : "COMMITTEE_MEMBER",
      roleName: s.roleName,
      present: s.present,
      isGeneralManager: gm,
      countsAsCommitteeSignature: !gm && /committee member/i.test(s.roleName),
    };
  });
  for (const m of members) {
    if (!m.isGeneralManager && !m.countsAsCommitteeSignature) {
      m.countsAsCommitteeSignature = !m.isGeneralManager;
    }
  }
  const committeePresentCount = members.filter((m) => m.countsAsCommitteeSignature && m.present).length;
  const gmPresent = members.some((m) => m.isGeneralManager && m.present);
  const needGm = members.some((m) => m.isGeneralManager);
  return {
    meetingId,
    members,
    committeePresentCount,
    gmPresent,
    gateMet: committeePresentCount >= 4 && (!needGm || gmPresent),
  };
}

async function tryGet<T>(url: string): Promise<T | null> {
  try {
    return await apiRequest<T>(url);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return null;
    throw error;
  }
}

export async function loadSittingAttendance(
  meetingId: number,
  seats: CommitteeSeatInput[] = [],
): Promise<SittingAttendance> {
  const direct =
    (await tryGet<SittingAttendance>(`/api/committees/meetings/${meetingId}/attendance`)) ??
    (await tryGet<SittingAttendance>(`/api/committees/meetings/${meetingId}/sitting-attendance`));
  if (direct?.members) return direct;

  try {
    const ballot = await apiRequest<BallotMeeting>(`/api/committees/meetings/${meetingId}/ballot`);
    if ((ballot.seats ?? []).length > 0) return fromSeats(meetingId, ballot.seats ?? []);
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 405)) throw error;
  }

  return fromSeats(
    meetingId,
    seats.map((s) => ({
      committeeMemberId: s.committeeMemberId,
      profileId: s.profileId,
      name: s.profileName || s.name || "Member",
      roleName: s.roleName,
      present: false,
    })),
  );
}

export async function saveSittingPresent(
  meetingId: number,
  committeeMemberId: number,
  present: boolean,
  current: SittingAttendance | undefined,
): Promise<void> {
  const nextIds = (current?.members ?? [])
    .filter((m) => (m.committeeMemberId === committeeMemberId ? present : m.present))
    .map((m) => m.committeeMemberId);
  if (present && !nextIds.includes(committeeMemberId)) nextIds.push(committeeMemberId);

  try {
    await apiRequest(`/api/committees/meetings/${meetingId}/sitting-attendance`, {
      method: "POST",
      body: JSON.stringify({ committeeMemberId, present }),
    });
    return;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }

  await apiRequest(`/api/committees/meetings/${meetingId}/attendance`, {
    method: "POST",
    body: JSON.stringify({ committeeMemberIds: nextIds }),
  });
}
