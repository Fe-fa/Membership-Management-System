import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { persistSession, type AuthResponse } from "@/lib/auth";
import { API_BASE, extractErrorMessage } from "@/services/membership/api";

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    password: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
  });
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Registration failed" }))).message);
      const data = (await res.json()) as AuthResponse;
      persistSession(data);
      toast.success("Account created. Continue your application.");
      await navigate({ to: "/application" });
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    { key: "firstName" as const, label: "First name", type: "text", required: true },
    { key: "lastName" as const, label: "Last name", type: "text", required: true },
    { key: "email" as const, label: "Email", type: "email", required: true },
    { key: "mobile" as const, label: "Mobile", type: "tel", required: false },
    { key: "password" as const, label: "Password", type: "password", required: true },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl">Applicant registration</h1>
        <p className="text-sm text-muted-foreground">
          Register with your email and password. Staff and members are created by an administrator
          and sign in with email or membership number.
        </p>
        {fields.map((field) => (
          <label key={field.key} className="block text-sm">
            {field.label}
            <input
              type={field.type}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              value={form[field.key]}
              onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              required={field.required}
              autoComplete={field.key === "password" ? "new-password" : field.key === "email" ? "email" : "on"}
              minLength={field.key === "password" ? 8 : undefined}
            />
          </label>
        ))}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Already registered? <Link to="/" className="text-primary underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
