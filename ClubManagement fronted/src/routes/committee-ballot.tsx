import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";
import { CommitteeBallotLayout } from "@/pages/admin/CommitteeBallotAdmissionPage";

export const Route = createFileRoute("/committee-ballot")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/committee-ballot")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  head: () => ({
    meta: [{ title: "Committee Ballot — Aero Club of East Africa" }],
  }),
  component: CommitteeBallotLayout,
});
