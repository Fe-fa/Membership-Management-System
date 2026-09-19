import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";

export const Route = createFileRoute("/club-setup")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/club-setup")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  component: () => <Outlet />,
});
