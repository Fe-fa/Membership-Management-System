import { createFileRoute } from "@tanstack/react-router";
import { CommitteeBallotAdmissionPage } from "@/pages/admin/CommitteeBallotAdmissionPage";

export const Route = createFileRoute("/committee-ballot")({
  head: () => ({
    meta: [{ title: "Committee Ballot — Aero Club of East Africa" }],
  }),
  component: CommitteeBallotAdmissionPage,
});
