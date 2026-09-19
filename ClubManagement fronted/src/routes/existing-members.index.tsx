import { createFileRoute } from "@tanstack/react-router";
import { ExistingMembersPage } from "@/pages/admin/ExistingMembersPage";
import { ModuleDashboardPage } from "@/pages/admin/ModuleDashboardPage";

function ExistingMembersIndexPage() {
  const { tab } = Route.useSearch();
  if (tab === "dashboard") return <ModuleDashboardPage moduleId="manage-records" />;
  return <ExistingMembersPage />;
}

export const Route = createFileRoute("/existing-members/")({
  validateSearch: (search: Record<string, unknown>) => {
    if (search.tab === "privileges") return { tab: "privileges" } as const;
    if (search.tab === "dashboard") return { tab: "dashboard" } as const;
    return { tab: "register" } as const;
  },
  head: ({ match }) => ({
    meta: [{ title: match.search.tab === "dashboard" ? "Dashboard" : "Existing members" }],
  }),
  component: ExistingMembersIndexPage,
});
