import { createFileRoute } from "@tanstack/react-router";
import { PendingApplicationsPage } from "@/pages/admin/PendingApplicationsPage";

export const Route = createFileRoute("/members/")({
  head: () => ({
    meta: [{ title: "Pending applications — Aero Club of East Africa" }],
  }),
  component: PendingApplicationsPage,
});
