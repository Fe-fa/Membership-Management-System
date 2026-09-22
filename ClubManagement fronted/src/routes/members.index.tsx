import { createFileRoute, useSearch } from "@tanstack/react-router";
import { ModuleDashboardPage } from "@/pages/admin/ModuleDashboardPage";
import { PendingApplicationsPage } from "@/pages/admin/PendingApplicationsPage";

function MembersIndexPage() {
  const search = useSearch({ from: "/members" });
  if (search.view === "manager" && search.section === "dashboard") {
    return <ModuleDashboardPage moduleId="manager-queue" />;
  }
  return <PendingApplicationsPage />;
}

export const Route = createFileRoute("/members/")({
  head: () => ({
    meta: [{ title: "Membership desk" }],
  }),
  component: MembersIndexPage,
});
