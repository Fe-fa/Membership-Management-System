import { createFileRoute } from "@tanstack/react-router";
import { BallotPendingPage } from "@/pages/admin/CommitteeBallotAdmissionPage";

export const Route = createFileRoute("/committee-ballot/pending")({
  head: () => ({
    meta: [{ title: "Pending applicants — Committee Ballot — Aero Club of East Africa" }],
  }),
  component: BallotPendingPage,
});
