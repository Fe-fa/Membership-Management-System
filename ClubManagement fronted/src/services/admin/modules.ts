import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  ConciergeBell,
  FolderOpen,
  Headset,
  Landmark,
  Settings,
  UsersRound,
  Vote,
  Wallet,
} from "lucide-react";

export type AdminModuleTone = "amber" | "sky" | "violet" | "emerald" | "rose" | "slate";

export const ADMIN_MODULE_CATEGORIES = [
  "All",
  "Membership",
  "Finance",
  "Governance",
  "Club services",
  "Setup",
] as const;

export type AdminModuleCategory = (typeof ADMIN_MODULE_CATEGORIES)[number];

const MODULE_CATEGORY: Record<string, Exclude<AdminModuleCategory, "All">> = {
  "guest-visits": "Membership",
  "applicant-queue": "Membership",
  "manage-records": "Membership",
  "manager-queue": "Membership",
  finance: "Finance",
  "committee-manage": "Governance",
  "agm-election": "Governance",
  "committee-ballot": "Governance",
  accommodation: "Club services",
  events: "Club services",
  support: "Club services",
  "club-setup": "Setup",
  setting: "Setup",
};

export function adminModuleCategory(moduleId: string): AdminModuleCategory {
  return MODULE_CATEGORY[moduleId] ?? "All";
}

export type AdminModule = {
  id: string;
  title: string;
  description: string;
  to?: string;
  search?: Record<string, string>;
  icon: LucideIcon;
  tone: AdminModuleTone;
  locked?: boolean;
  roles?: string[];
};

const STAFF_OPS = ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "TREASURER", "COMMITTEE_MEMBER"];

export const ADMIN_MODULES: AdminModule[] = [
  {
    id: "guest-visits",
    title: "Guest visits",
    description: "View guests in the club and the member who accompanied them.",
    to: "/reception",
    search: { section: "visit" },
    icon: ConciergeBell,
    tone: "emerald",
    roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
  },
  {
    id: "applicant-queue",
    title: "Applicant Management",
    description: "Pending applications and authorize applicants.",
    to: "/members",
    icon: UsersRound,
    tone: "amber",
    roles: STAFF_OPS,
  },
  {
    id: "manage-records",
    title: "Manage records and members",
    description: "Member register, privileges & user accounts.",
    to: "/existing-members",
    search: { tab: "dashboard" },
    icon: FolderOpen,
    tone: "violet",
    roles: STAFF_OPS,
  },
  {
    id: "manager-queue",
    title: "Manager Review",
    description: "Manager review queue for membership applications.",
    to: "/members",
    search: { view: "manager", section: "dashboard" },
    icon: ClipboardCheck,
    tone: "sky",
    roles: STAFF_OPS,
  },
  {
    id: "finance",
    title: "Financial & Payments",
    description: "Approve cheque & credit payments, subscriptions, receipts & arrears.",
    to: "/finance",
    icon: Wallet,
    tone: "sky",
    roles: STAFF_OPS,
  },
  {
    id: "committee-manage",
    title: "Committee manage",
    description: "Terms, sittings, and interview scheduling for manager-authorized applicants.",
    to: "/manage-committee",
    icon: Landmark,
    tone: "violet",
    roles: STAFF_OPS,
  },
  {
    id: "agm-election",
    title: "AGM/EGM Election",
    description: "Notices, nominations, e-ballot, tally, Chairman's declaration and minutes.",
    to: "/election",
    icon: Vote,
    tone: "sky",
    roles: STAFF_OPS,
  },
  {
    id: "committee-ballot",
    title: "Committee Ballot",
    description: "Membership admission ballot — quorum 7, two adverse votes exclude.",
    to: "/committee-ballot",
    icon: ClipboardList,
    tone: "violet",
    roles: STAFF_OPS,
  },
  {
    id: "accommodation",
    title: "Accommodation",
    description: "Rooms, occupancy & bookings.",
    to: "/accommodation",
    search: { view: "dashboard" },
    icon: BedDouble,
    tone: "emerald",
    roles: STAFF_OPS,
  },
  {
    id: "events",
    title: "Events",
    description: "Manage club events, registrations, attendance, venues, and event communication.",
    to: "/events",
    search: { section: "home" },
    icon: CalendarDays,
    tone: "emerald",
    roles: STAFF_OPS,
  },
  {
    id: "support",
    title: "Support",
    description: "Help desk, tickets & member queries.",
    to: "/support",
    icon: Headset,
    tone: "rose",
    roles: STAFF_OPS,
  },
  {
    id: "club-setup",
    title: "Club setup",
    description: "Countries, companies, and designations.",
    to: "/club-setup/companies",
    icon: Building2,
    tone: "slate",
    roles: ["SUPER_ADMIN"],
  },
  {
    id: "setting",
    title: "Setting",
    description: "Setup, roles, accounts, lookups, fees & club preferences.",
    to: "/settings/rbac",
    icon: Settings,
    tone: "slate",
    roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
  },
];
