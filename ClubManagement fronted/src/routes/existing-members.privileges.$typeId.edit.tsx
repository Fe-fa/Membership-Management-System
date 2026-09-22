import { createFileRoute } from "@tanstack/react-router";
import { MembershipTypeFormPage } from "@/pages/admin/MembershipTypeFormPage";

export const Route = createFileRoute("/existing-members/privileges/$typeId/edit")({
  head: () => ({
    meta: [{ title: "Edit membership type" }],
  }),
  component: EditMembershipTypePage,
});

function EditMembershipTypePage() {
  const { typeId } = Route.useParams();
  return <MembershipTypeFormPage typeId={Number(typeId)} />;
}
