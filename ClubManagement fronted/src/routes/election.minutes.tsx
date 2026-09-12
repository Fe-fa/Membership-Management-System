import { createFileRoute, redirect } from "@tanstack/react-router";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";
import { MeetingMinutesPage } from "@/pages/admin/MeetingMinutesPage";

export const Route = createFileRoute("/election/minutes")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!(isStaff(user) && readPortalMode(user) === "admin")) {
      throw redirect({ to: "/election" });
    }
  },
  head: () => ({
    meta: [{ title: "Meeting minutes — Aero Club of East Africa" }],
  }),
  component: MeetingMinutesPage,
});
