import { createFileRoute } from "@tanstack/react-router";
import { ElectionPage } from "@/pages/member/ElectionPage";
import { ModuleDashboardPage } from "@/pages/admin/ModuleDashboardPage";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

function ElectionIndexPage() {
  const user = readUser();
  if (isStaff(user) && readPortalMode(user) === "admin") {
    return <ModuleDashboardPage moduleId="agm-election" />;
  }
  return <ElectionPage />;
}

export const Route = createFileRoute("/election/")({
  head: () => ({
    meta: [{ title: "AGM/EGM Election" }],
  }),
  component: ElectionIndexPage,
});
