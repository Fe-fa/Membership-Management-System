import { createFileRoute } from "@tanstack/react-router";
import { MemberCustomChargesPage } from "@/pages/member/MemberCustomChargesPage";

export const Route = createFileRoute("/custom-charges")({
  head: () => ({
    meta: [{ title: "Custom charges" }],
  }),
  component: MemberCustomChargesPage,
});
