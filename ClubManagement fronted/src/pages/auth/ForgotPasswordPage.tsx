import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ClubLogo } from "@/components/brand/ClubLogo";
import { Button } from "@/components/ui/button";
import { API_BASE, extractErrorMessage } from "@/services/membership/api";

export function ForgotPasswordPage({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message || "Could not send the reset email.");
      setSentTo(email.trim());
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <ClubLogo className="h-12" />
        <div>
          <h1 className="text-2xl">Forgot password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the email on your account. We will send a link to choose a new password.
          </p>
        </div>
        {sentTo ? (
          <div className="space-y-4">
            <p className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm">
              If an account exists for <strong className="text-foreground">{sentTo}</strong>, a reset link is on its way.
              It expires in 30 minutes.
            </p>
            <p className="text-sm text-muted-foreground">
              <Link to="/" className="text-primary underline">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block text-sm">
              Email
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@example.com"
                disabled={busy}
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/" className="text-primary underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
