import { createFileRoute } from "@tanstack/react-router";
import { MeetingInterviewPage } from "@/pages/admin/CommitteeMeetingsPage";

export const Route = createFileRoute("/manage-committee/meetings/interview")({
  head: () => ({
    meta: [{ title: "Short interview" }],
  }),
  component: MeetingInterviewPage,
});
