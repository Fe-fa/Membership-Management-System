import { useRouterState } from "@tanstack/react-router";

import { AdminEventsDashboard } from "@/pages/admin/events/AdminEventsDashboard";
import { MemberEventsDashboard } from "@/pages/member/MemberEventsDashboard";
import { hasAnyRole, isStaff, readPortalMode, readUser } from "@/lib/auth";

export function EventsPage() {
  const section = useRouterState({
    select: (state) => {
      const search = state.location.search as { section?: string };
      return search.section || "home";
    },
  });
  const user = readUser();
  const managing = isStaff(user)
    && readPortalMode(user) === "admin"
    && hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "TREASURER", "COMMITTEE_MEMBER"]);

  if (managing) return <AdminEventsDashboard section={section} />;
  return <MemberEventsDashboard section={section} />;
}
