import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";

export const Route = createFileRoute("/election")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/election")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  component: () => <Outlet />,
});
