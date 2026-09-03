import { createFileRoute } from "@tanstack/react-router";
import { MeetingPendingPage } from "@/pages/admin/CommitteeMeetingsPage";

export const Route = createFileRoute("/manage-committee/meetings/pending")({
  head: () => ({
    meta: [{ title: "Pending application — Aero Club of East Africa" }],
  }),
  component: MeetingPendingPage,
});
