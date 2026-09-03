/** App configuration (API, feature flags, multi-tenant). */
export const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE)?.replace(/\/$/, "") ||
  "http://localhost:5275";

/** Owning club code (X-Tenant-Code). Default ACEA for this deployment. */
export const TENANT_CODE =
  (
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_TENANT_CODE) ||
    "ACEA"
  )
    .toString()
    .trim()
    .toUpperCase() || "ACEA";
