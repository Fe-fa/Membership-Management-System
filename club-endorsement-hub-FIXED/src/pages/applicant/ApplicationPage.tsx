import { ApplicationWizard } from "@/components/membership/ApplicationWizard";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";

export function ApplicationPage() {
  return (
    <PageFrame>
      <PageBackLink to="/applications" label="Back to application" />
      <PageHeader
        title="Membership application form"
        description="Complete the form here."
      />
      <ApplicationWizard />
    </PageFrame>
  );
}
