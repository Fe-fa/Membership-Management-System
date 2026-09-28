import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAnyRole, homePathForUser, readUser } from "@/lib/auth";
import { InvoiceSetupPage } from "@/pages/admin/InvoiceSetupPage";

export const Route = createFileRoute("/settings/setup")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "TREASURER"])) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  head: () => ({ meta: [{ title: "Setup" }] }),
  component: InvoiceSetupPage,
});
