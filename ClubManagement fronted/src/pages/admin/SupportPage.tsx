import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { ApplicantSupportPage } from "@/pages/applicant/ApplicantSupportPage";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

export function SupportPage() {
  const user = readUser();
  const mode = readPortalMode(user);

  if (mode === "applicant" || (!isStaff(user) && mode !== "admin")) {
    return <ApplicantSupportPage />;
  }

  return (
    <PageFrame width="sm">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Support"
        description="Staff help desk. Applicant tickets are raised from the Applicant Support Center."
      />
      <p className="text-sm text-muted-foreground">
        Use Membership desk and Finance desk queues for application and payment issues. Applicant
        self-service tickets appear under the applicant portal Support page.
      </p>
    </PageFrame>
  );
}
