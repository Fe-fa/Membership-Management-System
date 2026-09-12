import { createFileRoute } from "@tanstack/react-router";
import { CustomChargesBillingPage } from "@/pages/admin/nonMembership/CustomChargesBillingPage";

export const Route = createFileRoute("/finance/non-membership/custom-charges")({
  component: CustomChargesBillingPage,
});
