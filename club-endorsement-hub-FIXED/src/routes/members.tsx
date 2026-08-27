import { createFileRoute, redirect } from "@tanstack/react-router";
import { MembersLayout } from "@/pages/admin/MembersLayout";

export const Route = createFileRoute("/members")({
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab;
    if (tab === "register" || tab === "privileges") return { tab } as const;
    const view = search.view === "authorize" ? ("authorize" as const) : undefined;
    const edit = search.edit === true || search.edit === "true" || search.edit === "1";
    return {
      ...(view ? { view } : {}),
      ...(edit ? { edit: true as const } : {}),
    };
  },
  beforeLoad: ({ search }) => {
    if (search.tab === "register" || search.tab === "privileges") {
      throw redirect({
        to: "/existing-members",
        search: { tab: search.tab },
      });
    }
  },
  component: MembersLayout,
});
