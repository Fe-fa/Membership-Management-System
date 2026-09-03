import { createFileRoute } from "@tanstack/react-router";
import { CommitteeMembersPage } from "@/pages/admin/CommitteeMembersPage";

export const Route = createFileRoute("/manage-committee/members")({
  head: () => ({
    meta: [{ title: "Committee members — Aero Club of East Africa" }],
  }),
  component: CommitteeMembersPage,
});
