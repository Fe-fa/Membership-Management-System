import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { persistSession, type AuthResponse } from "@/lib/auth";
import { TENANT_CODE } from "@/config/env";
import { API_BASE, extractErrorMessage } from "@/services/membership/api";

type Eligibility = {
  found: boolean;
  ambiguous: boolean;
  canRegister: boolean;
  visitCount: number;
  requiredVisits: number;
  guestId?: number | null;
  visitSlipCode?: string | null;
  message: string;
};

export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"lookup" | "account">("lookup");
  const [lookup, setLookup] = useState({ guestName: "", phone: "", visitSlipCode: "" });
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    password: "",
    idPassportNo: "",
  });
  const [busy, setBusy] = useState(false);

  async function checkVisits(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/guests/eligibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Code": TENANT_CODE },
        body: JSON.stringify({
          guestName: lookup.guestName.trim() || null,
          phone: lookup.phone.trim() || null,
          visitSlipCode: lookup.visitSlipCode.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Eligibility & { message?: string };
      if (!res.ok) throw new Error(data.message || "Could not check visits.");
      setEligibility(data);
      if (data.canRegister && data.guestId) {
        const parts = lookup.guestName.trim().split(/\s+/);
        setForm((current) => ({
          ...current,
          firstName: current.firstName || parts[0] || "",
          lastName: current.lastName || parts.slice(1).join(" ") || "",
          mobile: current.mobile || lookup.phone,
        }));
        setStep("account");
      }
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!eligibility?.guestId) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Code": TENANT_CODE },
        body: JSON.stringify({
          ...form,
          guestId: eligibility.guestId,
          visitSlipCode: eligibility.visitSlipCode ?? (lookup.visitSlipCode.trim() || null),
        }),
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl">Applicant registration</h1>
        {step === "lookup" ? (
          <form onSubmit={checkVisits} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the name and phone used when reception logged you as a guest — or the visit slip code on your visit slip. ID / Passport is collected only after three recorded visits.
            </p>
            <label className="block text-sm">
              Guest name
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={lookup.guestName}
                onChange={(e) => setLookup({ ...lookup, guestName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Phone
              <input
                type="tel"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={lookup.phone}
                onChange={(e) => setLookup({ ...lookup, phone: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Visit slip code (recommended)
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={lookup.visitSlipCode}
                onChange={(e) => setLookup({ ...lookup, visitSlipCode: e.target.value })}
                placeholder="Printed by reception"
              />
            </label>
            {eligibility && !eligibility.canRegister ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{eligibility.message}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Checking visits…" : "Check my visits"}
            </Button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">{eligibility?.message}</p>
            <label className="block text-sm">
              ID / Passport number
              <input
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={form.idPassportNo}
                onChange={(e) => setForm({ ...form, idPassportNo: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              First name
              <input
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Last name
              <input
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Email
              <input
                required
                type="email"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
            </label>
            <label className="block text-sm">
              Mobile
              <input
                type="tel"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Password
              <input
                required
                type="password"
                minLength={8}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </Button>
            <button type="button" className="text-sm text-primary underline" onClick={() => setStep("lookup")}>
              Check a different guest record
            </button>
          </form>
        )}
        <p className="text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/" className="text-primary underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
