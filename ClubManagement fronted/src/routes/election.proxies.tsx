import { createFileRoute, redirect } from "@tanstack/react-router";
import { LodgedProxiesDeskPage } from "@/pages/admin/ElectionDeskPage";
import { ElectionDeskLayout } from "@/pages/admin/electionDeskShared";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/election/proxies")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!(isStaff(user) && readPortalMode(user) === "admin")) {
      throw redirect({ to: "/election" });
    }
  },
  head: () => ({
    meta: [{ title: "Lodged proxies" }],
  }),
  component: ProxiesRoute,
});

function ProxiesRoute() {
  return (
    <ElectionDeskLayout>
      <LodgedProxiesDeskPage />
    </ElectionDeskLayout>
  );
}
