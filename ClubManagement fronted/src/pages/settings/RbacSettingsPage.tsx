import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type RoleOption, type UserListResponse } from "@/services/admin/userManagement";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

export function RbacSettingsPage() {
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
    <PageFrame width="lg">
      <PageHeader
        title="Role-Based Access Control"
        description="Assign System_role codes to each User_account. Changes write to User_role (assigned_date is set on save)."
      />

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
                  const dirty = JSON.stringify([...(row.roles ?? [])].sort()) !== JSON.stringify([...codes].sort());
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
        Applicant is not listed here — applicants self-register. Access is the union of checked System_role rows.
      </p>
    </PageFrame>
  );
}
