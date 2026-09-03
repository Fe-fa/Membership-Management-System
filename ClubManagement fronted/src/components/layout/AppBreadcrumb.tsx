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
    return [
      { label: "Manager Review", to: "/members", search: { view: "manager", section: "pending" } },
      { label: section === "history" ? "Authorized history" : "Pending review" },
    ];
  }
  if (view === "authorize") {
    return [{ label: "Members", to: "/members" }, { label: "Authorize applicants" }];
  }
  return [{ label: "Members", to: "/members" }, { label: "Pending applications" }];
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
    rest.push({ label: "Committee manage" });
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
  } else if (pathname.startsWith("/committee-ballot")) {
    rest.push({ label: "Committee Ballot" });
  } else if (pathname.startsWith("/election")) {
    rest.push({ label: "AGM/EGM Election" });
  } else if (pathname.startsWith("/governance")) {
    rest.push({ label: "Committee" });
  } else if (pathname.startsWith("/members/") && pathname !== "/members") {
    rest.push({ label: "Members", to: "/members" }, { label: "Application" });
  } else if (pathname === "/members" || pathname.startsWith("/members")) {
    rest.push(...membersCrumbs(search));
  } else if (pathname.startsWith("/existing-members/") && pathname !== "/existing-members") {
    rest.push({ label: "Members", to: "/existing-members" }, { label: "Member" });
  } else if (pathname.startsWith("/existing-members")) {
    const tab = String(search.tab ?? "register");
    rest.push(
      { label: "Members", to: "/existing-members" },
      { label: tab === "privileges" ? "Assign privileges" : "Member register" },
    );
  } else if (pathname.startsWith("/register-member")) {
    rest.push({ label: "Members", to: "/existing-members" }, { label: "Register member" });
  } else if (pathname.startsWith("/user-management/") && pathname !== "/user-management") {
    rest.push({ label: "User management", to: "/user-management" }, { label: "User" });
  } else if (pathname.startsWith("/user-management")) {
    rest.push({ label: "User management" });
  } else if (pathname.startsWith("/finance")) {
    rest.push({ label: "Finance" });
  } else if (pathname.startsWith("/reception")) {
    rest.push({ label: "Reception" });
  } else if (pathname.startsWith("/settings/rbac")) {
    rest.push({ label: "Settings", to: "/settings" }, { label: "Role-based access" });
  } else if (pathname.startsWith("/settings/club")) {
    rest.push({ label: "Settings", to: "/settings" }, { label: "Club preferences" });
  } else if (pathname.startsWith("/settings/account")) {
    rest.push({ label: "Settings", to: "/settings" }, { label: "Account & Profile" });
  } else if (pathname.startsWith("/settings/privacy")) {
    rest.push({ label: "Settings", to: "/settings" }, { label: "Privacy & Data" });
  } else if (pathname.startsWith("/settings/appearance")) {
    rest.push({ label: "Settings", to: "/settings" }, { label: "Interface" });
  } else if (pathname.startsWith("/settings/automations")) {
    rest.push({ label: "Settings", to: "/settings" }, { label: "Automations" });
  } else if (pathname.startsWith("/settings")) {
    rest.push({ label: "Settings" });
  } else if (pathname.startsWith("/accommodation")) {
    rest.push({ label: "Accommodation" });
  } else if (pathname.startsWith("/support")) {
    rest.push({ label: "Support" });
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
