import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCOUNT_STATUSES,
  roleLabel,
  statusClass,
  type InviteResult,
  type RoleOption,
  type UserListResponse,
} from "@/services/admin/userManagement";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { roleRequiresMembershipNo } from "@/lib/auth";
import { DEFAULT_PAGE_SIZE, pagedQuery } from "@/lib/pagination";
import { cn } from "@/utils/cn";

export function UserManagementPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [createOpen, setCreateOpen] = useState(false);

  const roles = useQuery({
    queryKey: ["managed-roles"],
    queryFn: () => apiRequest<RoleOption[]>("/api/users/roles"),
  });

  const list = useQuery({
    queryKey: ["managed-users", search, status, role, page, pageSize],
    queryFn: () => {
      const params = pagedQuery({
        page,
        pageSize,
        search: search.trim() || undefined,
        status: status !== "all" ? status : undefined,
        role: role !== "all" ? role : undefined,
      });
      return apiRequest<UserListResponse>(`/api/users?${params}`);
    },
  });

  const data = list.data;
  const totalCount = data?.totalCount ?? data?.total ?? 0;

  return (
    <PageFrame width="lg">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="User management"
        description="Admin or General Manager assigns staff and receptionist accounts. They verify by email and set a password. Applicants register on the website after three logged guest visits."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="size-4" />
            Add new user
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 lg:flex-row lg:items-end">
        <label className="grid min-w-[180px] flex-1 gap-1 text-xs font-medium text-muted-foreground">
          Search
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="Name, username or email"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
          </div>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            {ACCOUNT_STATUSES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Role
          <select
            className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm text-foreground"
            value={role}
            onChange={(event) => {
              setPage(1);
              setRole(event.target.value);
            }}
          >
            <option value="all">All roles</option>
            {(roles.data ?? []).map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Loading users…
                </td>
              </tr>
            ) : (data?.items.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No users match these filters.
                </td>
              </tr>
            ) : (
              data?.items.map((row) => (
                <tr key={row.userAccountId} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.username} Â· {row.email || "No email"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.roles.length
                        ? row.roles.map((code) => (
                            <span
                              key={code}
                              className="inline-flex rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium"
                            >
                              {roleLabel(code)}
                            </span>
                          ))
                        : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        statusClass(row.accountStatus),
                      )}
                    >
                      {row.accountStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString("en-KE") : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to="/user-management/$userAccountId"
                        params={{ userAccountId: String(row.userAccountId) }}
                      >
                        Manage
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ListPagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={data?.totalPages ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <CreateUserDialog
        open={createOpen}
        roles={roles.data ?? []}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["managed-users"] });
        }}
      />
    </PageFrame>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    username: "",
    roleCodes: ["MEMBER"] as string[],
    membershipNo: "",
  });
  const [invite, setInvite] = useState<InviteResult | null>(null);

  const options = useMemo(
    () => (roles.length ? roles : [{ code: "MEMBER", name: "Member" }]),
    [roles],
  );
  const needsMembershipNo = roleRequiresMembershipNo(form.roleCodes);

  function toggleRole(code: string) {
    setForm((prev) => {
      const has = prev.roleCodes.includes(code);
      const roleCodes = has
        ? prev.roleCodes.filter((c) => c !== code)
        : [...prev.roleCodes, code];
      return { ...prev, roleCodes: roleCodes.length ? roleCodes : prev.roleCodes };
    });
  }

  const create = useMutation({
    mutationFn: () => {
      if (!form.roleCodes.length) {
        throw new Error("Select at least one role.");
      }
      if (needsMembershipNo && !form.membershipNo.trim()) {
        throw new Error("Membership number is required for the selected role(s).");
      }
      return apiRequest<{ user: unknown; inviteUrl: string; emailSent: boolean }>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          mobile: form.mobile || null,
          username: form.username || null,
          roleCodes: form.roleCodes,
          membershipNo: needsMembershipNo ? form.membershipNo.trim() : null,
        }),
      });
    },
    onSuccess: (result) => {
      setInvite({ inviteUrl: result.inviteUrl, emailSent: result.emailSent });
      toast.success(
        result.emailSent
          ? "User created. A verification email was sent."
          : "User created. Copy the invite link — SMTP is not configured yet.",
      );
      onCreated();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  function close() {
    onOpenChange(false);
    setInvite(null);
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      mobile: "",
      username: "",
      roleCodes: ["MEMBER"],
      membershipNo: "",
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add new user</DialogTitle>
          <DialogDescription>
            Creates a staff, receptionist or member account. Receptionist accounts are assigned by
            Admin or General Manager and do not need a membership number. Other club roles require
            a membership number. Applicants must use the public registration page.
          </DialogDescription>
        </DialogHeader>

        {invite ? (
          <div className="space-y-3 text-sm">
            <p>
              {invite.emailSent
                ? "Verification email sent."
                : "Email was not sent (no SMTP host). Share this link with the user:"}
            </p>
            <p className="break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
              {invite.inviteUrl}
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(invite.inviteUrl);
                  toast.success("Invite link copied.");
                }}
              >
                Copy link
              </Button>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name">
                <Input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </Field>
              <Field label="Last name">
                <Input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Email">
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </Field>
            <Field label="Roles">
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                {options.map((option) => {
                  const checked = form.roleCodes.includes(option.code);
                  return (
                    <label
                      key={option.code}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        onChange={() => toggleRole(option.code)}
                      />
                      <span>{option.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Select one or more roles from System_role. Permissions are the union of all assigned
                roles.
              </p>
            </Field>
            {needsMembershipNo ? (
              <Field label="Membership no.">
                <Input
                  required
                  placeholder="e.g. AC-0001"
                  value={form.membershipNo}
                  onChange={(e) => setForm({ ...form, membershipNo: e.target.value })}
                />
              </Field>
            ) : (
              <p className="text-xs text-muted-foreground">
                Admin and receptionist accounts do not need a membership number.
              </p>
            )}
            <Field label="Username (optional)">
              <Input
                placeholder={needsMembershipNo ? "Defaults to membership no." : "Defaults to email"}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Create and send invite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
