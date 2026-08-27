import { createFileRoute } from "@tanstack/react-router";
import { ElectionPage } from "@/pages/member/ElectionPage";

export const Route = createFileRoute("/election")({
  head: () => ({
    meta: [{ title: "Election — Aero Club of East Africa" }],
  }),
  component: ElectionPage,
});
