import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";
import { ApplicationsPage } from "@/pages/applicant/ApplicationsPage";

export const Route = createFileRoute("/applications")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/applications")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
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
