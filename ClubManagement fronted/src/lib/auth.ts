import { applyTenantCode } from "@/services/applyCompany";
import { TENANT_CODE } from "@/config/env";

const TOKEN_KEY = "acea.auth.token";
const USER_KEY = "acea.auth.user";
const PORTAL_KEY = "acea.portal.mode";
/** Fired in this tab after login / logout so UI can leave the login screen. */
export const AUTH_CHANGED_EVENT = "acea-auth-changed";

export type AuthUser = {
  userAccountId: number;
  profileId: number;
  username: string;
  fullName: string;
  email?: string | null;
  roles: string[];
  mustChangePassword?: boolean;
  tenantId?: number;
  tenantCode?: string;
  tenantName?: string;
  photoUrl?: string | null;
};

export type AuthResponse = {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
};

/** Staff / admin roles that use the admin portal by default. */
export const STAFF_ROLES = [
  "ADMIN",
  "GENERAL_MANAGER",
  "CHAIRMAN",
  "TREASURER",
  "COMMITTEE_MEMBER",
  "RECEPTIONIST",
];

/** Roles that can switch between admin / member / applicant dashboards. */
export const DASHBOARD_SWITCH_ROLES = [
  "ADMIN",
  "GENERAL_MANAGER",
  "CHAIRMAN",
];

export type PortalMode = "admin" | "member" | "applicant";

export function readToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function readUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

/** True when a session token and user profile are present in the browser. */
export function isAuthenticated() {
  return Boolean(readToken() && readUser());
}

function notifyAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/** Subscribe to login/logout in this tab (and storage changes from other tabs). */
export function subscribeAuthChanged(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTH_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function clearNamespacedClientData() {
  if (typeof window === "undefined") return;
  const remove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("acea.application.") || key.startsWith("acea.payment.")) {
      remove.push(key);
    }
  }
  for (const key of remove) window.localStorage.removeItem(key);
}

export function persistUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyAuthChanged();
}

export function persistSession(response: AuthResponse) {
  clearNamespacedClientData();
  window.localStorage.setItem(TOKEN_KEY, response.accessToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(response.user));
  if (isStaff(response.user)) {
    window.localStorage.setItem(PORTAL_KEY, "admin");
  } else if (isClubMember(response.user)) {
    window.localStorage.setItem(PORTAL_KEY, "member");
  } else {
    window.localStorage.setItem(PORTAL_KEY, "applicant");
  }
  notifyAuthChanged();
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(PORTAL_KEY);
  clearNamespacedClientData();
  notifyAuthChanged();
}

export function authHeaders(): Record<string, string> {
  const token = readToken();
  const headers: Record<string, string> = { "X-Tenant-Code": applyTenantCode() || TENANT_CODE };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function roleCodesOf(user: AuthUser | null): string[] {
  if (!user?.roles?.length) return [];
  return user.roles.map((role) => String(role).trim().toUpperCase()).filter(Boolean);
}

function roleCodesFromAccessToken(): string[] | null {
  const token = readToken();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const payload = JSON.parse(json) as Record<string, unknown>;
    const claim =
      payload.role ??
      payload.roles ??
      payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];
    if (claim == null) return [];
    const list = Array.isArray(claim) ? claim : [claim];
    return list.map((role) => String(role).trim().toUpperCase()).filter(Boolean);
  } catch {
    return null;
  }
}

export function hasAnyRole(user: AuthUser | null, roles: string[]) {
  if (!user) return false;
  const wanted = roles.map((role) => role.toUpperCase());
  const normalized = roleCodesOf(user);
  return wanted.some((role) => normalized.includes(role));
}

/** Invoice/statement approval queue: GM and Admin only. */
export const BILLING_APPROVER_ROLES = ["ADMIN", "GENERAL_MANAGER"] as const;

export function canApproveBillingDocuments(user: AuthUser | null) {
  return hasAnyRole(user, [...BILLING_APPROVER_ROLES]);
}

/** Club-wide statements desk: Admin, GM, Treasurer. */
export const STATEMENT_STAFF_ROLES = ["ADMIN", "GENERAL_MANAGER", "TREASURER"] as const;

export function canViewFinanceStatements(user: AuthUser | null) {
  return hasAnyRole(user, [...STATEMENT_STAFF_ROLES]);
}

/** Issued-statement delete (and ledger credit/debit on this desk): Admin role only. */
export function canDeleteFinanceStatements(user: AuthUser | null) {
  const fromProfile = roleCodesOf(user).includes("ADMIN");
  const tokenRoles = roleCodesFromAccessToken();
  if (tokenRoles && tokenRoles.length > 0) return tokenRoles.includes("ADMIN");
  return fromProfile;
}

export function isStaff(user: AuthUser | null) {
  return hasAnyRole(user, STAFF_ROLES);
}

export function isClubMember(user: AuthUser | null) {
  if (!user) return false;
  return user.roles.some((role) => role.toUpperCase() === "MEMBER");
}

export function canSwitchDashboard(user: AuthUser | null) {
  return hasAnyRole(user, DASHBOARD_SWITCH_ROLES);
}

export function allowedPortalModes(user: AuthUser | null): PortalMode[] {
  if (canSwitchDashboard(user)) return ["admin", "member", "applicant"];
  if (isStaff(user)) return ["admin"];
  if (isClubMember(user)) return ["member"];
  return ["applicant"];
}

function classifyPath(pathname: string): "public" | "admin" | "member" | "applicant" | "shared" {
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/apply/") ||
    pathname === "/set-password"
  ) {
    return "public";
  }
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/members" ||
    pathname.startsWith("/members/") ||
    pathname === "/existing-members" ||
    pathname.startsWith("/existing-members/") ||
    pathname === "/register-member" ||
    pathname === "/user-management" ||
    pathname.startsWith("/user-management/") ||
    pathname === "/club-setup" ||
    pathname.startsWith("/club-setup/") ||
    pathname === "/finance" ||
    pathname.startsWith("/finance/") ||
    pathname === "/manage-committee" ||
    pathname.startsWith("/manage-committee/") ||
    pathname === "/reception" ||
    pathname.startsWith("/reception/")
  ) {
    return "admin";
  }
  if (
    pathname === "/applications" ||
    pathname.startsWith("/applications/") ||
    pathname === "/application" ||
    pathname.startsWith("/application/")
  ) {
    return "applicant";
  }
  if (
    pathname === "/guests" ||
    pathname.startsWith("/guests/") ||
    pathname === "/governance" ||
    pathname.startsWith("/governance/") ||
    pathname === "/accommodation" ||
    pathname.startsWith("/accommodation/") ||
    pathname === "/corkage" ||
    pathname.startsWith("/corkage/") ||
    pathname === "/custom-charges" ||
    pathname.startsWith("/custom-charges/") ||
    pathname === "/election" ||
    pathname.startsWith("/election/") ||
    pathname === "/committee-ballot" ||
    pathname.startsWith("/committee-ballot/") ||
    pathname === "/endorsements" ||
    pathname.startsWith("/endorsements/")
  ) {
    return "member";
  }
  return "shared";
}

/** Applicants stay on the applicant portal; members stay on the member portal; only Admin / GM / Chairman may cross into other portals. */
export function canVisitPath(user: AuthUser | null, pathname: string): boolean {
  const kind = classifyPath(pathname);
  if (kind === "public") return true;
  if (!user) return pathname === "/";
  if (pathname === "/finance/approvals" || pathname.startsWith("/finance/approvals/")) {
    return canApproveBillingDocuments(user);
  }
  if (pathname === "/finance/statements" || pathname.startsWith("/finance/statements/")) {
    return canViewFinanceStatements(user);
  }
  if (canSwitchDashboard(user)) return true;
  if (
    pathname === "/election" ||
    pathname.startsWith("/election/") ||
    pathname === "/committee-ballot" ||
    pathname.startsWith("/committee-ballot/")
  ) {
    return isStaff(user) || isClubMember(user);
  }
  if (kind === "shared") return true;
  if (isStaff(user)) return kind === "admin";
  if (isClubMember(user)) return kind === "member";
  return kind === "applicant";
}

export function readPortalMode(user: AuthUser | null = readUser()): PortalMode {
  const allowed = allowedPortalModes(user);
  if (!user) return "applicant";
  if (typeof window === "undefined") return allowed[0] ?? "applicant";
  const raw = window.localStorage.getItem(PORTAL_KEY);
  if (raw === "member" || raw === "applicant" || raw === "admin") {
    if (allowed.includes(raw)) return raw;
  }
  return allowed[0] ?? "applicant";
}

export function setPortalMode(mode: PortalMode) {
  if (typeof window === "undefined") return;
  if (!allowedPortalModes(readUser()).includes(mode)) return;
  window.localStorage.setItem(PORTAL_KEY, mode);
}

/** Default landing route after login / portal switch. */
export function isReceptionistOnly(user: AuthUser | null) {
  return (
    hasAnyRole(user, ["RECEPTIONIST"]) &&
    !hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN", "TREASURER", "COMMITTEE_MEMBER"])
  );
}

export function canOperateReception(user: AuthUser | null) {
  return hasAnyRole(user, ["RECEPTIONIST"]);
}

/** Full guest book. Reception only sees who is on site, plus a named lookup. */
export function canViewAllReceptionVisits(user: AuthUser | null) {
  return hasAnyRole(user, ["ADMIN", "GENERAL_MANAGER", "CHAIRMAN"]);
}

export function homePathForUser(user: AuthUser | null): "/" | "/admin" | "/reception" {
  if (isStaff(user) && readPortalMode(user) === "admin") {
    return isReceptionistOnly(user) ? "/reception" : "/admin";
  }
  return "/";
}

function normalizeRoleCodes(roleCodes: string | string[]) {
  return (Array.isArray(roleCodes) ? roleCodes : [roleCodes]).map((c) => c.trim().toUpperCase());
}

/** Applicant, member/officer hats, and receptionist must belong to a company. Admin does not. */
export const COMPANY_REQUIRED_ROLES = [
  "APPLICANT",
  "MEMBER",
  "GENERAL_MANAGER",
  "CHAIRMAN",
  "TREASURER",
  "COMMITTEE_MEMBER",
  "RECEPTIONIST",
] as const;

export function roleRequiresCompany(roleCodes: string | string[]) {
  const codes = normalizeRoleCodes(roleCodes);
  return codes.some((code) =>
    (COMPANY_REQUIRED_ROLES as readonly string[]).includes(code),
  );
}

export function roleIsAdminWithoutCompany(roleCodes: string | string[]) {
  const codes = normalizeRoleCodes(roleCodes);
  return codes.includes("ADMIN") && !roleRequiresCompany(codes);
}

/** True if any selected role needs a club membership number (Admin / Receptionist do not). */
export function roleRequiresMembershipNo(roleCodes: string | string[]) {
  const codes = normalizeRoleCodes(roleCodes);
  if (codes.length === 0) return false;
  return codes.some(
    (code) =>
      code !== "ADMIN" &&
      code !== "APPLICANT" &&
      code !== "SUPER_ADMIN" &&
      code !== "RECEPTIONIST",
  );
}
