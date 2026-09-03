import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAnyRole, homePathForUser, readUser } from "@/lib/auth";
import { ClubPreferencesPage } from "@/pages/settings/ClubPreferencesPage";

export const Route = createFileRoute("/settings/club")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"])) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  head: () => ({ meta: [{ title: "Club preferences — Aero Club of East Africa" }] }),
  component: ClubPreferencesPage,
});
