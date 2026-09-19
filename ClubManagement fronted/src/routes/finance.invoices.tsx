import { createFileRoute } from "@tanstack/react-router";
import { InvoiceRunPage } from "@/pages/admin/InvoiceRunPage";

export const Route = createFileRoute("/finance/invoices")({
  component: InvoiceRunPage,
});
