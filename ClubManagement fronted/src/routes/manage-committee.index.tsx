import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/manage-committee/")({
  validateSearch: (search: Record<string, unknown>) => {
    const section = String(search.section ?? "");
    if (section === "new-term" || section === "current-term" || section === "members" || section === "meetings") {
      return { section };
    }
    return {};
  },
  beforeLoad: ({ search }) => {
    if (search.section === "current-term" || search.section === "new-term") {
      throw redirect({ to: "/manage-committee/new-term" });
    }
    if (search.section === "members") {
      throw redirect({ to: "/manage-committee/members" });
    }
    if (search.section === "meetings") {
      throw redirect({ to: "/manage-committee/meetings/pending" });
    }
    throw redirect({ to: "/manage-committee/new-term" });
  },
});
