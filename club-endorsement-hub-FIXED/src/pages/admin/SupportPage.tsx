import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";

export function SupportPage() {
  return (
    <PageFrame width="sm">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Support"
        description="Support information coming soon."
      />
    </PageFrame>
  );
}
