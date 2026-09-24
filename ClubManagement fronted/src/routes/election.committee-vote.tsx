import { createFileRoute } from "@tanstack/react-router";
import { MemberCommitteeVotePage } from "@/components/member/MemberCommitteeBallotPanel";

export const Route = createFileRoute("/election/committee-vote")({
  head: () => ({
    meta: [{ title: "Committee vote" }],
  }),
  component: MemberCommitteeVotePage,
});
