import { createFileRoute, redirect } from "@tanstack/react-router";
import { canApproveBillingDocuments, homePathForUser, readUser } from "@/lib/auth";
import { DocumentApprovalsPage } from "@/pages/admin/DocumentApprovalsPage";

export const Route = createFileRoute("/finance/approvals")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canApproveBillingDocuments(user)) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  component: DocumentApprovalsPage,
});
