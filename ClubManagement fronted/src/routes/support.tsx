import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "@/pages/admin/SupportPage";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [{ title: "Applicant Support Center" }],
  }),
  component: SupportPage,
});
