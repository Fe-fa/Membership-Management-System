import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";
import { ApplicationPage } from "@/pages/applicant/ApplicationPage";

export const Route = createFileRoute("/application")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/application")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
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
