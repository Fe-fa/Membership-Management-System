import { createFileRoute } from "@tanstack/react-router";
import { EndorsementsPage } from "@/pages/member/EndorsementsPage";

export const Route = createFileRoute("/endorsements")({
  head: () => ({
    meta: [{ title: "Endorsements" }],
  }),
  component: EndorsementsPage,
});
