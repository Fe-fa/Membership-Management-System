import type { LucideIcon } from "lucide-react";
import {
  Ban,
  BedDouble,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  Headset,
  Landmark,
  Settings,
  UserCheck,
  UserMinus,
  Users,
  UsersRound,
  Vote,
  Wallet,
} from "lucide-react";

import type { ApplicationRow, MemberRow } from "@/services/admin/membershipDesk";
import type { AdminOverview } from "@/services/admin/types";
import type { PagedResult } from "@/lib/pagination";

export type ModuleDashboardId =
  | "guest-visits"
  | "applicant-queue"
  | "manage-records"
  | "manager-queue"
  | "finance"
  | "committee-manage"
  | "agm-election"
  | "committee-ballot"
  | "accommodation"
  | "support"
  | "setting";

export type DashboardKpi = {
  id: string;
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: "violet" | "sky" | "emerald" | "rose";
  spark: number[];
};

export type DashboardSlice = { name: string; value: number; color: string };
export type DashboardBar = { name: string; value: number };
export type DashboardMonth = { month: string; primary: number; secondary: number; trend: number };
export type DashboardActivity = {
  action: string;
  staff: string;
  by: string;
  date: string;
  tone: "update" | "create" | "delete";
};

export type ModuleDashboardModel = {
  moduleId: ModuleDashboardId;
  title: string;
  kpis: DashboardKpi[];
  ratioTitle: string;
  ratioTotalLabel: string;
  ratio: DashboardSlice[];
  movementTitle: string;
  movementPrimary: string;
  movementSecondary: string;
  months: DashboardMonth[];
  breakdownTitle: string;
  breakdown: DashboardBar[];
  rankingTitle: string;
  ranking: DashboardBar[];
  activity: DashboardActivity[];
  extraBreakdownTitle: string;
  extraBreakdown: DashboardBar[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BLUE = "#2563eb";
const GREEN = "#22c55e";
const NAVY = "#1e3a8a";
const GOLD = "#c9a46c";
const SLATE = "#64748b";
const ROSE = "#e11d48";

function spark(seed: number, length = 14): number[] {
  return Array.from({ length }, (_, i) => {
    const wave = Math.sin(i * 0.7 + seed) * 0.35 + 0.55;
    const dip = i > length - 4 ? 0.15 * Math.sin(i) : 0;
    return Math.max(0.12, Math.min(1, wave + dip));
  });
}

function countBy(items: string[]): DashboardBar[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.trim() || "Unspecified";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function monthsFromDates(dates: Array<string | null | undefined>, secondaryDates: Array<string | null | undefined> = []): DashboardMonth[] {
  const year = new Date().getFullYear();
  const primary = Array(12).fill(0);
  const secondary = Array(12).fill(0);
  for (const value of dates) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime()) || date.getFullYear() !== year) continue;
    primary[date.getMonth()] += 1;
  }
  for (const value of secondaryDates) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime()) || date.getFullYear() !== year) continue;
    secondary[date.getMonth()] += 1;
  }
  return MONTHS.map((month, index) => ({
    month,
    primary: primary[index],
    secondary: secondary[index],
    trend: primary.slice(0, index + 1).reduce((sum, n) => sum + n, 0),
  }));
}

function activityTone(label: string): DashboardActivity["tone"] {
  const value = label.toLowerCase();
  if (value.includes("reject") || value.includes("delete") || value.includes("void")) return "delete";
  if (value.includes("create") || value.includes("register") || value.includes("new")) return "create";
  return "update";
}

function formatKesShort(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

export function buildModuleDashboard(
  moduleId: ModuleDashboardId,
  overview: AdminOverview,
  extras?: {
    applications?: PagedResult<ApplicationRow> | ApplicationRow[];
    members?: PagedResult<MemberRow> | MemberRow[];
  },
): ModuleDashboardModel {
  const applications = Array.isArray(extras?.applications)
    ? extras.applications
    : extras?.applications?.items ?? [];
  const members = Array.isArray(extras?.members) ? extras.members : extras?.members?.items ?? [];
  const appCount = Array.isArray(extras?.applications)
    ? extras.applications.length
    : extras?.applications?.totalCount ?? applications.length;
  const memberCount = Array.isArray(extras?.members)
    ? extras.members.length
    : extras?.members?.totalCount ?? overview.applications.existingMembers;

  const classBars = countBy(members.map((row) => row.membershipType).concat(applications.map((row) => row.membershipTypeName ?? "")));
  const statusBars = countBy(applications.map((row) => row.statusName || row.statusCode || "Unknown"));
  const memberStatusBars = countBy(members.map((row) => row.status));
  const paymentBars = overview.finances.recentTransactions.map((row) => ({ name: row.method, value: row.count }));
  const votingBars = countBy(members.map((row) => (row.canVote ? "Voting" : "Non-voting")));

  const appActivity: DashboardActivity[] = applications.slice(0, 12).map((row) => ({
    action: (row.statusName || row.statusCode || "UPDATE").toUpperCase(),
    staff: row.applicantName || row.applicationNo || `APP-${row.applicationId}`,
    by: "Desk",
    date: row.updatedAt || row.appliedAt || "",
    tone: activityTone(row.statusCode || row.statusName || ""),
  }));
  const memberActivity: DashboardActivity[] = members.slice(0, 12).map((row) => ({
    action: "MEMBER RECORD",
    staff: `${row.fullName} (${row.membershipNo})`,
    by: "Register",
    date: row.joinedDate || "",
    tone: "update",
  }));
  const meetingActivity: DashboardActivity[] = overview.governance.upcomingMeetings.map((row) => ({
    action: row.status.toUpperCase(),
    staff: row.title,
    by: row.meetingType,
    date: row.meetingDate,
    tone: "create",
  }));
  const stayActivity: DashboardActivity[] = overview.facilities.upcomingReservations.map((row) => ({
    action: "BOOKING",
    staff: `${row.memberName} · ${row.roomType}`,
    by: "Front desk",
    date: row.checkIn,
    tone: "create",
  }));

  const baseMonths = monthsFromDates(
    applications.map((row) => row.appliedAt),
    members.map((row) => row.joinedDate),
  );

  const defaults: Omit<ModuleDashboardModel, "moduleId" | "title"> = {
    kpis: [],
    ratioTitle: "Split",
    ratioTotalLabel: "Total",
    ratio: [],
    movementTitle: "Activity this year",
    movementPrimary: "In",
    movementSecondary: "Out",
    months: baseMonths,
    breakdownTitle: "Breakdown",
    breakdown: [],
    rankingTitle: "Top categories",
    ranking: [],
    activity: [],
    extraBreakdownTitle: "More statistics",
    extraBreakdown: [],
  };

  switch (moduleId) {
    case "applicant-queue":
      return {
        ...defaults,
        moduleId,
        title: "Manage Applicants",
        kpis: [
          { id: "pending", label: "Pending applications", value: overview.applications.pendingApprovals, icon: ClipboardList, tone: "violet", spark: spark(1) },
          { id: "all", label: "Applications in view", value: appCount, icon: UsersRound, tone: "sky", spark: spark(2) },
          { id: "wait", label: "Waitlisted", value: overview.applications.waitlisted, icon: UserCheck, tone: "emerald", spark: spark(3) },
          { id: "rejected", label: "Rejected", value: overview.applications.rejected, icon: Ban, tone: "rose", spark: spark(4.2) },
        ],
        ratioTitle: "Application outcome",
        ratioTotalLabel: "Queue",
        ratio: [
          { name: "Pending", value: overview.applications.pendingApprovals, color: NAVY },
          { name: "Waitlisted", value: overview.applications.waitlisted, color: GREEN },
          { name: "Rejected", value: overview.applications.rejected, color: ROSE },
        ],
        movementTitle: "Applications vs new members",
        movementPrimary: "Applications",
        movementSecondary: "Members",
        breakdownTitle: "Class breakdown",
        breakdown: classBars.slice(0, 6),
        rankingTitle: "Top application stages",
        ranking: statusBars.slice(0, 5),
        activity: appActivity,
        extraBreakdownTitle: "Sponsor / payment mix",
        extraBreakdown: countBy(applications.map((row) => row.paymentStatus || "Payment pending")).slice(0, 6),
      };
    case "manage-records":
      return {
        ...defaults,
        moduleId,
        title: "Manage records",
        kpis: [
          { id: "members", label: "Members on register", value: memberCount, icon: Users, tone: "violet", spark: spark(0.6) },
          { id: "all", label: "All records", value: memberCount + overview.applications.pendingApprovals, icon: FolderOpen, tone: "sky", spark: spark(1.4) },
          { id: "voting", label: "Voting members", value: members.filter((row) => row.canVote).length || overview.applications.existingMembers, icon: UserCheck, tone: "emerald", spark: spark(2.1) },
          { id: "arrears", label: "With arrears", value: members.filter((row) => row.outstandingArrears > 0).length, icon: UserMinus, tone: "rose", spark: spark(3.8) },
        ],
        ratioTitle: "Voting vs non-voting",
        ratioTotalLabel: "Members",
        ratio: votingBars.map((row, index) => ({
          name: row.name,
          value: row.value,
          color: index === 0 ? NAVY : GREEN,
        })),
        movementTitle: "Register movement",
        movementPrimary: "Joined",
        movementSecondary: "Applications",
        months: monthsFromDates(
          members.map((row) => row.joinedDate),
          applications.map((row) => row.appliedAt),
        ),
        breakdownTitle: "Membership class",
        breakdown: classBars.slice(0, 6),
        rankingTitle: "Member statuses",
        ranking: memberStatusBars.slice(0, 5),
        activity: memberActivity,
        extraBreakdownTitle: "Privileges",
        extraBreakdown: [
          { name: "Can vote", value: members.filter((row) => row.canVote).length },
          { name: "Can run for office", value: members.filter((row) => row.canRunForOffice).length },
          { name: "Guest introductions", value: members.filter((row) => row.canIntroduceGuests).length },
          { name: "Reciprocation", value: members.filter((row) => row.reciprocationAllowed).length },
        ],
      };
    case "manager-queue":
      return {
        ...defaults,
        moduleId,
        title: "Manager Review",
        kpis: [
          { id: "queue", label: "Awaiting review", value: overview.applications.pendingApprovals, icon: ClipboardCheck, tone: "violet", spark: spark(1.1) },
          { id: "ready", label: "In manager queue", value: appCount, icon: UsersRound, tone: "sky", spark: spark(2.2) },
          { id: "authorized", label: "Ready to authorize", value: applications.filter((row) => row.canAuthorizeToInterview).length, icon: UserCheck, tone: "emerald", spark: spark(0.9) },
          { id: "blocked", label: "Not ready", value: applications.filter((row) => row.canAuthorizeToInterview === false).length, icon: Ban, tone: "rose", spark: spark(4) },
        ],
        ratioTitle: "Readiness",
        ratioTotalLabel: "Queue",
        ratio: [
          { name: "Ready", value: applications.filter((row) => row.canAuthorizeToInterview).length, color: GREEN },
          { name: "Pending", value: applications.filter((row) => row.canAuthorizeToInterview !== true).length, color: NAVY },
        ],
        movementTitle: "Review volume",
        movementPrimary: "Queue",
        movementSecondary: "History",
        breakdownTitle: "Class breakdown",
        breakdown: classBars.slice(0, 6),
        rankingTitle: "Top stages",
        ranking: statusBars.slice(0, 5),
        activity: appActivity,
        extraBreakdownTitle: "Document / payment gates",
        extraBreakdown: [
          { name: "Payments ready", value: applications.filter((row) => row.stageAPaymentsReady).length },
          { name: "Documents ready", value: applications.filter((row) => row.stageADocumentsReady).length },
          { name: "Visits met", value: applications.filter((row) => row.clubVisitsMet).length },
        ],
      };
    case "finance":
      return {
        ...defaults,
        moduleId,
        title: "Financial & Payments",
        kpis: [
          { id: "revenue", label: "Subscriptions collected", value: formatKesShort(overview.finances.annualSubscriptionRevenue), icon: Wallet, tone: "violet", spark: spark(0.4) },
          { id: "tx", label: "Payments (30 days)", value: paymentBars.reduce((sum, row) => sum + row.value, 0), icon: CircleDollarSign, tone: "sky", spark: spark(1.7) },
          { id: "ok", label: "Paid this year", value: formatKesShort(overview.finances.annualSubscriptionRevenue), icon: UserCheck, tone: "emerald", spark: spark(2.4) },
          { id: "due", label: "Outstanding arrears", value: formatKesShort(overview.finances.outstandingBalances), icon: Ban, tone: "rose", spark: spark(3.3) },
        ],
        ratioTitle: "Payment methods",
        ratioTotalLabel: "Txns",
        ratio: paymentBars.slice(0, 4).map((row, index) => ({
          name: row.name,
          value: row.value,
          color: [NAVY, GREEN, GOLD, ROSE][index] ?? SLATE,
        })),
        movementTitle: "Collections vs arrears trend",
        movementPrimary: "Receipts",
        movementSecondary: "Arrears",
        breakdownTitle: "Method breakdown",
        breakdown: paymentBars,
        rankingTitle: "Top payment methods",
        ranking: paymentBars.slice(0, 5),
        activity: paymentBars.map((row) => ({
          action: "PAYMENT",
          staff: row.name,
          by: "Finance",
          date: overview.meta.generatedAt,
          tone: "update" as const,
        })),
        extraBreakdownTitle: "Balances",
        extraBreakdown: [
          { name: "Collected", value: Math.round(overview.finances.annualSubscriptionRevenue) },
          { name: "Outstanding", value: Math.round(overview.finances.outstandingBalances) },
        ],
      };
    case "guest-visits":
      return {
        ...defaults,
        moduleId,
        title: "Guest visits",
        kpis: [
          { id: "onsite", label: "Guests tracked", value: overview.facilities.occupiedRooms, icon: Users, tone: "violet", spark: spark(1) },
          { id: "rooms", label: "Club rooms in use", value: `${overview.facilities.occupiedRooms}/${overview.facilities.totalRooms}`, icon: BedDouble, tone: "sky", spark: spark(2) },
          { id: "hosts", label: "Active members", value: overview.applications.existingMembers, icon: UserCheck, tone: "emerald", spark: spark(0.5) },
          { id: "alerts", label: "Occupancy load", value: `${Math.round(overview.facilities.occupancyRate * 100)}%`, icon: UserMinus, tone: "rose", spark: spark(3.6) },
        ],
        ratioTitle: "Occupancy",
        ratioTotalLabel: "Rooms",
        ratio: [
          { name: "Occupied", value: overview.facilities.occupiedRooms, color: NAVY },
          { name: "Free", value: Math.max(0, overview.facilities.totalRooms - overview.facilities.occupiedRooms), color: GREEN },
        ],
        movementTitle: "Visits this year",
        movementPrimary: "Arrivals",
        movementSecondary: "Stays",
        breakdownTitle: "Room types",
        breakdown: countBy(overview.facilities.upcomingReservations.map((row) => row.roomType)),
        rankingTitle: "Upcoming stays",
        ranking: overview.facilities.upcomingReservations.slice(0, 5).map((row) => ({ name: row.memberName, value: 1 })),
        activity: stayActivity,
        extraBreakdownTitle: "Reservations",
        extraBreakdown: countBy(overview.facilities.upcomingReservations.map((row) => row.roomType)),
      };
    case "committee-manage":
      return {
        ...defaults,
        moduleId,
        title: "Committee manage",
        kpis: [
          { id: "active", label: "Active committee", value: overview.governance.activeCommitteeMembers, icon: Landmark, tone: "violet", spark: spark(0.8) },
          { id: "meetings", label: "Upcoming sittings", value: overview.governance.upcomingMeetings.length, icon: ClipboardList, tone: "sky", spark: spark(1.9) },
          { id: "ready", label: "Scheduled", value: overview.governance.upcomingMeetings.filter((row) => row.status.toLowerCase().includes("sched")).length, icon: UserCheck, tone: "emerald", spark: spark(2.6) },
          { id: "queue", label: "Applicants waiting", value: overview.applications.pendingApprovals, icon: UsersRound, tone: "rose", spark: spark(3.1) },
        ],
        ratioTitle: "Meeting types",
        ratioTotalLabel: "Meetings",
        ratio: countBy(overview.governance.upcomingMeetings.map((row) => row.meetingType)).map((row, index) => ({
          name: row.name,
          value: row.value,
          color: [NAVY, GREEN, GOLD][index] ?? SLATE,
        })),
        movementTitle: "Committee activity",
        movementPrimary: "Sittings",
        movementSecondary: "Applicants",
        breakdownTitle: "Committee roles",
        breakdown: countBy(overview.governance.committeeMembers.map((row) => row.role)),
        rankingTitle: "Officers",
        ranking: overview.governance.committeeMembers.slice(0, 5).map((row) => ({ name: `${row.name} · ${row.role}`, value: 1 })),
        activity: meetingActivity,
        extraBreakdownTitle: "Meeting status",
        extraBreakdown: countBy(overview.governance.upcomingMeetings.map((row) => row.status)),
      };
    case "agm-election":
      return {
        ...defaults,
        moduleId,
        title: "AGM/EGM Election",
        kpis: [
          { id: "members", label: "Eligible members", value: overview.applications.existingMembers, icon: Vote, tone: "violet", spark: spark(1.2) },
          { id: "committee", label: "Sitting officers", value: overview.governance.activeCommitteeMembers, icon: Landmark, tone: "sky", spark: spark(2.3) },
          { id: "meetings", label: "Notices / meetings", value: overview.governance.upcomingMeetings.length, icon: ClipboardList, tone: "emerald", spark: spark(0.7) },
          { id: "docs", label: "Documents", value: overview.governance.documents.length, icon: FolderOpen, tone: "rose", spark: spark(4.1) },
        ],
        ratioTitle: "Meeting mix",
        ratioTotalLabel: "Events",
        ratio: countBy(overview.governance.upcomingMeetings.map((row) => row.meetingType)).map((row, index) => ({
          name: row.name,
          value: row.value,
          color: [NAVY, GREEN][index] ?? GOLD,
        })),
        movementTitle: "Governance activity",
        movementPrimary: "Meetings",
        movementSecondary: "Members",
        breakdownTitle: "Committee roles",
        breakdown: countBy(overview.governance.committeeMembers.map((row) => row.role)),
        rankingTitle: "Upcoming meetings",
        ranking: overview.governance.upcomingMeetings.slice(0, 5).map((row) => ({ name: row.title, value: 1 })),
        activity: meetingActivity,
        extraBreakdownTitle: "Documents",
        extraBreakdown: overview.governance.documents.map((row) => ({ name: row.name, value: 1 })),
      };
    case "committee-ballot":
      return {
        ...defaults,
        moduleId,
        title: "Committee Ballot",
        kpis: [
          { id: "pending", label: "Applicants in ballot", value: overview.applications.pendingApprovals, icon: ClipboardCheck, tone: "violet", spark: spark(1.5) },
          { id: "committee", label: "Committee present", value: overview.governance.activeCommitteeMembers, icon: Users, tone: "sky", spark: spark(2.8) },
          { id: "quorum", label: "Quorum target", value: 7, icon: UserCheck, tone: "emerald", spark: spark(0.3) },
          { id: "adverse", label: "Adverse vote limit", value: 2, icon: Ban, tone: "rose", spark: spark(3.9) },
        ],
        ratioTitle: "Ballot queue",
        ratioTotalLabel: "Cases",
        ratio: [
          { name: "Pending", value: overview.applications.pendingApprovals, color: NAVY },
          { name: "Waitlisted", value: overview.applications.waitlisted, color: GREEN },
        ],
        movementTitle: "Admission volume",
        movementPrimary: "Applicants",
        movementSecondary: "Members",
        breakdownTitle: "Class breakdown",
        breakdown: classBars.slice(0, 6),
        rankingTitle: "Stages",
        ranking: statusBars.slice(0, 5),
        activity: appActivity,
        extraBreakdownTitle: "Committee",
        extraBreakdown: countBy(overview.governance.committeeMembers.map((row) => row.role)),
      };
    case "accommodation":
      return {
        ...defaults,
        moduleId,
        title: "Accommodation",
        kpis: [
          { id: "rooms", label: "Rooms", value: overview.facilities.totalRooms, icon: BedDouble, tone: "violet", spark: spark(0.9) },
          { id: "busy", label: "Occupied / booked", value: overview.facilities.occupiedRooms, icon: Users, tone: "sky", spark: spark(1.6) },
          { id: "rate", label: "Occupancy", value: `${Math.round(overview.facilities.occupancyRate * 100)}%`, icon: UserCheck, tone: "emerald", spark: spark(2.2) },
          { id: "soon", label: "Upcoming stays", value: overview.facilities.upcomingReservations.length, icon: ClipboardList, tone: "rose", spark: spark(3.4) },
        ],
        ratioTitle: "Room occupancy",
        ratioTotalLabel: "Rooms",
        ratio: [
          { name: "Occupied", value: overview.facilities.occupiedRooms, color: NAVY },
          { name: "Available", value: Math.max(0, overview.facilities.totalRooms - overview.facilities.occupiedRooms), color: GREEN },
        ],
        movementTitle: "Bookings this year",
        movementPrimary: "Check-in",
        movementSecondary: "Check-out",
        months: monthsFromDates(
          overview.facilities.upcomingReservations.map((row) => row.checkIn),
          overview.facilities.upcomingReservations.map((row) => row.checkOut),
        ),
        breakdownTitle: "Room types",
        breakdown: countBy(overview.facilities.upcomingReservations.map((row) => row.roomType)),
        rankingTitle: "Upcoming guests",
        ranking: overview.facilities.upcomingReservations.slice(0, 5).map((row) => ({ name: row.memberName, value: 1 })),
        activity: stayActivity,
        extraBreakdownTitle: "Stay mix",
        extraBreakdown: countBy(overview.facilities.upcomingReservations.map((row) => row.roomType)),
      };
    case "support":
      return {
        ...defaults,
        moduleId,
        title: "Support",
        kpis: [
          { id: "open", label: "Open queues", value: overview.applications.pendingApprovals, icon: Headset, tone: "violet", spark: spark(1.3) },
          { id: "apps", label: "Application issues", value: overview.applications.waitlisted, icon: ClipboardList, tone: "sky", spark: spark(2.5) },
          { id: "finance", label: "Payment follow-ups", value: Math.round(overview.finances.outstandingBalances > 0 ? 1 : 0), icon: Wallet, tone: "emerald", spark: spark(0.2) },
          { id: "closed", label: "Rejected / closed", value: overview.applications.rejected, icon: Ban, tone: "rose", spark: spark(3.7) },
        ],
        ratioTitle: "Queue mix",
        ratioTotalLabel: "Items",
        ratio: [
          { name: "Applications", value: overview.applications.pendingApprovals, color: NAVY },
          { name: "Waitlist", value: overview.applications.waitlisted, color: GREEN },
        ],
        movementTitle: "Support volume",
        movementPrimary: "New",
        movementSecondary: "Closed",
        breakdownTitle: "Sources",
        breakdown: [
          { name: "Membership desk", value: overview.applications.pendingApprovals },
          { name: "Finance", value: overview.finances.recentTransactions.reduce((sum, row) => sum + row.count, 0) },
          { name: "Accommodation", value: overview.facilities.upcomingReservations.length },
        ],
        rankingTitle: "Hot queues",
        ranking: statusBars.slice(0, 5),
        activity: appActivity,
        extraBreakdownTitle: "Payment methods needing follow-up",
        extraBreakdown: paymentBars,
      };
    case "setting":
      return {
        ...defaults,
        moduleId,
        title: "Setting",
        kpis: [
          { id: "roles", label: "Staff modules", value: 11, icon: Settings, tone: "violet", spark: spark(0.5) },
          { id: "members", label: "Member accounts", value: overview.applications.existingMembers, icon: Users, tone: "sky", spark: spark(1.8) },
          { id: "committee", label: "Committee seats", value: overview.governance.activeCommitteeMembers, icon: Landmark, tone: "emerald", spark: spark(2.7) },
          { id: "lookups", label: "Documents on file", value: overview.governance.documents.length, icon: FolderOpen, tone: "rose", spark: spark(3.2) },
        ],
        ratioTitle: "Access mix",
        ratioTotalLabel: "Seats",
        ratio: [
          { name: "Members", value: overview.applications.existingMembers, color: NAVY },
          { name: "Committee", value: overview.governance.activeCommitteeMembers, color: GREEN },
        ],
        movementTitle: "Configuration activity",
        movementPrimary: "Members",
        movementSecondary: "Committee",
        breakdownTitle: "Committee roles",
        breakdown: countBy(overview.governance.committeeMembers.map((row) => row.role)),
        rankingTitle: "Club documents",
        ranking: overview.governance.documents.slice(0, 5).map((row) => ({ name: row.name, value: 1 })),
        activity: meetingActivity,
        extraBreakdownTitle: "Document status",
        extraBreakdown: countBy(overview.governance.documents.map((row) => row.status)),
      };
    default:
      return { ...defaults, moduleId, title: "Dashboard" };
  }
}
