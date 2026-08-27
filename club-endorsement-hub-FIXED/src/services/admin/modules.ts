import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  ClipboardCheck,
  ClipboardList,
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
};

export const ADMIN_MODULES: AdminModule[] = [
  {
    id: "members",
    title: "Members",
    description: "Applications, register, privileges & member desk.",
    to: "/members",
    icon: UsersRound,
    tone: "amber",
  },
  {
    id: "manager-queue",
    title: "Notification",
    description: "Manager queue — verify applications, authorize interview, assign to committee meeting.",
    to: "/members",
    search: { view: "manager" },
    icon: ClipboardCheck,
    tone: "sky",
  },
  {
    id: "finance",
    title: "Financial & Payments",
    description: "Subscriptions, receipts & arrears.",
    to: "/finance",
    icon: Wallet,
    tone: "sky",
  },
  {
    id: "committee-manage",
    title: "Committee manage",
    description: "Terms, sitting members and committee meetings.",
    to: "/manage-committee",
    search: { section: "new-term" },
    icon: Landmark,
    tone: "violet",
  },
  {
    id: "agm-election",
    title: "AGM/EGM Election",
    description: "Notices, nominations, e-ballot, tally and Chairman's declaration.",
    to: "/election",
    icon: Vote,
    tone: "sky",
  },
  {
    id: "committee-ballot",
    title: "Committee Ballot",
    description: "Membership admission ballot — quorum 7, two adverse votes exclude.",
    to: "/committee-ballot",
    icon: ClipboardList,
    tone: "violet",
  },
  {
    id: "accommodation",
    title: "Accommodation",
    description: "Rooms, occupancy & bookings.",
    to: "/accommodation",
    icon: BedDouble,
    tone: "emerald",
  },
  {
    id: "support",
    title: "Support",
    description: "Help desk, tickets & member queries.",
    to: "/support",
    icon: Headset,
    tone: "rose",
  },
  {
    id: "setting",
    title: "Setting",
    description: "Users, roles & club preferences.",
    to: "/settings",
    icon: Settings,
    tone: "slate",
  },
];
