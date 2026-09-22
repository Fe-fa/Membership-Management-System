import { createFileRoute } from "@tanstack/react-router";
import { MembershipTypeFormPage } from "@/pages/admin/MembershipTypeFormPage";

export const Route = createFileRoute("/existing-members/privileges/new")({
  head: () => ({
    meta: [{ title: "Add membership type" }],
  }),
  component: () => <MembershipTypeFormPage />,
});
