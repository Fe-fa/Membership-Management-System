import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";
import { MembersLayout } from "@/pages/admin/MembersLayout";

export const Route = createFileRoute("/members")({
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab;
    if (tab === "register" || tab === "privileges") return { tab } as const;
    const view =
      search.view === "authorize" || search.view === "manager" || search.view === "dashboard"
        ? (search.view as "authorize" | "manager" | "dashboard")
        : undefined;
    const section =
      search.section === "pending" || search.section === "history" || search.section === "dashboard"
        ? (search.section as "pending" | "history" | "dashboard")
        : undefined;
    const edit = search.edit === true || search.edit === "true" || search.edit === "1";
    return {
      ...(view ? { view } : {}),
      ...(section ? { section } : {}),
      ...(edit ? { edit: true as const } : {}),
    };
  },
  beforeLoad: ({ search }) => {
    if (typeof window !== "undefined") {
      const user = readUser();
      if (!canVisitPath(user, "/members")) {
        throw redirect({ to: homePathForUser(user) });
      }
    }
    if (search.tab === "register" || search.tab === "privileges") {
      throw redirect({
        to: "/existing-members",
        search: { tab: search.tab },
      });
    }
    if (search.view === "dashboard") {
      throw redirect({ to: "/members" });
    }
  },
  component: MembersLayout,
});
