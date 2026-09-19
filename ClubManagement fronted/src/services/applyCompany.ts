import { TENANT_CODE } from "@/config/env";
import type { ClubSetupCountry, ClubSetupDesignation } from "@/services/admin/clubSetup";

const APPLY_COMPANY_KEY = "acea.apply.company";

export type ApplyCompanyContext = {
  companyId: number;
  companyCode: string;
  slug: string;
  companyName: string;
  logoUrl?: string | null;
  countries: ClubSetupCountry[];
  designations: ClubSetupDesignation[];
};

export function persistApplyCompany(context: ApplyCompanyContext) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    APPLY_COMPANY_KEY,
    JSON.stringify({
      companyId: context.companyId,
      companyCode: context.companyCode,
      slug: context.slug,
      companyName: context.companyName,
      logoUrl: context.logoUrl ?? null,
    }),
  );
}

export function readApplyCompany(): Omit<ApplyCompanyContext, "countries" | "designations"> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(APPLY_COMPANY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApplyCompanyContext;
    if (!parsed.companyId || !parsed.companyCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function applyTenantCode() {
  return readApplyCompany()?.companyCode?.trim().toUpperCase() || TENANT_CODE;
}

export function applyCompanyId() {
  return readApplyCompany()?.companyId ?? null;
}
