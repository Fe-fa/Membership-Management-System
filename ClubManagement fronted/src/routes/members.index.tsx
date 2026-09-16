import { createFileRoute } from "@tanstack/react-router";
import { PendingApplicationsPage } from "@/pages/admin/PendingApplicationsPage";

export const Route = createFileRoute("/members/")({
  head: () => ({
    meta: [{ title: "Pending applications" }],
  }),
  component: PendingApplicationsPage,
});
