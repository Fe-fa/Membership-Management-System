import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";
import { EventsPage } from "@/pages/member/EventsPage";

export const Route = createFileRoute("/events")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/events")) throw redirect({ to: homePathForUser(user) });
  },
  component: EventsPage,
});
