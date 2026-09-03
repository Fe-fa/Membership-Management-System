import { useQuery } from "@tanstack/react-query";

import { ApplicationWizard } from "@/components/membership/ApplicationWizard";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { fetchApplication } from "@/services/membership/api";
import { applicationQueryKey } from "@/services/membership/useApplication";
import { readUser } from "@/lib/auth";

export function ApplicationPage() {
  const user = readUser();
  const { data: record } = useQuery({
    queryKey: applicationQueryKey(user?.userAccountId),
    queryFn: fetchApplication,
    staleTime: 15_000,
    enabled: Boolean(user?.userAccountId),
  });
  const updating = Boolean(record?.id && record.status !== "Draft");

  return (
    <PageFrame>
      <PageBackLink to="/applications" label="Back to application" />
      <PageHeader
        title={updating ? "Update your application" : "Membership application form"}
        description={
          updating
            ? "Edit the requested details and save. This is the same application — you are not starting a new one."
            : "Complete the form here."
        }
      />
      <ApplicationWizard />
    </PageFrame>
  );
}
