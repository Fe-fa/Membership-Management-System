import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  ClipboardCheck,
  ClipboardList,
  ConciergeBell,
  Headset,
  Landmark,
  Settings,
  UsersRound,
  Vote,
  Wallet,
} from "lucide-react";

export type AdminModuleTone = "amber" | "sky" | "violet" | "emerald" | "rose" | "slate";

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
    icon: ConciergeBell,
    tone: "emerald",
    roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
  },
  {
    id: "members",
    title: "Members",
    description: "Applications, register, privileges & member desk.",
    to: "/members",
    icon: UsersRound,
    tone: "amber",
    roles: STAFF_OPS,
  },
  {
    id: "manager-queue",
    title: "Manager Review",
    description: "Manager review queue for membership applications.",
    to: "/members",
    search: { view: "manager", section: "pending" },
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
    to: "/manage-committee/new-term",
    icon: Landmark,
    tone: "violet",
    roles: STAFF_OPS,
  },
  {
    id: "agm-election",
    title: "AGM/EGM Election",
    description: "Notices, nominations, e-ballot, tally and Chairman's declaration.",
    to: "/election",
    icon: Vote,
    tone: "sky",
    roles: STAFF_OPS,
  },
  {
    id: "committee-ballot",
    title: "Committee Ballot",
    description: "Membership admission ballot — quorum 7, two adverse votes exclude.",
    to: "/committee-ballot/attendance",
    icon: ClipboardList,
    tone: "violet",
    roles: STAFF_OPS,
  },
  {
    id: "accommodation",
    title: "Accommodation",
    description: "Rooms, occupancy & bookings.",
    to: "/accommodation",
    icon: BedDouble,
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
    id: "setting",
    title: "Setting",
    description: "RBAC role assignment, user accounts & club preferences.",
    to: "/settings",
    icon: Settings,
    tone: "slate",
    roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
  },
];
