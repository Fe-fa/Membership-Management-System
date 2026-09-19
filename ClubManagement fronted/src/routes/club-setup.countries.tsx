import { createFileRoute } from "@tanstack/react-router";
import { CountryListingsPage } from "@/pages/admin/club-setup/ClubSetupPages";

export const Route = createFileRoute("/club-setup/countries")({
  head: () => ({ meta: [{ title: "Country listings" }] }),
  component: CountryListingsPage,
});
