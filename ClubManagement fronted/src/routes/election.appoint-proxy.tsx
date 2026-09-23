import { createFileRoute } from "@tanstack/react-router";
import { MemberElectionProxyPage } from "@/pages/member/ElectionPage";

export const Route = createFileRoute("/election/appoint-proxy")({
  head: () => ({
    meta: [{ title: "Submit proxy appointment" }],
  }),
  component: MemberElectionProxyPage,
});
