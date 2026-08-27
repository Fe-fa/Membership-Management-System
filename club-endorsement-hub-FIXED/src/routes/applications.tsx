import { createFileRoute } from "@tanstack/react-router";
import { ApplicationsPage } from "@/pages/applicant/ApplicationsPage";

export const Route = createFileRoute("/applications")({
  head: () => ({
    meta: [
      { title: "My Applications — Aero Club of East Africa" },
      {
        name: "description",
        content:
          "Track your membership application status, approval flow, documents and timeline from one place.",
      },
    ],
  }),
  component: ApplicationsPage,
});
