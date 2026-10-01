import { createFileRoute } from "@tanstack/react-router";
import { AdvanceCreditPage } from "@/pages/admin/AdvanceCreditPage";

export const Route = createFileRoute("/finance/advances")({
  component: AdvanceCreditPage,
});
