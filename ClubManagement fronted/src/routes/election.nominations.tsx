import { createFileRoute, redirect } from "@tanstack/react-router";
import { NominationsDeskPage } from "@/pages/admin/ElectionDeskPage";
import { ElectionDeskLayout } from "@/pages/admin/electionDeskShared";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/election/nominations")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!(isStaff(user) && readPortalMode(user) === "admin")) {
      throw redirect({ to: "/election" });
    }
  },
  head: () => ({
    meta: [{ title: "Nominations — Aero Club of East Africa" }],
  }),
  component: NominationsRoute,
});

function NominationsRoute() {
  return (
    <ElectionDeskLayout>
      <NominationsDeskPage />
    </ElectionDeskLayout>
  );
}
