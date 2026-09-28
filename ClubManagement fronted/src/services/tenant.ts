import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { TENANT_CODE } from "@/config/env";
import { isSuperAdmin, readUser } from "@/lib/auth";
import { activeClubCode } from "@/services/activeClub";
import { apiRequest } from "@/services/membership/api";
import { setActiveCurrency } from "@/utils/format";

export type TenantPublic = {
  tenantId: number;
  code: string;
  name: string;
  shortName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine?: string | null;
  logoUrl?: string | null;
  countryId?: number | null;
  countryCode?: string | null;
  countryName?: string | null;
  currencyCode?: string | null;
};

export const tenantQueryKey = ["tenant", "current"] as const;

export const ALL_CLUBS_CODE = "ALL";

export function currentTenantCode() {
  if (isSuperAdmin(readUser())) return activeClubCode() || ALL_CLUBS_CODE;
  return TENANT_CODE;
}

const allClubsTenant: TenantPublic = {
  tenantId: 0,
  code: ALL_CLUBS_CODE,
  name: "All clubs",
};

export function useCurrentTenant() {
  const code = currentTenantCode();
  const allClubs = code === ALL_CLUBS_CODE;
  const query = useQuery({
    queryKey: [...tenantQueryKey, code],
    queryFn: () => apiRequest<TenantPublic>("/api/tenants/current"),
    enabled: !allClubs,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const data = allClubs ? allClubsTenant : query.data;

  useEffect(() => {
    setActiveCurrency(tenantCurrencyCode(data));
  }, [data]);

  if (allClubs) {
    return { ...query, data: allClubsTenant, isLoading: false, isPending: false, isSuccess: true as const };
  }

  return query;
}

export function tenantDisplayName(tenant?: TenantPublic | null) {
  return tenant?.name?.trim() || "Aero Club of East Africa";
}

export function tenantCountryName(tenant?: TenantPublic | null) {
  return tenant?.countryName?.trim() || "KENYA";
}

export function tenantDocumentBrand(tenant?: TenantPublic | null) {
  return {
    clubName: tenantDisplayName(tenant),
    clubLogo: tenant?.logoUrl ?? null,
  };
}

export function tenantCurrencyCode(tenant?: TenantPublic | null) {
  const raw = tenant?.currencyCode?.trim();
  if (raw) return raw;
  const country = tenant?.countryCode?.trim().toUpperCase();
  if (country === "KE" || country === "KEN") return "KES";
  if (country === "UG" || country === "UGA") return "UGX";
  if (country === "TZ" || country === "TZA") return "TZS";
  if (country === "GB" || country === "UK") return "GBP";
  if (country === "US" || country === "USA") return "USD";
  return "KES";
}
