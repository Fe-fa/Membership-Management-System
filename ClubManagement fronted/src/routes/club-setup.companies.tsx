import { createFileRoute } from "@tanstack/react-router";
import { CompanyListingsPage } from "@/pages/admin/club-setup/ClubSetupPages";

export const Route = createFileRoute("/club-setup/companies")({
  head: () => ({ meta: [{ title: "Company listings" }] }),
  component: CompanyListingsPage,
});
