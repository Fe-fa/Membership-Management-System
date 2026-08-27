import { createFileRoute } from "@tanstack/react-router";
import { ApplicantDetailPage } from "@/pages/admin/ApplicantDetailPage";

export const Route = createFileRoute("/members/$applicationId")({
  head: () => ({
    meta: [{ title: "Applicant details — Aero Club of East Africa" }],
  }),
  component: ApplicantDetailPage,
});
