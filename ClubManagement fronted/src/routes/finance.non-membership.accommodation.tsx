import { createFileRoute } from "@tanstack/react-router";
import { AccommodationBillingPage } from "@/pages/admin/nonMembership/AccommodationBillingPage";

export const Route = createFileRoute("/finance/non-membership/accommodation")({
  component: AccommodationBillingPage,
});
