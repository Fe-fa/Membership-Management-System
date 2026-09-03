import { createFileRoute } from "@tanstack/react-router";
import { MeetingHistoryPage } from "@/pages/admin/CommitteeMeetingsPage";

export const Route = createFileRoute("/manage-committee/meetings/history")({
  head: () => ({
    meta: [{ title: "Interview history — Aero Club of East Africa" }],
  }),
  component: MeetingHistoryPage,
});
