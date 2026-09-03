import { createFileRoute } from "@tanstack/react-router";
import { ExistingMembersLayout } from "@/pages/admin/ExistingMembersLayout";

export const Route = createFileRoute("/existing-members")({
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab === "privileges" ? ("privileges" as const) : ("register" as const);
    const mode = search.mode === "edit" ? ("edit" as const) : search.mode === "view" ? ("view" as const) : undefined;
    return mode ? { tab, mode } : { tab };
  },
  component: ExistingMembersLayout,
});
