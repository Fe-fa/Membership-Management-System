/**
 * Shared TypeScript shapes for the General Manager / Admin dashboard.
 *
 * Every metric name below maps to a real column in the attached SQL Server
 * `ClubManagement` schema. The mapping is documented next to the fetcher in
 * `dashboardData.ts` so the wiring stays auditable end-to-end.
 */

export type AdminRole = "applicant" | "manager" | "admin";

export type AdminOverview = {
  /** CAM 1 — Membership Applications */
  applications: {
    pendingApprovals: number;
    waitlisted: number;
    rejected: number;
    existingMembers: number;
  };
  /** CAM 2 — Financial & Payments */
  finances: {
    annualSubscriptionRevenue: number;
    outstandingBalances: number;
    recentTransactions: {
      method: string;
      count: number;
    }[];
  };
  /** CAM 3 — Club Operations & Governance */
  governance: {
    activeCommitteeMembers: number;
    committeeMembers: { name: string; role: string }[];
    upcomingMeetings: {
      title: string;
      meetingDate: string;       // ISO yyyy-mm-dd
      meetingType: "AGM" | "GENERAL" | "COMMITTEE";
      status: string;            // SCHEDULED / CONCLUDED …
    }[];
    documents: {
      name: string;              // Bye-Laws / Articles …
      version: string;           // v3.1
      status: "EFFECTIVE" | "UNDER_REVIEW" | "DRAFT";
      effectiveDate: string | null;
    }[];
  };
  /** CAM 4 — Accommodation & Facilities */
  facilities: {
    totalRooms: number;          // property constant until Room_mgmt ships
    occupiedRooms: number;
    occupancyRate: number;       // 0..1
    upcomingReservations: {
      memberName: string;
      roomType: string;
      checkIn: string;
      checkOut: string;
    }[];
  };
  meta: {
    /** "live" hits the API; "demo" means no VITE_ACEA_API_URL is configured. */
    source: "live" | "demo";
    generatedAt: string;       // ISO timestamp
  };
};
