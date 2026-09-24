import { Link, useRouterState } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { readPortalMode, readUser, type PortalMode } from "@/lib/auth";
import { Fragment } from "react";

export type AppCrumb = {
  label: string;
  to?: string;
  search?: Record<string, string>;
};

function homeCrumb(mode: PortalMode): AppCrumb {
  if (mode === "admin") return { label: "Admin dashboard", to: "/admin" };
  return { label: "Home", to: "/" };
}

function membersCrumbs(search: Record<string, unknown>): AppCrumb[] {
  const view = String(search.view ?? "");
  const section = String(search.section ?? "");
  if (view === "manager") {
    if (section === "dashboard") {
      return [{ label: "Manager Review", to: "/members", search: { view: "manager", section: "dashboard" } }, { label: "Dashboard" }];
    }
    return [
      { label: "Manager Review", to: "/members", search: { view: "manager", section: "pending" } },
      { label: section === "history" ? "Authorized history" : "Pending review" },
    ];
  }
  if (view === "dashboard") {
    return [{ label: "Applicant Management", to: "/members" }, { label: "Pending applications" }];
  }
  if (view === "authorize") {
    return [{ label: "Applicant Management", to: "/members" }, { label: "Authorize applicants" }];
  }
  return [{ label: "Applicant Management", to: "/members" }, { label: "Pending applications" }];
}

export function crumbsForLocation(
  pathname: string,
  search: Record<string, unknown>,
  mode: PortalMode,
): AppCrumb[] | null {
  if (
    pathname === "/" ||
    pathname === "/admin" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/apply/") ||
    pathname === "/set-password"
  ) {
    return null;
  }

  const home = homeCrumb(mode);
  const rest: AppCrumb[] = [];

  if (pathname.startsWith("/manage-committee/meetings/pending")) {
    rest.push(
      { label: "Committee manage", to: "/manage-committee/new-term" },
      { label: "Pending application" },
    );
  } else if (pathname.startsWith("/manage-committee/meetings/waiting")) {
    rest.push(
      { label: "Committee manage", to: "/manage-committee/new-term" },
      { label: "Waiting for meeting" },
    );
  } else if (pathname.startsWith("/manage-committee/meetings/interview")) {
    rest.push(
      { label: "Committee manage", to: "/manage-committee/new-term" },
      { label: "Short interview" },
    );
  } else if (pathname.startsWith("/manage-committee/meetings/history")) {
    rest.push(
      { label: "Committee manage", to: "/manage-committee/new-term" },
      { label: "Interview history" },
    );
  } else if (pathname.startsWith("/manage-committee/meetings")) {
    rest.push(
      { label: "Committee manage", to: "/manage-committee/new-term" },
      { label: "Meetings" },
    );
  } else if (pathname.startsWith("/manage-committee/members")) {
    rest.push(
      { label: "Committee manage", to: "/manage-committee/new-term" },
      { label: "Committee members" },
    );
  } else if (pathname.startsWith("/manage-committee/current-term") || pathname.startsWith("/manage-committee/new-term")) {
    rest.push({ label: "Committee manage", to: "/manage-committee/new-term" }, { label: "Committee term" });
  } else if (pathname.startsWith("/manage-committee")) {
    rest.push({ label: "Committee manage" }, { label: "Dashboard" });
  } else if (pathname.startsWith("/committee-ballot/attendance")) {
    rest.push(
      { label: "Committee Ballot", to: "/committee-ballot/attendance" },
      { label: "Mark members present" },
    );
  } else if (pathname.startsWith("/committee-ballot/pending")) {
    rest.push(
      { label: "Committee Ballot", to: "/committee-ballot/attendance" },
      { label: "Pending applicants" },
    );
  } else if (pathname.startsWith("/committee-ballot/candidates")) {
    rest.push(
      { label: "Committee Ballot", to: "/committee-ballot/attendance" },
      { label: "Ballot per candidate" },
    );
  } else if (pathname.startsWith("/committee-ballot/signatures")) {
    rest.push(
      { label: "Committee Ballot", to: "/committee-ballot/attendance" },
      { label: "Signatures" },
    );
  } else if (pathname.startsWith("/committee-ballot")) {
    rest.push({ label: "Committee Ballot" }, { label: "Dashboard" });
  } else if (pathname.startsWith("/election/notice")) {
    rest.push({ label: "AGM/EGM Election", to: "/election/notice" }, { label: "Meeting notice" });
  } else if (pathname.startsWith("/election/officers")) {
    rest.push({ label: "AGM/EGM Election", to: "/election/notice" }, { label: "Officers & ballot" });
  } else if (pathname.startsWith("/election/tally")) {
    rest.push({ label: "AGM/EGM Election", to: "/election/notice" }, { label: "Live tally" });
  } else if (pathname.startsWith("/election/proxies")) {
    rest.push({ label: "AGM/EGM Election", to: "/election/notice" }, { label: "Lodged proxies" });
  } else if (pathname.startsWith("/election/nominations")) {
    rest.push({ label: "AGM/EGM Election", to: "/election/notice" }, { label: "Nominations" });
  } else if (pathname.startsWith("/election/minutes")) {
    rest.push({ label: "AGM/EGM Election", to: "/election/notice" }, { label: "Meeting minutes" });
  } else if (pathname.startsWith("/election/committee-signatures")) {
    rest.push({ label: "Applicant election", to: "/election/committee-vote" }, { label: "Signatures" });
  } else if (pathname.startsWith("/election/committee-vote")) {
    rest.push({ label: "Applicant election", to: "/election/committee-vote" }, { label: "Committee vote" });
  } else if (pathname.startsWith("/election/vote")) {
    rest.push({ label: "AGM/EGM Election", to: "/election" }, { label: "Cast vote" });
  } else if (pathname.startsWith("/election/appoint-proxy")) {
    rest.push({ label: "AGM/EGM Election", to: "/election" }, { label: "Proxy appointment" });
  } else if (pathname.startsWith("/election/audit")) {
    rest.push({ label: "AGM/EGM Election", to: "/election" }, { label: "Audit log" });
  } else if (pathname.startsWith("/election")) {
    rest.push({ label: "AGM/EGM Election" }, { label: "Dashboard" });
  } else if (pathname.startsWith("/governance")) {
    rest.push({ label: "Committee" });
  } else if (pathname.startsWith("/members/") && pathname !== "/members") {
    rest.push({ label: "Members", to: "/members" }, { label: "Application" });
  } else if (pathname === "/members" || pathname.startsWith("/members")) {
    rest.push(...membersCrumbs(search));
  } else if (pathname.startsWith("/existing-members/privileges")) {
    rest.push(
      { label: "Manage records", to: "/existing-members", search: { tab: "register" } },
      { label: "Assign privileges", to: "/existing-members", search: { tab: "privileges" } },
      { label: pathname.includes("/new") ? "Add Membership type" : "Edit membership type" },
    );
  } else if (pathname.startsWith("/existing-members/") && pathname !== "/existing-members") {
    rest.push(
      { label: "Manage records", to: "/existing-members", search: { tab: "register" } },
      { label: "Member" },
    );
  } else if (pathname.startsWith("/existing-members")) {
    const tab = String(search.tab ?? "register");
    if (tab === "dashboard") {
      rest.push(
        { label: "Manage records", to: "/existing-members", search: { tab: "dashboard" } },
        { label: "Dashboard" },
      );
    } else if (tab === "transition") {
      rest.push(
        { label: "Manage records", to: "/existing-members", search: { tab: "dashboard" } },
        { label: "Member transition" },
      );
    } else {
      rest.push(
        { label: "Manage records", to: "/existing-members", search: { tab: "register" } },
        { label: tab === "privileges" ? "View and Manage" : "Member register" },
      );
    }
  } else if (pathname.startsWith("/register-member")) {
    rest.push(
      { label: "Manage records", to: "/existing-members", search: { tab: "register" } },
      { label: "Register member" },
    );
  } else if (pathname.startsWith("/user-management/") && pathname !== "/user-management") {
    rest.push(
      { label: "Manage records", to: "/existing-members", search: { tab: "register" } },
      { label: "User management", to: "/user-management" },
      { label: "User" },
    );
  } else if (pathname.startsWith("/club-setup/countries")) {
    rest.push(
      { label: "Manage records", to: "/existing-members", search: { tab: "dashboard" } },
      { label: "Country listings" },
    );
  } else if (pathname.startsWith("/club-setup/companies")) {
    rest.push(
      { label: "Manage records", to: "/existing-members", search: { tab: "dashboard" } },
      { label: "Company listings" },
    );
  } else if (pathname.startsWith("/club-setup/designations")) {
    rest.push(
      { label: "Manage records", to: "/existing-members", search: { tab: "dashboard" } },
      { label: "Designation listings" },
    );
  } else if (pathname.startsWith("/user-management")) {
    rest.push(
      { label: "Manage records", to: "/existing-members", search: { tab: "register" } },
      { label: "User management" },
    );
  } else if (pathname.startsWith("/finance/non-membership/accommodation")) {
    rest.push({ label: "Finance", to: "/finance/desk" }, { label: "Accommodation" });
  } else if (pathname.startsWith("/finance/non-membership/corkage")) {
    rest.push({ label: "Finance", to: "/finance/desk" }, { label: "Corkage" });
  } else if (pathname.startsWith("/finance/non-membership/custom-charges")) {
    rest.push({ label: "Finance", to: "/finance/desk" }, { label: "Custom charges" });
  } else if (pathname.startsWith("/finance/statements")) {
    rest.push({ label: "Finance", to: "/finance/desk" }, { label: "Statements" });
  } else if (pathname.startsWith("/finance/approvals")) {
    rest.push({ label: "Finance", to: "/finance/desk" }, { label: "Document approvals" });
  } else if (pathname.startsWith("/finance/invoices/setup")) {
    rest.push({ label: "Finance", to: "/finance/desk" }, { label: "Invoices", to: "/finance/invoices" }, { label: "Payment setup" });
  } else if (pathname.startsWith("/finance/invoices")) {
    rest.push({ label: "Finance", to: "/finance/desk" }, { label: "Invoices" });
  } else if (pathname === "/finance" || pathname === "/finance/") {
    rest.push({ label: "Finance" }, { label: "Dashboard" });
  } else if (pathname.startsWith("/finance")) {
    rest.push({ label: "Finance", to: "/finance" }, { label: "Desk" });
  } else if (pathname.startsWith("/reception")) {
    rest.push(
      { label: "Guest visits", to: "/reception", search: { section: "dashboard" } },
      { label: String(search.section ?? "") === "dashboard" ? "Dashboard" : "Visits" },
    );
  } else if (pathname.startsWith("/settings/rbac")) {
    rest.push({ label: "Settings", to: "/settings/rbac" }, { label: "Roles & permissions" });
  } else if (pathname.startsWith("/settings/lookups")) {
    rest.push({ label: "Settings", to: "/settings/rbac" }, { label: "Lookups & fee schedule" });
  } else if (pathname.startsWith("/settings/club")) {
    rest.push({ label: "Settings", to: "/settings/rbac" }, { label: "Club preferences" });
  } else if (pathname.startsWith("/settings/account")) {
    rest.push({ label: "Settings", to: "/settings/account" }, { label: "Account & Profile" });
  } else if (pathname.startsWith("/settings/privacy")) {
    rest.push({ label: "Settings", to: "/settings/account" }, { label: "Privacy & Data" });
  } else if (pathname.startsWith("/settings/appearance")) {
    rest.push({ label: "Settings", to: "/settings/account" }, { label: "Interface" });
  } else if (pathname.startsWith("/settings/automations")) {
    rest.push({ label: "Settings", to: "/settings/account" }, { label: "Automations" });
  } else if (pathname.startsWith("/settings")) {
    rest.push({ label: "Settings" });
  } else if (pathname.startsWith("/accommodation")) {
    rest.push(
      { label: "Accommodation", to: "/accommodation", search: { view: "dashboard" } },
      { label: String(search.view ?? "") === "dashboard" ? "Dashboard" : "Rooms & bookings" },
    );
  } else if (pathname.startsWith("/corkage")) {
    rest.push({ label: "Corkage" });
  } else if (pathname.startsWith("/custom-charges")) {
    rest.push({ label: "Custom charges" });
  } else if (pathname.startsWith("/support")) {
    rest.push({ label: "Support", to: "/support" });
    if (pathname.startsWith("/support/tickets")) rest.push({ label: "My tickets" });
    if (pathname.startsWith("/support/new")) rest.push({ label: "Create ticket" });
  } else if (pathname.startsWith("/applications")) {
    rest.push({ label: "Application status" });
  } else if (pathname.startsWith("/application")) {
    rest.push({ label: "Application status", to: "/applications" }, { label: "Form" });
  } else if (pathname.startsWith("/documents")) {
    rest.push({ label: "Documents" });
  } else if (pathname.startsWith("/payment")) {
    rest.push({ label: "Payment" });
  } else if (pathname.startsWith("/profile")) {
    rest.push({ label: "Profile" });
  } else if (pathname.startsWith("/guests")) {
    rest.push({ label: "Guests" });
  } else if (pathname.startsWith("/endorsements")) {
    rest.push({ label: "Endorsements" });
  } else {
    const last = pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ");
    rest.push({ label: last ? last.charAt(0).toUpperCase() + last.slice(1) : "Page" });
  }

  const crumbs = [home, ...rest];
  if (crumbs.length < 2) return null;
  return crumbs;
}

export function AppBreadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const mode = readPortalMode(readUser());
  const crumbs = crumbsForLocation(pathname, search, mode);
  if (!crumbs?.length) return null;

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {last || !crumb.to ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to} search={(crumb.search ?? {}) as never}>
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
