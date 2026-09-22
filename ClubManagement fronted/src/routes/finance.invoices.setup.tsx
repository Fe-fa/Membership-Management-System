import { createFileRoute } from "@tanstack/react-router";
import { InvoiceSetupPage } from "@/pages/admin/InvoiceSetupPage";

export const Route = createFileRoute("/finance/invoices/setup")({
  component: InvoiceSetupPage,
});
