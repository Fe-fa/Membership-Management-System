import { createFileRoute } from "@tanstack/react-router";
import { MemberCommitteeSignaturesPage } from "@/components/member/MemberCommitteeBallotPanel";

export const Route = createFileRoute("/election/committee-signatures")({
  head: () => ({
    meta: [{ title: "Signatures" }],
  }),
  component: MemberCommitteeSignaturesPage,
});
