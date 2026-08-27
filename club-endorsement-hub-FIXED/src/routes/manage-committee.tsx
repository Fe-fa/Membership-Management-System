import { createFileRoute } from "@tanstack/react-router";
import { ManageCommitteePage } from "@/pages/admin/ManageCommitteePage";

export type ManageCommitteeSearch = {
  section?: "new-term" | "current-term" | "members" | "meetings";
};

export const Route = createFileRoute("/manage-committee")({
  validateSearch: (search: Record<string, unknown>): ManageCommitteeSearch => {
    const section = String(search.section ?? "");
    if (
      section === "new-term" ||
      section === "current-term" ||
      section === "members" ||
      section === "meetings"
    ) {
      return { section };
    }
    return {};
  },
  head: () => ({
    meta: [{ title: "Committee manage — Aero Club of East Africa" }],
  }),
  component: ManageCommitteePage,
});
