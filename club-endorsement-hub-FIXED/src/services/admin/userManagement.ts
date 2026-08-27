export type ManagedUser = {
  userAccountId: number;
  profileId: number;
  username: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  mobile?: string | null;
  accountStatus: string;
  isActive: boolean;
  emailVerified: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  roles: string[];
};

export type UserListResponse = {
  items: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
};

export type RoleOption = {
  id?: number;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
};

export type InviteResult = {
  inviteUrl: string;
  emailSent: boolean;
};

export const ACCOUNT_STATUSES = [
  { id: "all", label: "All statuses" },
  { id: "PENDING", label: "Pending" },
  { id: "ACTIVE", label: "Active" },
  { id: "SUSPENDED", label: "Suspended" },
  { id: "BLOCKED", label: "Blocked" },
  { id: "DEACTIVATED", label: "Deactivated" },
] as const;

export function statusClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "SUSPENDED":
      return "border-orange-200 bg-orange-50 text-orange-900";
    case "BLOCKED":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
  }
}

export function roleLabel(code: string) {
  return code.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
