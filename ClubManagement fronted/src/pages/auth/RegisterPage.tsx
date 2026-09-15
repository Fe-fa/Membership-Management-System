import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { persistSession, type AuthResponse } from "@/lib/auth";
import { TENANT_CODE } from "@/config/env";
import { saveApplicantPath } from "@/services/membership/applicantPath";
import { API_BASE, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

type Category = "STANDARD" | "CHILD_OF_MEMBER";

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

type ParentEligibility = {
  found: boolean;
  nameMatches: boolean;
  canContinue: boolean;
  entranceFeeWaived: boolean;
  parentAccountId?: number | null;
  parentProfileId?: number | null;
  parentMembershipNo?: string | null;
  parentName?: string | null;
  parentStatus?: string | null;
  parentContinuousYears: number;
  parentEmail?: string | null;
  parentPhone?: string | null;
  yearOfJoining?: number | null;
  recordedDateOfBirth?: string | null;
  applicantAgeYears?: number | null;
  message: string;
};

const inputClass = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2";

export function RegisterPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category>("STANDARD");
  const [step, setStep] = useState<"lookup" | "account">("lookup");
  const [lookup, setLookup] = useState({ guestName: "", phone: "", visitSlipCode: "" });
  const [child, setChild] = useState({
    fullName: "",
    email: "",
    phone: "",
    parentMembershipNo: "",
    parentFullName: "",
  });
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [parent, setParent] = useState<ParentEligibility | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    password: "",
    idPassportNo: "",
  });
  const [busy, setBusy] = useState(false);

  function chooseCategory(next: Category) {
    setCategory(next);
    setStep("lookup");
    setEligibility(null);
    setParent(null);
  }

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

  async function verifyParent(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/guests/parent-eligibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Code": TENANT_CODE },
        body: JSON.stringify({
          applicantFullName: child.fullName.trim(),
          email: child.email.trim() || null,
          phone: child.phone.trim() || null,
          parentMembershipNo: child.parentMembershipNo.trim(),
          parentFullName: child.parentFullName.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ParentEligibility & { message?: string };
      if (!res.ok) throw new Error(data.message || "Could not verify the parent membership.");
      setParent(data);
      if (!data.canContinue) return;

      const parts = child.fullName.trim().split(/\s+/);
      setForm((current) => ({
        ...current,
        firstName: current.firstName || parts[0] || "",
        lastName: current.lastName || parts.slice(1).join(" ") || "",
        email: current.email || child.email.trim(),
        mobile: current.mobile || child.phone.trim(),
      }));
      saveApplicantPath({
        category: "CHILD_OF_MEMBER",
        parentAccountId: data.parentAccountId,
        parentProfileId: data.parentProfileId,
        parentMembershipNo: data.parentMembershipNo,
        parentName: data.parentName,
        parentContinuousYears: data.parentContinuousYears,
        entranceFeeWaiverEligible: data.entranceFeeWaived,
        parentEmail: data.parentEmail,
        parentPhone: data.parentPhone,
        yearOfJoining: data.yearOfJoining,
        dateOfBirth: data.recordedDateOfBirth?.slice(0, 10) || null,
      });
      setStep("account");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (category === "STANDARD" && !eligibility?.guestId) return;
    if (category === "CHILD_OF_MEMBER" && !parent?.canContinue) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Code": TENANT_CODE },
        body: JSON.stringify({
          ...form,
          guestId: category === "STANDARD" ? eligibility?.guestId : null,
          visitSlipCode: eligibility?.visitSlipCode ?? (lookup.visitSlipCode.trim() || null),
          applicationCategory: category,
          parentAccountId: parent?.parentAccountId ?? null,
          parentMembershipNo: parent?.parentMembershipNo ?? null,
          parentFullName: child.parentFullName.trim() || parent?.parentName || null,
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
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div>
          <h1 className="text-2xl">Sign up</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome back!
          </p>
        </div>

        {step === "lookup" ? (
          <>
<div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Application category">
  <CategoryButton
    active={category === "STANDARD"}
    title="Standard applicant"
    onClick={() => chooseCategory("STANDARD")}
  />
  <CategoryButton
    active={category === "CHILD_OF_MEMBER"}
    title="Member's child"
    onClick={() => chooseCategory("CHILD_OF_MEMBER")}
  />
</div>

            {category === "STANDARD" ? (
              <form onSubmit={checkVisits} className="space-y-4">
                <label className="block text-sm">
                 Full name 
                  <input
                    className={inputClass}
                    value={lookup.guestName}
                    onChange={(e) => setLookup({ ...lookup, guestName: e.target.value })}
                    placeholder="as on your visit record"
                  />
                </label>
                <label className="block text-sm">
                  Phone
                  <input
                    type="tel"
                    className={inputClass}
                    value={lookup.phone}
                    onChange={(e) => setLookup({ ...lookup, phone: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Application no
                  <input
                    className={inputClass}
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
              <form onSubmit={verifyParent} className="space-y-4">
                <label className="block text-sm">
                  Full name
                  <input
                    required
                    className={inputClass}
                    value={child.fullName}
                    onChange={(e) => setChild({ ...child, fullName: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Email address
                  <input
                    type="email"
                    className={inputClass}
                    value={child.email}
                    onChange={(e) => setChild({ ...child, email: e.target.value })}
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm">
                  Phone
                  <input
                    type="tel"
                    className={inputClass}
                    value={child.phone}
                    onChange={(e) => setChild({ ...child, phone: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Parent's membership number
                  <input
                    required
                    className={inputClass}
                    value={child.parentMembershipNo}
                    onChange={(e) => setChild({ ...child, parentMembershipNo: e.target.value })}
                    placeholder="e.g. AC-0001"
                  />
                </label>
                <label className="block text-sm">
                  Parent's full name
                  <input
                    required
                    className={inputClass}
                    value={child.parentFullName}
                    onChange={(e) => setChild({ ...child, parentFullName: e.target.value })}
                    placeholder="Must match the membership record"
                  />
                </label>
                {parent && !parent.canContinue ? (
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{parent.message}</p>
                ) : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Verifying…" : "Verify & continue"}
                </Button>
              </form>
            )}
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {category === "CHILD_OF_MEMBER" ? parent?.message : eligibility?.message}
            </p>
            <label className="block text-sm">
              ID / Passport number
              <input
                required
                className={inputClass}
                value={form.idPassportNo}
                onChange={(e) => setForm({ ...form, idPassportNo: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              First name
              <input
                required
                className={inputClass}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Last name
              <input
                required
                className={inputClass}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Email
              <input
                required
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
            </label>
            <label className="block text-sm">
              Mobile
              <input
                type="tel"
                className={inputClass}
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
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </Button>
            <button
              type="button"
              className="text-sm text-primary underline"
              onClick={() => setStep("lookup")}
            >
              {category === "CHILD_OF_MEMBER" ? "Verify a different parent" : "Check a different guest record"}
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

function CategoryButton({
  active,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted/40",
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-1 block text-xs">{detail}</span>
    </button>
  );
}
