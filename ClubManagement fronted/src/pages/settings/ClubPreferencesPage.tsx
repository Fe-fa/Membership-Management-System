import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { readUser } from "@/lib/auth";
import { tenantDisplayName, useCurrentTenant } from "@/services/tenant";

export function ClubPreferencesPage() {
  const tenant = useCurrentTenant();
  const user = readUser();
  return (
    <PageFrame width="sm">
      <PageHeader
        title="Club preferences"
        description="These values come from the current tenant. Role assignment is under Role-Based Access Control."
      />
      <dl className="space-y-3 rounded-xl border bg-card p-4 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Club</dt>
          <dd className="mt-1 font-medium">{tenantDisplayName(tenant.data)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tenant code</dt>
          <dd className="mt-1">{user?.tenantCode ?? "ACEA"}</dd>
        </div>
      </dl>
    </PageFrame>
  );
}
