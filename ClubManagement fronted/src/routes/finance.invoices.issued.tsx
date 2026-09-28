import { createFileRoute } from "@tanstack/react-router";
import { IssuedInvoicesPage } from "@/pages/admin/IssuedInvoicesPage";

export const Route = createFileRoute("/finance/invoices/issued")({
  head: () => ({ meta: [{ title: "Issued invoices" }] }),
  component: IssuedInvoicesPage,
});
