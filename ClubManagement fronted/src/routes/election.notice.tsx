import { createFileRoute, redirect } from "@tanstack/react-router";
import { MeetingNoticeDeskPage } from "@/pages/admin/ElectionDeskPage";
import { ElectionDeskLayout } from "@/pages/admin/electionDeskShared";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/election/notice")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!(isStaff(user) && readPortalMode(user) === "admin")) {
      throw redirect({ to: "/election" });
    }
  },
  head: () => ({
    meta: [{ title: "Meeting notice — Aero Club of East Africa" }],
  }),
  component: NoticeRoute,
});

function NoticeRoute() {
  return (
    <ElectionDeskLayout>
      <MeetingNoticeDeskPage />
    </ElectionDeskLayout>
  );
}
