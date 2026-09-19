import { createFileRoute } from "@tanstack/react-router";
import { AccommodationPage } from "@/pages/member/AccommodationPage";
import { ModuleDashboardPage } from "@/pages/admin/ModuleDashboardPage";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

function AccommodationRoutePage() {
  const { view } = Route.useSearch();
  const user = readUser();
  if (view === "dashboard" && isStaff(user) && readPortalMode(user) === "admin") {
    return <ModuleDashboardPage moduleId="accommodation" />;
  }
  return <AccommodationPage />;
}

export const Route = createFileRoute("/accommodation")({
  validateSearch: (search: Record<string, unknown>) => {
    if (search.view === "dashboard") return { view: "dashboard" as const };
    return {};
  },
  head: ({ match }) => ({
    meta: [{ title: match.search.view === "dashboard" ? "Accommodation dashboard" : "Accommodation & Facilities" }],
  }),
  component: AccommodationRoutePage,
});
