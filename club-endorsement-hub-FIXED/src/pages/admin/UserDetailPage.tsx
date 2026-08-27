import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  roleLabel,
  statusClass,
  type InviteResult,
  type ManagedUser,
  type RoleOption,
} from "@/services/admin/userManagement";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

const routeApi = getRouteApi("/user-management/$userAccountId");

export function UserDetailPage() {
  const { userAccountId } = routeApi.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", mobile: "", username: "" });
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState("");

  const detail = useQuery({
    queryKey: ["managed-users", userAccountId],
    queryFn: () => apiRequest<ManagedUser>(`/api/users/${userAccountId}`),
  });

  const roles = useQuery({
    queryKey: ["managed-roles"],
    queryFn: () => apiRequest<RoleOption[]>("/api/users/roles"),
  });

  useEffect(() => {
    if (!detail.data) return;
    setForm({
      firstName: detail.data.firstName ?? "",
      lastName: detail.data.lastName ?? "",
      email: detail.data.email ?? "",
      mobile: detail.data.mobile ?? "",
      username: detail.data.username,
    });
    setRoleCodes(detail.data.roles ?? []);
  }, [detail.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["managed-users"] });
  };

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/users/${userAccountId}`, {
        method: "PUT",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      toast.success("Details saved.");
      refresh();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const assignRoles = useMutation({
    mutationFn: () => {
      if (!roleCodes.length) throw new Error("Select at least one role.");
      return apiRequest(`/api/users/${userAccountId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleCodes }),
      });
    },
    onSuccess: () => {
      toast.success("Roles updated.");
      refresh();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  function toggleRole(code: string) {
    setRoleCodes((prev) => {
      const has = prev.includes(code);
      const next = has ? prev.filter((c) => c !== code) : [...prev, code];
      return next.length ? next : prev;
    });
  }

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      apiRequest(`/api/users/${userAccountId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success("Account status updated.");
      refresh();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const setPassword = useMutation({
    mutationFn: () =>
      apiRequest(`/api/users/${userAccountId}/password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      }),
    onSuccess: () => {
      toast.success("Password set. The user must change it on first sign-in.");
      setNewPassword("");
      refresh();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const resetLink = useMutation({
    mutationFn: () => apiRequest<InviteResult>(`/api/users/${userAccountId}/reset-link`, { method: "POST" }),
    onSuccess: (result) => {
      toast.success(
        result.emailSent
          ? "Password reset email sent."
          : "Reset link created. Copy it — SMTP is not configured.",
      );
      if (!result.emailSent) {
        void navigator.clipboard.writeText(result.inviteUrl);
      }
      refresh();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => apiRequest(`/api/users/${userAccountId}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Account deleted.");
      await navigate({ to: "/user-management" });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  if (detail.isLoading) {
    return (
      <PageFrame>
        <PageBackLink to="/user-management" label="Back to user management" />
        <p className="text-sm text-muted-foreground">Loading user…</p>
      </PageFrame>
    );
  }

  if (!detail.data) {
    return (
      <PageFrame>
        <PageBackLink to="/user-management" label="Back to user management" />
        <p className="text-sm text-muted-foreground">
          {detail.error ? extractErrorMessage(detail.error) : "User was not found."}
        </p>
      </PageFrame>
    );
  }

  const user = detail.data;
  const busy =
    save.isPending ||
    assignRoles.isPending ||
    setStatus.isPending ||
    setPassword.isPending ||
    resetLink.isPending ||
    remove.isPending;

  return (
    <PageFrame>
      <PageBackLink to="/user-management" label="Back to user management" />
      <PageHeader
        title={user.fullName}
        description={`${user.username} Â· ${user.email || "No email"}`}
        actions={
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
              statusClass(user.accountStatus),
            )}
          >
            {user.accountStatus}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Name, email and phone used for club communication.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <Label>First name</Label>
                  <Input
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <Label>Last name</Label>
                  <Input
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <Label>Phone</Label>
                <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                <Label>Username</Label>
                <Input
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </label>
              <Button type="submit" disabled={busy}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save details
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
            <CardDescription>
              Assign or revoke roles from System_role. Access is the union of all selected roles.
              Applicants are not assigned here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {user.roles.length
                ? user.roles.map((code) => (
                    <span
                      key={code}
                      className="inline-flex rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium"
                    >
                      {roleLabel(code)}
                    </span>
                  ))
                : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-input p-2">
              {(roles.data ?? []).map((option) => {
                const checked = roleCodes.includes(option.code);
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
            <Button type="button" disabled={busy || !roleCodes.length} onClick={() => assignRoles.mutate()}>
              {assignRoles.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save roles
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Set a temporary password or send a reset link to their email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="grid gap-1 text-sm">
              <Label>New password</Label>
              <Input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || newPassword.length < 8}
                onClick={() => setPassword.mutate()}
              >
                {setPassword.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Set password
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => resetLink.mutate()}>
                {resetLink.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Send reset link
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account status</CardTitle>
            <CardDescription>Suspend, block, deactivate or delete this login.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(["ACTIVE", "SUSPENDED", "BLOCKED", "DEACTIVATED"] as const).map((status) => (
              <Button
                key={status}
                type="button"
                variant={user.accountStatus === status ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => setStatus.mutate(status)}
              >
                {status === "ACTIVE" ? "Activate" : status.slice(0, 1) + status.slice(1).toLowerCase()}
              </Button>
            ))}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete ${user.fullName}'s login? This cannot be undone.`)) {
                  remove.mutate();
                }
              }}
            >
              Delete account
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
