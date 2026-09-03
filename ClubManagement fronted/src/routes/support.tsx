import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "@/pages/admin/SupportPage";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [{ title: "Support — Aero Club of East Africa" }],
  }),
  component: SupportPage,
});
