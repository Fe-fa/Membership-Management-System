import { createFileRoute } from "@tanstack/react-router";
import { DesignationListingsPage } from "@/pages/admin/club-setup/ClubSetupPages";

export const Route = createFileRoute("/club-setup/designations")({
  head: () => ({ meta: [{ title: "Designation listings" }] }),
  component: DesignationListingsPage,
});
