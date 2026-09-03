import { createFileRoute } from "@tanstack/react-router";
import { BallotAttendancePage } from "@/pages/admin/CommitteeBallotAdmissionPage";

export const Route = createFileRoute("/committee-ballot/attendance")({
  head: () => ({
    meta: [{ title: "Mark present — Committee Ballot — Aero Club of East Africa" }],
  }),
  component: BallotAttendancePage,
});
