import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";

export function SettingsPage() {
  return (
    <PageFrame width="sm">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Setting"
        description="Users, roles, and club preferences will live here."
      />
    </PageFrame>
  );
}
