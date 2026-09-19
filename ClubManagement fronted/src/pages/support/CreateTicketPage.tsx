import { useNavigate } from "@tanstack/react-router";

import { CreateTicketForm } from "@/components/support/CreateTicketForm";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";

export function CreateTicketPage() {
  const navigate = useNavigate();
  return (
    <PageFrame width="md">
      <PageBackLink to="/support" label="Back to dashboard" />
      <PageHeader
        title="Create New Support Ticket"
        description="Category is an office role. Selecting it shows that role’s email, and the ticket appears on their support dashboard."
      />
      <CreateTicketForm onCancel={() => void navigate({ to: "/support" })} />
    </PageFrame>
  );
}
