import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "@/pages/admin/SupportPage";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [{ title: "Applicant Support Center — Aero Club of East Africa" }],
  }),
  component: SupportPage,
});
