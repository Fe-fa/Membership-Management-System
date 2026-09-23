import { createFileRoute } from "@tanstack/react-router";
import { MemberElectionAuditPage } from "@/pages/member/ElectionPage";

export const Route = createFileRoute("/election/audit")({
  head: () => ({
    meta: [{ title: "Published audit log" }],
  }),
  component: MemberElectionAuditPage,
});
