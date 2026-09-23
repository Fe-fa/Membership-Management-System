import { createFileRoute } from "@tanstack/react-router";
import { MemberElectionVotePage } from "@/pages/member/ElectionPage";

export const Route = createFileRoute("/election/vote")({
  head: () => ({
    meta: [{ title: "Cast electronic vote" }],
  }),
  component: MemberElectionVotePage,
});
