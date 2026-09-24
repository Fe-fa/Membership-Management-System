import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, isStaff, readPortalMode, readUser } from "@/lib/auth";
import { CommitteeBallotLayout } from "@/pages/admin/CommitteeBallotAdmissionPage";

export const Route = createFileRoute("/committee-ballot")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/committee-ballot")) {
      throw redirect({ to: homePathForUser(user) });
    }
    if (!(isStaff(user) && readPortalMode(user) === "admin")) {
      throw redirect({ to: "/election/committee-vote" });
    }
  },
  head: () => ({
    meta: [{ title: "Committee Ballot" }],
  }),
  component: CommitteeBallotLayout,
});
