import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, readUser } from "@/lib/auth";
import { ManageCommitteeLayout } from "@/pages/admin/ManageCommitteeLayout";

export const Route = createFileRoute("/manage-committee")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/manage-committee")) {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  component: ManageCommitteeLayout,
});
