import { createFileRoute } from "@tanstack/react-router";
import { BallotCandidatesPage } from "@/pages/admin/CommitteeBallotAdmissionPage";

export const Route = createFileRoute("/committee-ballot/candidates")({
  head: () => ({
    meta: [{ title: "Ballot per candidate — Aero Club of East Africa" }],
  }),
  component: BallotCandidatesPage,
});
