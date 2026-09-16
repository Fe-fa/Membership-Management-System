import { createFileRoute, redirect } from "@tanstack/react-router";
import { OfficersBallotDeskPage } from "@/pages/admin/ElectionDeskPage";
import { ElectionDeskLayout } from "@/pages/admin/electionDeskShared";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/election/officers")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!(isStaff(user) && readPortalMode(user) === "admin")) {
      throw redirect({ to: "/election" });
    }
  },
  head: () => ({
    meta: [{ title: "Officers & ballot" }],
  }),
  component: OfficersRoute,
});

function OfficersRoute() {
  return (
    <ElectionDeskLayout>
      <OfficersBallotDeskPage />
    </ElectionDeskLayout>
  );
}
