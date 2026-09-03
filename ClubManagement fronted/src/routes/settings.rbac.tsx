import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAnyRole, homePathForUser, readUser } from "@/lib/auth";
import { RbacSettingsPage } from "@/pages/settings/RbacSettingsPage";

export const Route = createFileRoute("/settings/rbac")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"])) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  head: () => ({
    meta: [{ title: "RBAC — Aero Club of East Africa" }],
  }),
  component: RbacSettingsPage,
});
