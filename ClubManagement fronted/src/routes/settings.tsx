import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";
import { SettingsLayout } from "@/pages/settings/SettingsLayout";

export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/settings")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  head: () => ({
    meta: [{ title: "Settings — Aero Club of East Africa" }],
  }),
  component: SettingsLayout,
});
