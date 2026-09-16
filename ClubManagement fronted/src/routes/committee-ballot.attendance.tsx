import { createFileRoute } from "@tanstack/react-router";
import { BallotAttendancePage } from "@/pages/admin/CommitteeBallotAdmissionPage";

export const Route = createFileRoute("/committee-ballot/attendance")({
  head: () => ({
    meta: [{ title: "Mark present" }],
  }),
  component: BallotAttendancePage,
});
