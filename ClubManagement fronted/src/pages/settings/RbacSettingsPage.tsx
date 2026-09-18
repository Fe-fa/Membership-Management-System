import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type RoleOption, type UserListResponse } from "@/services/admin/userManagement";
import {
  extractErrorMessage,
  type OfficeAccess,
  type OfficeModulePermission,
  useOfficePermissionMatrix,
  useSaveOfficePermissions,
} from "@/services/admin/officePermissions";
import { apiRequest } from "@/services/membership/api";

function AssignRolesPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<number, string[]>>({});

  const roles = useQuery({
    queryKey: ["managed-roles"],
    queryFn: () => apiRequest<RoleOption[]>("/api/users/roles"),
  });

  const list = useQuery({
    queryKey: ["managed-users", "rbac", search],
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (search.trim()) params.set("search", search.trim());
      return apiRequest<UserListResponse>(`/api/users?${params.toString()}`);
    },
  });

  const catalog = roles.data ?? [];
  const items = list.data?.items ?? [];

  const selected = useMemo(() => {
    const map: Record<number, string[]> = {};
    for (const row of items) {
      map[row.userAccountId] = draft[row.userAccountId] ?? row.roles ?? [];
    }
    return map;
  }, [items, draft]);

  const save = useMutation({
    mutationFn: ({ userAccountId, roleCodes }: { userAccountId: number; roleCodes: string[] }) =>
      apiRequest(`/api/users/${userAccountId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleCodes }),
      }),
    onSuccess: () => {
      toast.success("Roles saved to User_role.");
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  function toggle(userAccountId: number, code: string) {
    setDraft((prev) => {
      const current = prev[userAccountId] ?? items.find((u) => u.userAccountId === userAccountId)?.roles ?? [];
      const has = current.includes(code);
      const next = has ? current.filter((c) => c !== code) : [...current, code];
      return { ...prev, [userAccountId]: next.length ? next : current };
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Assign System_role codes to each User_account. Changes write to User_role (assigned_date is set
        on save). Access is the union of checked roles.
      </p>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-9"
          placeholder="Search name, username or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {list.isLoading || roles.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading accounts and System_role catalog…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">User account</th>
                {catalog.map((role) => (
                  <th key={role.code} className="px-2 py-2 text-center font-medium">
                    {role.name}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={catalog.length + 2}>
                    No user accounts found.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const codes = selected[row.userAccountId] ?? [];
                  const dirty =
                    JSON.stringify([...(row.roles ?? [])].sort()) !== JSON.stringify([...codes].sort());
                  return (
                    <tr key={row.userAccountId} className="border-t align-middle">
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.username} · {row.email || "No email"} · {row.accountStatus}
                        </p>
                      </td>
                      {catalog.map((role) => (
                        <td key={role.code} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={codes.includes(role.code)}
                            title={role.description || role.name}
                            onChange={() => toggle(row.userAccountId, role.code)}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!dirty || save.isPending || codes.length === 0}
                          onClick={() => save.mutate({ userAccountId: row.userAccountId, roleCodes: codes })}
                        >
                          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                          Save
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Applicant is not listed here — applicants self-register. MEMBER grants member-portal access;
        office roles (Admin, GM, Treasurer, …) unlock staff cards via Office / staff permissions.
      </p>
    </div>
  );
}

function roleLabel(code: string) {
  return code
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function OfficePermissionsPanel() {
  const matrix = useOfficePermissionMatrix();
  const save = useSaveOfficePermissions();
  const [draft, setDraft] = useState<OfficeModulePermission[] | null>(null);

  const roles = matrix.data?.roleCodes ?? [];
  const modules = draft ?? matrix.data?.modules ?? [];

  const dirty = useMemo(() => {
    if (!matrix.data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(matrix.data.modules);
  }, [draft, matrix.data]);

  function setAccess(moduleId: string, role: string, patch: Partial<OfficeAccess>) {
    setDraft((prev) => {
      const base = prev ?? matrix.data?.modules ?? [];
      return base.map((mod) => {
        if (mod.moduleId !== moduleId) return mod;
        const current = mod.access[role] ?? { view: false, write: false };
        let next: OfficeAccess = { ...current, ...patch };
        if (next.write) next = { ...next, view: true };
        if (patch.view === false) next = { view: false, write: false };
        return {
          ...mod,
          access: { ...mod.access, [role]: next },
        };
      });
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          type="button"
          disabled={!dirty || save.isPending || modules.length === 0}
          onClick={() => {
            save.mutate(modules, {
              onSuccess: (data) => {
                setDraft(null);
                toast.success("Office / staff permissions saved.");
                // Keep UI in sync with server merge.
                void data;
              },
              onError: (error) => toast.error(extractErrorMessage(error)),
            });
          }}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save permissions
        </Button>
      </div>

      {matrix.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading office permission matrix…</p>
      ) : matrix.isError ? (
        <p className="text-sm text-destructive">{extractErrorMessage(matrix.error)}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2">Admin module</th>
                {roles.map((role) => (
                  <th key={role} className="px-2 py-2 text-center font-medium">
                    <span className="block whitespace-nowrap">{roleLabel(role)}</span>
                    <span className="mt-1 flex justify-center gap-3 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                      <span>View</span>
                      <span>Write</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <tr key={mod.moduleId} className="border-t align-middle">
                  <td className="sticky left-0 z-10 bg-card px-3 py-3">
                    <p className="font-medium">{mod.title}</p>
                    <p className="text-xs text-muted-foreground">{mod.description}</p>
                  </td>
                  {roles.map((role) => {
                    const cell = mod.access[role] ?? { view: false, write: false };
                    return (
                      <td key={`${mod.moduleId}-${role}`} className="px-2 py-3 text-center">
                        <div className="inline-flex items-center justify-center gap-3">
                          <label className="inline-flex cursor-pointer items-center" title="View">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={cell.view}
                              onChange={(e) =>
                                setAccess(mod.moduleId, role, { view: e.target.checked })
                              }
                            />
                            <span className="sr-only">View</span>
                          </label>
                          <label className="inline-flex cursor-pointer items-center" title="Write">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={cell.write}
                              onChange={(e) =>
                                setAccess(mod.moduleId, role, { write: e.target.checked })
                              }
                            />
                            <span className="sr-only">Write</span>
                          </label>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Write always includes view. ADMIN / GM / Chairman can edit this matrix. Card visibility on the
        admin dashboard uses the View column for the signed-in user&apos;s roles.
      </p>
    </div>
  );
}

export function RbacSettingsPage() {
  return (
    <PageFrame width="lg">
      <Tabs defaultValue="roles" className="gap-0">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-muted/80 p-1 sm:w-auto">
          <TabsTrigger value="roles" className="rounded-lg px-3 py-2 data-[state=active]:shadow-sm">
            Assign roles
          </TabsTrigger>
          <TabsTrigger
            value="permissions"
            className="rounded-lg px-3 py-2 data-[state=active]:shadow-sm"
          >
              Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <AssignRolesPanel />
        </TabsContent>
        <TabsContent value="permissions" className="mt-4">
          <OfficePermissionsPanel />
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}
