import { createFileRoute } from "@tanstack/react-router";
import { MemberCorkagePage } from "@/pages/member/MemberCorkagePage";

export const Route = createFileRoute("/corkage")({
  head: () => ({
    meta: [{ title: "Corkage — Aero Club of East Africa" }],
  }),
  component: MemberCorkagePage,
});
