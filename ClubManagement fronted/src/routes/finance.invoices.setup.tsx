import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/finance/invoices/setup")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/setup" });
  },
});
