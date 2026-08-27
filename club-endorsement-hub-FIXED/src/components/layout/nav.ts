import {
  BadgeCheck,
  BedDouble,
  Bell,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  FileText,
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
      { label: "Application Status", to: "/applications", icon: FileClock },
      { label: "Profile", to: "/profile", icon: UserRound },
      { label: "Documents", to: "/documents", icon: FileText },
      { label: "Payment History", to: "/payment", icon: Receipt },
      { label: "Support", to: "/support", icon: LifeBuoy },
    ],
  },
];

function memberCardNav(
  label: string,
  item: AppNavItem,
): AppNavGroup[] {
  return [
    {
      label,
      items: [item],
    },
  ];
}

function electedMemberModuleNav(pathname: string): AppNavGroup[] {
  if (pathname === "/profile" || pathname.startsWith("/profile/")) {
    return memberCardNav("My Profile", {
      label: "My Profile",
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
  if (pathname === "/election" || pathname === "/committee-ballot") {
    return [
      {
        label: "Election",
        items: [
          {
            label: "Election",
            to: "/election",
            icon: Vote,
            card: "election",
          },
        ],
      },
      {
        label: "Membership admission",
        items: [
          {
            label: "Committee Ballot",
            to: "/committee-ballot",
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
    return memberCardNav("Proposer requests", {
      label: "Proposer requests",
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
  return [];
}

const MEMBER_DESK_NAV: AppNavGroup[] = [
  {
    label: "Applicant",
    collapsible: true,
    items: [
      { label: "Pending application", to: "/members", icon: FileClock, search: {} },
      { label: "Authorize Applicant", to: "/members", icon: ShieldCheck, search: { view: "authorize" } },
    ],
  },
  {
    label: "Member management",
    collapsible: true,
    items: [
      {
        label: "Existing member",
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
    label: "User management",
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
    label: "Notification",
    items: [
      {
        label: "Stage A queue",
        to: "/members",
        icon: ClipboardCheck,
        search: { view: "manager" },
      },
    ],
  },
];

const FINANCE_NAV: AppNavGroup[] = [
  {
    label: "Financial & Payments",
    items: [
      { label: "Finance desk", to: "/finance", icon: Wallet },
      { label: "Subscriptions & receipts", to: "/finance", icon: Receipt, match: ["/finance"] },
    ],
  },
];

const GOVERNANCE_NAV: AppNavGroup[] = [
  {
    label: "Committee manage",
    collapsible: true,
    items: [
      {
        label: "New committee term",
        to: "/manage-committee",
        icon: CalendarPlus,
        search: { section: "new-term" },
      },
      {
        label: "Current term",
        to: "/manage-committee",
        icon: Landmark,
        search: { section: "current-term" },
      },
      {
        label: "Members",
        to: "/manage-committee",
        icon: Users,
        search: { section: "members" },
      },
        {
          label: "Meetings",
          to: "/manage-committee",
          icon: CalendarDays,
          search: { section: "meetings" },
        },
      ],
    },
    {
      label: "AGM/EGM Election",
      items: [
        {
          label: "Election admin",
          to: "/election",
          icon: Vote,
        },
      ],
    },
    {
      label: "Membership admission",
      items: [
        {
          label: "Committee Ballot",
          to: "/committee-ballot",
          icon: ClipboardList,
        },
      ],
    },
  ];

const ACCOMMODATION_NAV: AppNavGroup[] = [
  {
    label: "Accommodation",
    items: [
      { label: "Rooms & bookings", to: "/accommodation", icon: BedDouble },
      { label: "Occupancy", to: "/accommodation", icon: LayoutGrid, match: ["/accommodation"] },
    ],
  },
];

const SUPPORT_NAV: AppNavGroup[] = [
  {
    label: "Support",
    items: [
      { label: "Help desk", to: "/support", icon: Headset },
      { label: "Member queries", to: "/support", icon: LifeBuoy, match: ["/support"] },
    ],
  },
];

const SETTINGS_NAV: AppNavGroup[] = [
  {
    label: "Setting",
    items: [
      { label: "Club preferences", to: "/settings", icon: Settings },
      {
        label: "User management",
        to: "/user-management",
        icon: UserCog,
        roles: ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"],
      },
    ],
  },
];

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

  if (isMemberDeskPath(pathname)) return MEMBER_DESK_NAV;
  if (pathname === "/finance" || pathname.startsWith("/finance/")) return FINANCE_NAV;
  if (
    pathname === "/governance" ||
    pathname.startsWith("/governance/") ||
    pathname === "/manage-committee" ||
    pathname.startsWith("/manage-committee/") ||
    pathname === "/election" ||
    pathname === "/committee-ballot" ||
    pathname.startsWith("/committee-ballot/")
  ) {
    return GOVERNANCE_NAV;
  }
  if (pathname === "/accommodation" || pathname.startsWith("/accommodation/")) return ACCOMMODATION_NAV;
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
  const groups =
    isStaff(user) && mode === "admin"
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

function currentTab(search: unknown) {
  if (search && typeof search === "object" && "tab" in search) {
    const tab = String((search as { tab?: unknown }).tab ?? "");
    if (tab === "register" || tab === "privileges") return tab;
  }
  return "register";
}

function currentView(search: unknown) {
  if (search && typeof search === "object" && "view" in search) {
    return String((search as { view?: unknown }).view ?? "");
  }
  return "";
}

function currentSection(search: unknown) {
  if (search && typeof search === "object" && "section" in search) {
    return String((search as { section?: unknown }).section ?? "");
  }
  return "";
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
    // Default landing highlights first manage section.
    if (item.to === "/manage-committee" && item.search.section === "new-term") return true;
    if (item.to === "/manage-committee" && item.search.section === "current-term") return false;
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
  // Default Pending applications: /members with no special view.
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
    return pathname === to || pathname.startsWith(`${to}/`);
  });
}
