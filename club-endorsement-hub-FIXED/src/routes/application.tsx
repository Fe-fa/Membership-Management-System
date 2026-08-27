import { createFileRoute } from "@tanstack/react-router";
import { ApplicationPage } from "@/pages/applicant/ApplicationPage";

export const Route = createFileRoute("/application")({
  head: () => ({
    meta: [
      { title: "Membership Application — Aero Club of East Africa" },
      {
        name: "description",
        content:
          "Complete your ACEA membership application in eight guided steps: personal details, family, aviation, membership type, proposer and seconder, clubs, consent and review.",
      },
      { property: "og:title", content: "ACEA Membership Application" },
      {
        property: "og:description",
        content:
          "Eight-step membership application for the Aero Club of East Africa, saved as you go.",
      },
    ],
  }),
  component: ApplicationPage,
});
