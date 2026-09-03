import { API_BASE, apiRequest } from "@/services/membership/api";
import type { AdminOverview } from "./types";

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const empty: AdminOverview = {
    applications: { pendingApprovals: 0, waitlisted: 0, rejected: 0, existingMembers: 0 },
    finances: { annualSubscriptionRevenue: 0, outstandingBalances: 0, recentTransactions: [] },
    governance: {
      activeCommitteeMembers: 0,
      committeeMembers: [],
      upcomingMeetings: [],
      documents: [],
    },
    facilities: { totalRooms: 0, occupiedRooms: 0, occupancyRate: 0, upcomingReservations: [] },
    meta: { source: "live", generatedAt: new Date().toISOString() },
  };

  if (!API_BASE) {
    return { ...empty, meta: { source: "demo", generatedAt: new Date().toISOString() } };
  }

  try {
    const live = await apiRequest<Partial<AdminOverview>>("/api/admin/overview");
    return {
      ...empty,
      ...live,
      applications: { ...empty.applications, ...live.applications },
      finances: { ...empty.finances, ...live.finances },
      governance: { ...empty.governance, ...live.governance },
      facilities: { ...empty.facilities, ...live.facilities },
      meta: { source: "live", generatedAt: new Date().toISOString() },
    };
  } catch (err) {
    console.error("Admin overview fetch failed:", err);
    return { ...empty, meta: { source: "demo", generatedAt: new Date().toISOString() } };
  }
}

export const ADMIN_OVERVIEW_QUERY_KEY = ["admin", "overview"] as const;