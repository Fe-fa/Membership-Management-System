import { createFileRoute } from "@tanstack/react-router";
import { ModuleDashboardPage } from "@/pages/admin/ModuleDashboardPage";

export const Route = createFileRoute("/committee-ballot/")({
  head: () => ({
    meta: [{ title: "Committee Ballot" }],
  }),
  component: () => <ModuleDashboardPage moduleId="committee-ballot" />,
});
