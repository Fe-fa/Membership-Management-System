import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";
import { GuestsPage } from "@/pages/member/GuestsPage";

export const Route = createFileRoute("/guests")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/guests")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  component: GuestsPage,
});
