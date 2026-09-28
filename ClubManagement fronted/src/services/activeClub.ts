const ACTIVE_CLUB_KEY = "acea.active.club";

export type ActiveClub = {
  companyId: number;
  companyCode: string;
  companyName: string;
  slug?: string | null;
};

export function readActiveClub(): ActiveClub | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_CLUB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveClub;
    if (!parsed.companyCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistActiveClub(club: ActiveClub) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ACTIVE_CLUB_KEY,
    JSON.stringify({
      companyId: club.companyId,
      companyCode: club.companyCode.trim().toUpperCase(),
      companyName: club.companyName,
      slug: club.slug ?? null,
    }),
  );
}

export function clearActiveClub() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_CLUB_KEY);
}

export function activeClubCode() {
  return readActiveClub()?.companyCode?.trim().toUpperCase() || null;
}
