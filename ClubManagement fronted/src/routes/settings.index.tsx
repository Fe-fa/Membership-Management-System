import { createFileRoute, redirect } from "@tanstack/react-router";
import { readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/settings/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    const mode = readPortalMode(user);
    // Applicants / members use personal settings — skip admin settings.
    if (mode !== "admin") {
      throw redirect({ to: "/settings/account" });
    }
    // Admin settings use the sidebar only — no duplicate card hub.
    throw redirect({ to: "/settings/rbac" });
  },
});
