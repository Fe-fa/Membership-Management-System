import { createFileRoute } from "@tanstack/react-router";
import { CorkageBillingPage } from "@/pages/admin/nonMembership/CorkageBillingPage";

export const Route = createFileRoute("/finance/non-membership/corkage")({
  component: CorkageBillingPage,
});
