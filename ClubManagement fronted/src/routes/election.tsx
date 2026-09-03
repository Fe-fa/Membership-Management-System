import { createFileRoute, redirect } from "@tanstack/react-router";
import { ElectionPage } from "@/pages/member/ElectionPage";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";

export const Route = createFileRoute("/election")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/election")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  head: () => ({
    meta: [{ title: "AGM/EGM Election — Aero Club of East Africa" }],
  }),
  component: ElectionPage,
});
