import { createFileRoute } from "@tanstack/react-router";
import { FinancePage } from "@/pages/admin/FinancePage";

export const Route = createFileRoute("/finance")({
  component: FinancePage,
});
