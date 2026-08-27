import { createFileRoute } from "@tanstack/react-router";
import { ExistingMembersPage } from "@/pages/admin/ExistingMembersPage";

export const Route = createFileRoute("/existing-members/")({
  validateSearch: (search: Record<string, unknown>) => {
    if (search.tab === "privileges") return { tab: "privileges" } as const;
    return { tab: "register" } as const;
  },
  head: () => ({
    meta: [{ title: "Existing members — Aero Club of East Africa" }],
  }),
  component: ExistingMembersPage,
});
