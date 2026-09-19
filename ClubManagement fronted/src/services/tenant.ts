import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { TENANT_CODE } from "@/config/env";
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

export const tenantQueryKey = ["tenant", "current", TENANT_CODE] as const;

export function useCurrentTenant() {
  const query = useQuery({
    queryKey: tenantQueryKey,
    queryFn: () => apiRequest<TenantPublic>("/api/tenants/current"),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    setActiveCurrency(tenantCurrencyCode(query.data));
  }, [query.data]);

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
