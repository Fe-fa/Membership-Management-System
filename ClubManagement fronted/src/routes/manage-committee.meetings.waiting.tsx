import { createFileRoute } from "@tanstack/react-router";
import { MeetingWaitingPage } from "@/pages/admin/CommitteeMeetingsPage";

export const Route = createFileRoute("/manage-committee/meetings/waiting")({
  head: () => ({
    meta: [{ title: "Waiting for meeting — Aero Club of East Africa" }],
  }),
  component: MeetingWaitingPage,
});
