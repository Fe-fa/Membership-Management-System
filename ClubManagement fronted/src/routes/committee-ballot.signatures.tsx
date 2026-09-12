import { createFileRoute } from "@tanstack/react-router";
import { BallotSignaturesPage } from "@/pages/admin/CommitteeBallotAdmissionPage";

export const Route = createFileRoute("/committee-ballot/signatures")({
  head: () => ({
    meta: [{ title: "Signatures — Committee Ballot — Aero Club of East Africa" }],
  }),
  component: BallotSignaturesPage,
});
