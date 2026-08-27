import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plane } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TENANT_CODE } from "@/config/env";
import { persistSession, homePathForUser, type AuthResponse } from "@/lib/auth";
import { API_BASE, extractErrorMessage } from "@/services/membership/api";
import { tenantDisplayName, useCurrentTenant } from "@/services/tenant";

export function LoginPage() {
  const navigate = useNavigate();
  const tenant = useCurrentTenant();
  const clubName = tenantDisplayName(tenant.data);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Code": TENANT_CODE,
        },
        body: JSON.stringify({ login: login.trim(), password }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Sign-in failed" }))).message);
      const data = (await res.json()) as AuthResponse;
      persistSession(data);
      toast.success(`Welcome, ${data.user.fullName}`);
      const dest = homePathForUser(data.user);
      await navigate({ to: dest, replace: true });
    } catch (err) {
      toast.error(extractErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="size-5 -rotate-45" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {clubName}
            </p>
            <h1 className="text-2xl">Sign in</h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Applicants: use your email. Members and staff: use your email or membership number.
        </p>
        <label className="block text-sm">
          Email or membership no.
          <input
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            autoComplete="username"
            placeholder="name@example.com or AC-0001"
            disabled={busy}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={busy}
          />
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-sm text-muted-foreground">
          New applicant? <Link to="/register" className="text-primary underline">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
