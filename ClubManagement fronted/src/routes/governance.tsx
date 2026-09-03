import { createFileRoute, redirect } from "@tanstack/react-router";
import { GovernancePage } from "@/pages/member/GovernancePage";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/governance")({
  beforeLoad: ({ search }) => {
    const section = String((search as { section?: unknown })?.section ?? "");
    if (section === "election") {
      throw redirect({ to: "/election" });
    }
    const user = readUser();
    if (isStaff(user) && readPortalMode(user) === "admin") {
      throw redirect({
        to: "/manage-committee/new-term",
      });
    }
  },
  head: () => ({
    meta: [{ title: "Committee — Aero Club of East Africa" }],
  }),
  component: GovernancePage,
});
