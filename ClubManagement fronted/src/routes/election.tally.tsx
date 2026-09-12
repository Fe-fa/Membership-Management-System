import { createFileRoute, redirect } from "@tanstack/react-router";
import { LiveTallyDeskPage } from "@/pages/admin/ElectionDeskPage";
import { ElectionDeskLayout } from "@/pages/admin/electionDeskShared";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/election/tally")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!(isStaff(user) && readPortalMode(user) === "admin")) {
      throw redirect({ to: "/election" });
    }
  },
  head: () => ({
    meta: [{ title: "Live tally — Aero Club of East Africa" }],
  }),
  component: TallyRoute,
});

function TallyRoute() {
  return (
    <ElectionDeskLayout>
      <LiveTallyDeskPage />
    </ElectionDeskLayout>
  );
}
