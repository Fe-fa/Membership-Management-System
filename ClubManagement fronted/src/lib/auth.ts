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
  const headers: Record<string, string> = { "X-Tenant-Code": TENANT_CODE };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function hasAnyRole(user: AuthUser | null, roles: string[]) {
  if (!user) return false;
  const normalized = user.roles.map((role) => role.toUpperCase());
  return roles.some((role) => normalized.includes(role.toUpperCase()));
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

export function homePathForUser(user: AuthUser | null): "/" | "/admin" | "/reception" {
  if (isStaff(user) && readPortalMode(user) === "admin") {
    return isReceptionistOnly(user) ? "/reception" : "/admin";
  }
  return "/";
}

/** True if any selected role needs a club membership number (Admin / Receptionist do not). */
export function roleRequiresMembershipNo(roleCodes: string | string[]) {
  const codes = (Array.isArray(roleCodes) ? roleCodes : [roleCodes]).map((c) =>
    c.trim().toUpperCase(),
  );
  if (codes.length === 0) return false;
  return codes.some(
    (code) =>
      code !== "ADMIN" &&
      code !== "APPLICANT" &&
      code !== "SUPER_ADMIN" &&
      code !== "RECEPTIONIST",
  );
}
