import { createFileRoute } from "@tanstack/react-router";
import { CommitteeTermPage } from "@/pages/admin/CommitteeTermPage";

export const Route = createFileRoute("/manage-committee/new-term")({
  head: () => ({
    meta: [{ title: "Committee term" }],
  }),
  component: CommitteeTermPage,
});
