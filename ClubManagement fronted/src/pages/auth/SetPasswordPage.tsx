import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE, extractErrorMessage } from "@/services/membership/api";

const routeApi = getRouteApi("/set-password");

export function SetPasswordPage() {
  const { token } = routeApi.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({ message: "Could not save password." }));
      if (!res.ok) throw new Error(body.message);
      toast.success("Password saved. Sign in with your username.");
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <h1 className="text-2xl">Choose your password</h1>
        <p className="text-sm text-muted-foreground">
          This verifies the email address used when an administrator created your account.
        </p>
        {!token ? (
          <p className="text-sm text-destructive">This link is missing a token. Request a new invite.</p>
        ) : null}
        <label className="grid gap-1 text-sm">
          New password
          <Input
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Confirm password
          <Input
            type="password"
            minLength={8}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <Button type="submit" className="w-full" disabled={busy || !token}>
          {busy ? "Saving…" : "Save password"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Already verified?{" "}
          <Link to="/" className="text-primary underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
