import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAnyRole, homePathForUser, readUser } from "@/lib/auth";
import { LookupsSettingsPage } from "@/pages/settings/LookupsSettingsPage";

export const Route = createFileRoute("/settings/lookups")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"])) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  head: () => ({ meta: [{ title: "Lookups — Aero Club of East Africa" }] }),
  component: LookupsSettingsPage,
});
