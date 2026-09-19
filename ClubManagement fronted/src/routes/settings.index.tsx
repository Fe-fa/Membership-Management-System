import { createFileRoute, redirect } from "@tanstack/react-router";
import { readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/settings/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    const mode = readPortalMode(user);
    if (mode !== "admin") {
      throw redirect({ to: "/settings/account" });
    }
    throw redirect({ to: "/settings/rbac" });
  },
});
