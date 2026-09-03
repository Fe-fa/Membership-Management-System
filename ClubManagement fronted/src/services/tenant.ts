import { useQuery } from "@tanstack/react-query";

import { TENANT_CODE } from "@/config/env";
import { apiRequest } from "@/services/membership/api";

export type TenantPublic = {
  tenantId: number;
  code: string;
  name: string;
  shortName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine?: string | null;
};

export const tenantQueryKey = ["tenant", "current", TENANT_CODE] as const;

export function useCurrentTenant() {
  return useQuery({
    queryKey: tenantQueryKey,
    queryFn: () => apiRequest<TenantPublic>("/api/tenants/current"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function tenantDisplayName(tenant?: TenantPublic | null) {
  return tenant?.name?.trim() || "Aero Club of East Africa";
}
