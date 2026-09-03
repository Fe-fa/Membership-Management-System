import {
  BadgeCheck,
  BedDouble,
  Bell,
  Clock,
  History,
  ClipboardCheck,
  ClipboardList,
  ConciergeBell,
  FileClock,
  FileText,
  BookUser,
  CircleAlert,
  ClipboardPen,
  Headset,
  Landmark,
  LayoutGrid,
  LifeBuoy,
  Receipt,
  Settings,
  ShieldCheck,
  UserPlus,
  UserRound,
  UserCog,
  Users,
  UsersRound,
  Vote,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { hasAnyRole, isClubMember, isStaff, readPortalMode, type AuthUser } from "@/lib/auth";
import type { MemberDashboard } from "@/services/member/dashboard";

export type AppNavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  match?: string[];
  search?: Record<string, string>;
  roles?: string[];
  card?: keyof MemberDashboard["cards"];
  disabled?: boolean;
};

export type AppNavGroup = {
  label: string;
  items: AppNavItem[];
  collapsible?: boolean;
};

const APPLICANT_NAV: AppNavGroup[] = [
  {
    label: "Applicant",
    items: [
      { label: "Home", to: "/", icon: LayoutGrid },
      { label: "Application status", to: "/applications", icon: FileClock },
      { label: "Profile", to: "/profile", icon: UserRound },
      { label: "Documents", to: "/documents", icon: FileText },
      { label: "Payment history", to: "/payment", icon: Receipt },
      { label: "Support", to: "/support", icon: LifeBuoy },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

function memberCardNav(label: string, item: AppNavItem): AppNavGroup[] {
  return [{ label, items: [item] }];
}

function electedMemberModuleNav(pathname: string): AppNavGroup[] {
  if (pathname === "/profile" || pathname.startsWith("/profile/")) {
    return memberCardNav("My profile", {
      label: "My profile",
      to: "/profile",
      icon: UserRound,
      card: "profile",
    });
  }
  if (pathname === "/payment" || pathname.startsWith("/payment/")) {
    return memberCardNav("Subscriptions", {
      label: "Subscriptions",
      to: "/payment",
      icon: Receipt,
      card: "subscriptions",
    });
  }
  if (pathname === "/guests" || pathname.startsWith("/guests/")) {
    return memberCardNav("Guests", {
      label: "Guests",
      to: "/guests",
      icon: Users,
      card: "guests",
    });
  }
  if (pathname === "/governance" || pathname.startsWith("/governance/")) {
    return [
      {
        label: "Committee",
        collapsible: true,
        items: [
          {
            label: "Current committee",
            to: "/governance",
            icon: Landmark,
            card: "committee",
          },
        ],
      },
    ];
  }
  if (pathname === "/election" || pathname.startsWith("/election/")) {
    return [
      {
        label: "AGM / EGM Election",
        items: [{ label: "Election", to: "/election", icon: Vote, card: "election" }],
      },
    ];
  }
  if (pathname === "/committee-ballot" || pathname.startsWith("/committee-ballot/")) {
    return [
      {
        label: "Committee Ballot",
        items: [
          {
            label: "Mark members present",
            to: "/committee-ballot/attendance",
            icon: ClipboardCheck,
            card: "committeeBallot",
          },
          {
            label: "Pending applicants",
            to: "/committee-ballot/pending",
            icon: UserPlus,
            card: "committeeBallot",
          },
          {
            label: "Ballot per candidate",
            to: "/committee-ballot/candidates",
            icon: ClipboardList,
            card: "committeeBallot",
          },
        ],
      },
    ];
  }
  if (pathname === "/accommodation" || pathname.startsWith("/accommodation/")) {
    return memberCardNav("Accommodation", {
      label: "Accommodation",
      to: "/accommodation",
      icon: BedDouble,
      card: "accommodation",
    });
  }
  if (pathname === "/endorsements" || pathname.startsWith("/endorsements/")) {
    return memberCardNav("Endorsements", {
      label: "Request",
      to: "/endorsements",
      icon: Bell,
      card: "endorsements",
    });
  }
  if (pathname === "/documents" || pathname.startsWith("/documents/")) {
    return memberCardNav("Documents", {
      label: "Documents",
      to: "/documents",
      icon: FileText,
      card: "documents",
    });
  }
  if (pathname === "/support" || pathname.startsWith("/support/")) {
    return memberCardNav("Support", {
      label: "Support",
      to: "/support",
      icon: LifeBuoy,
    });
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return PERSONAL_SETTINGS_NAV;
  }
  return [];
}

const MEMBER_DESK_NAV: AppNavGroup[] = [
  {
    label: "Applications",
    collapsible: true,
    items: [
      { label: "Pending applications", to: "/members", icon: FileClock, search: {} },
      {
        label: "Authorize applicants",
        to: "/members",
        icon: ShieldCheck,
        search: { view: "authorize" },
      },
    ],
  },
  {
    label: "Members",
    collapsible: true,
    items: [
      {
        label: "Member register",
        to: "/existing-members",
        icon: UsersRound,
        search: { tab: "register" },
      },
      { label: "Register member", to: "/register-member", icon: UserPlus },
      {
        label: "Assign privileges",
        to: "/existing-members",
        icon: BadgeCheck,
        search: { tab: "privileges" },
      },
    ],
  },
  {
    label: "Users",
    items: [
      {
        label: "User management",
        to: "/user-management",
        icon: UserCog,
        roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
      },
    ],
  },
];

/** Own sidebar for the Notification admin card (Stage A). */
const MANAGER_STAGE_NAV: AppNavGroup[] = [
  {
    label: "MANAGER REVIEW",
    items: [
      {
        label: "Pending review",
        to: "/members",
        icon: ClipboardCheck,
        search: { view: "manager", section: "pending" },
      },
      {
        label: "Authorized history",
        to: "/members",
        icon: ClipboardList,
        search: { view: "manager", section: "history" },
      },
    ],
  },
];

const FINANCE_NAV: AppNavGroup[] = [
  {
    label: "Finance",
    items: [
      { label: "Finance desk", to: "/finance", icon: Wallet },
      {
        label: "Subscriptions & receipts",
        to: "/finance",
        icon: Receipt,
        match: ["/finance"],
      },
    ],
  },
];

const COMMITTEE_MANAGE_NAV: AppNavGroup[] = [
  {
    label: "Committee",
    collapsible: true,
    items: [
      {
        label: "Committee term",
        to: "/manage-committee/new-term",
        icon: Landmark,
        match: ["/manage-committee/new-term", "/manage-committee/current-term"],
      },
      {
        label: "Committee members",
        to: "/manage-committee/members",
        icon: Users,
      },
    ],
  },
  {
    label: "Meetings",
    collapsible: true,
    items: [
      {
        label: "Pending application",
        to: "/manage-committee/meetings/pending",
        icon: UserPlus,
      },
      {
        label: "Waiting for meeting",
        to: "/manage-committee/meetings/waiting",
        icon: Clock,
      },
      {
        label: "Short interview",
        to: "/manage-committee/meetings/interview",
        icon: ClipboardCheck,
        match: ["/manage-committee/meetings/interview"],
      },
      {
        label: "Interview history",
        to: "/manage-committee/meetings/history",
        icon: History,
      },
    ],
  },
];

const COMMITTEE_BALLOT_NAV: AppNavGroup[] = [
  {
    label: "Committee Ballot",
    items: [
      {
        label: "Mark members present",
        to: "/committee-ballot/attendance",
        icon: ClipboardCheck,
      },
      {
        label: "Pending applicants",
        to: "/committee-ballot/pending",
        icon: UserPlus,
      },
      {
        label: "Ballot per candidate",
        to: "/committee-ballot/candidates",
        icon: ClipboardList,
      },
    ],
  },
];

const ELECTION_NAV: AppNavGroup[] = [
  {
    label: "AGM / EGM Election",
    items: [{ label: "Election desk", to: "/election", icon: Vote }],
  },
];

const ACCOMMODATION_NAV: AppNavGroup[] = [
  {
    label: "Accommodation",
    items: [
      { label: "Rooms & bookings", to: "/accommodation", icon: BedDouble },
      {
        label: "Occupancy",
        to: "/accommodation",
        icon: LayoutGrid,
        match: ["/accommodation"],
      },
    ],
  },
];

const SUPPORT_NAV: AppNavGroup[] = [
  {
    label: "Support",
    items: [
      { label: "Help desk", to: "/support", icon: Headset },
      {
        label: "Member queries",
        to: "/support",
        icon: LifeBuoy,
        match: ["/support"],
      },
    ],
  },
];

const RECEPTION_NAV: AppNavGroup[] = [
  {
    label: "Reception",
    items: [
      {
        label: "Guest Directory (Lookup)",
        to: "/reception",
        icon: BookUser,
        search: { section: "lookup" },
        roles: ["RECEPTIONIST"],
      },
      {
        label: "Log Visit",
        to: "/reception",
        icon: ClipboardPen,
        search: { section: "visit" },
        roles: ["RECEPTIONIST"],
      },
      {
        label: "Guests On Site",
        to: "/reception",
        icon: Users,
        search: { section: "onsite" },
        roles: ["RECEPTIONIST"],
      },
      {
        label: "Visit Policy & Rules",
        to: "/reception",
        icon: CircleAlert,
        search: { section: "policy" },
        roles: ["RECEPTIONIST"],
      },
      {
        label: "Guest visits",
        to: "/reception",
        icon: ConciergeBell,
        roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
      },
    ],
  },
];

const SETTINGS_NAV: AppNavGroup[] = [
  {
    label: "Settings",
    items: [
      { label: "Settings home", to: "/settings", icon: Settings },
      {
        label: "Role-based access",
        to: "/settings/rbac",
        icon: ShieldCheck,
        roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
      },
      {
        label: "Club preferences",
        to: "/settings/club",
        icon: Settings,
        roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
      },
      {
        label: "User accounts",
        to: "/user-management",
        icon: UserCog,
        roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
      },
    ],
  },
];

const PERSONAL_SETTINGS_NAV: AppNavGroup[] = [
  {
    label: "Settings",
    items: [
      { label: "Settings home", to: "/settings", icon: Settings },
      { label: "Account & Profile", to: "/settings/account", icon: UserRound },
      { label: "Privacy & Data", to: "/settings/privacy", icon: ShieldCheck },
      { label: "Interface", to: "/settings/appearance", icon: Settings },
      { label: "Automations", to: "/settings/automations", icon: Clock },
    ],
  },
];

function currentView(search: unknown): string {
  if (search && typeof search === "object" && "view" in search) {
    return String((search as { view?: unknown }).view ?? "");
  }
  return "";
}

function currentTab(search: unknown): string {
  if (search && typeof search === "object" && "tab" in search) {
    const tab = String((search as { tab?: unknown }).tab ?? "");
    if (tab === "register" || tab === "privileges") return tab;
  }
  return "register";
}

function currentSection(search: unknown): string {
  if (search && typeof search === "object" && "section" in search) {
    return String((search as { section?: unknown }).section ?? "");
  }
  return "";
}

function isMemberDeskPath(pathname: string) {
  return (
    pathname === "/members" ||
    pathname.startsWith("/members/") ||
    pathname === "/existing-members" ||
    pathname.startsWith("/existing-members/") ||
    pathname === "/register-member" ||
    pathname === "/user-management" ||
    pathname.startsWith("/user-management/")
  );
}

function staffModuleNav(pathname: string, search?: unknown): AppNavGroup[] {
  const view = currentView(search);

  // Notification card — dedicated sidebar (not mixed with Members).
  if (
    (pathname === "/members" || pathname.startsWith("/members/")) &&
    view === "manager"
  ) {
    return MANAGER_STAGE_NAV;
  }

  if (pathname === "/reception" || pathname.startsWith("/reception/")) return RECEPTION_NAV;
  if (isMemberDeskPath(pathname)) return MEMBER_DESK_NAV;
  if (pathname === "/finance" || pathname.startsWith("/finance/")) return FINANCE_NAV;
  if (pathname === "/governance" || pathname.startsWith("/governance/") || pathname === "/manage-committee" || pathname.startsWith("/manage-committee/")) {
    return COMMITTEE_MANAGE_NAV;
  }
  if (pathname === "/committee-ballot" || pathname.startsWith("/committee-ballot/")) {
    return COMMITTEE_BALLOT_NAV;
  }
  if (pathname === "/election" || pathname.startsWith("/election/")) {
    return ELECTION_NAV;
  }
  if (pathname === "/accommodation" || pathname.startsWith("/accommodation/")) {
    return ACCOMMODATION_NAV;
  }
  if (pathname === "/support" || pathname.startsWith("/support/")) return SUPPORT_NAV;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return SETTINGS_NAV;
  // /admin dashboard has no module sidebar (cards only).
  return [];
}

export function navForUser(
  user: AuthUser | null,
  pathname = "/",
  member: MemberDashboard | null = null,
  search?: unknown,
): AppNavGroup[] {
  const mode = readPortalMode(user);
  const onSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const groups =
    onSettings && !(isStaff(user) && mode === "admin")
      ? PERSONAL_SETTINGS_NAV
      : isStaff(user) && mode === "admin"
        ? staffModuleNav(pathname, search)
        : mode === "member" || (mode !== "applicant" && isClubMember(user) && !isStaff(user))
          ? electedMemberModuleNav(pathname)
          : APPLICANT_NAV;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.roles && !hasAnyRole(user, item.roles)) return false;
        if (item.card && member) return Boolean(member.cards[item.card]);
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function isNavActive(
  pathname: string,
  search: unknown,
  item: Pick<AppNavItem, "to" | "match" | "search">,
) {
  if (item.search?.section) {
    const section = currentSection(search);
    const onPath = pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (!onPath) return false;
    if (section) return section === item.search.section;
    if (item.to === "/reception" && item.search.section === "lookup") return true;
    if (currentView(search) === "manager" && item.search.section === "pending") return true;
    return false;
  }
  if (item.search?.view) {
    return (
      (pathname === item.to || pathname.startsWith(`${item.to}/`)) &&
      currentView(search) === item.search.view
    );
  }
  if (item.search?.tab) {
    return pathname === item.to && currentTab(search) === item.search.tab;
  }
  // Default Pending applications: /members without manager/authorize view.
  if (item.to === "/members" && (!item.search || Object.keys(item.search).length === 0)) {
    const view = currentView(search);
    return (
      (pathname === "/members" || pathname.startsWith("/members/")) &&
      view !== "authorize" &&
      view !== "manager"
    );
  }
  const targets = item.match ?? [item.to];
  return targets.some((to) => {
    if (to === "/") return pathname === "/";
    if (to === "/settings") return pathname === "/settings" || pathname === "/settings/";
    return pathname === to || pathname.startsWith(`${to}/`);
  });
}
