import { createFileRoute } from "@tanstack/react-router";
import { ModuleDashboardPage } from "@/pages/admin/ModuleDashboardPage";

export const Route = createFileRoute("/finance/")({
  head: () => ({
    meta: [{ title: "Finance dashboard" }],
  }),
  component: () => <ModuleDashboardPage moduleId="finance" />,
});
