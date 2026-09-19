import { useQuery } from "@tanstack/react-query";

import { ModuleStatsDashboard } from "@/components/admin/ModuleStatsDashboard";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageDataGate } from "@/components/layout/PageLoading";
import { ADMIN_OVERVIEW_QUERY_KEY, fetchAdminOverview } from "@/services/admin/dashboardData";
import { buildModuleDashboard, type ModuleDashboardId } from "@/services/admin/moduleDashboard";
import type { ApplicationRow, MemberRow } from "@/services/admin/membershipDesk";
import { apiRequest } from "@/services/membership/api";
import { pagedQuery, type PagedResult } from "@/lib/pagination";

const APP_MODULES: ModuleDashboardId[] = ["applicant-queue", "manager-queue", "committee-ballot"];
const MEMBER_MODULES: ModuleDashboardId[] = ["manage-records", "applicant-queue", "committee-ballot"];

export function ModuleDashboardPage({ moduleId }: { moduleId: ModuleDashboardId }) {
  const overview = useQuery({
    queryKey: ADMIN_OVERVIEW_QUERY_KEY,
    queryFn: fetchAdminOverview,
  });
  const applications = useQuery({
    queryKey: ["module-dashboard", "applications", moduleId],
    queryFn: () =>
      apiRequest<PagedResult<ApplicationRow>>(
        moduleId === "manager-queue"
          ? `/api/applications/manager-queue?${pagedQuery({ page: 1, pageSize: 100 })}`
          : `/api/applications?${pagedQuery({ page: 1, pageSize: 100 })}`,
      ),
    enabled: APP_MODULES.includes(moduleId),
  });
  const members = useQuery({
    queryKey: ["module-dashboard", "members", moduleId],
    queryFn: () =>
      apiRequest<PagedResult<MemberRow>>(
        `/api/membership-accounts?${pagedQuery({ page: 1, pageSize: 100 })}`,
      ),
    enabled: MEMBER_MODULES.includes(moduleId),
  });

  const loading = overview.isLoading || applications.isLoading || members.isLoading;
  const model = overview.data
    ? buildModuleDashboard(moduleId, overview.data, {
        applications: applications.data,
        members: members.data,
      })
    : null;

  return (
    <PageFrame width="lg" className="max-w-[1400px]">
      <PageDataGate loading={loading} label="Loading dashboard…" minHeightClassName="min-h-[28rem]">
        {model ? <ModuleStatsDashboard model={model} /> : null}
      </PageDataGate>
    </PageFrame>
  );
}
