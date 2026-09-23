import { createFileRoute, redirect } from "@tanstack/react-router";
import { canViewFinanceStatements, homePathForUser, readUser } from "@/lib/auth";
import { FinanceStatementsPage } from "@/pages/admin/FinanceStatementsPage";

export const Route = createFileRoute("/finance/statements")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canViewFinanceStatements(user)) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  component: FinanceStatementsPage,
});
