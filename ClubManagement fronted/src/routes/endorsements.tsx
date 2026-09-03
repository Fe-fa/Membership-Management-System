import { createFileRoute } from "@tanstack/react-router";
import { EndorsementsPage } from "@/pages/member/EndorsementsPage";

export const Route = createFileRoute("/endorsements")({
  head: () => ({
    meta: [{ title: "Proposer / Seconder — Aero Club of East Africa" }],
  }),
  component: EndorsementsPage,
});
