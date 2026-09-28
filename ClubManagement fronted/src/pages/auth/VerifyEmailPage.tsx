import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ClubLogo } from "@/components/brand/ClubLogo";
import { Button } from "@/components/ui/button";
import { TENANT_CODE } from "@/config/env";
import { persistSession, type AuthResponse } from "@/lib/auth";
import { API_BASE, extractErrorMessage } from "@/services/membership/api";

const CODE_KEY = "acea-verify-code";

export function VerifyEmailPage({ email }: { email: string }) {
  const navigate = useNavigate();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [preview, setPreview] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem(CODE_KEY);
    if (stored) {
      setPreview(stored);
      sessionStorage.removeItem(CODE_KEY);
    }
  }, []);

  async function verify(code: string) {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Code": TENANT_CODE },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Verification failed.");
      persistSession(data as AuthResponse);
      toast.success("Email verified. Continue your application.");
      await navigate({ to: "/application" });
    } catch (err) {
      toast.error(extractErrorMessage(err));
      setBusy(false);
    }
  }

  function onChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);
    if (value && index < 5) inputs.current[index + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }

  function onPaste(event: React.ClipboardEvent) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    pasted.split("").forEach((char, index) => {
      next[index] = char;
    });
    setDigits(next);
    if (pasted.length === 6) void verify(pasted);
  }

  async function resend() {
    setResending(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Code": TENANT_CODE },
        body: JSON.stringify({ email, code: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not resend the code.");
      if (data.debugCode) setPreview(String(data.debugCode));
      setDigits(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
      toast.success("Verification code sent.");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <ClubLogo className="h-12" />
        <div>
          <h1 className="text-2xl">Verify your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 6-digit code sent to <strong className="text-foreground">{email}</strong>.
          </p>
        </div>
        {preview ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Email could not be sent from this server. Use this code: <strong>{preview}</strong>
          </p>
        ) : null}
        <div className="flex justify-between gap-2" onPaste={onPaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputs.current[index] = el;
              }}
              inputMode="numeric"
              maxLength={1}
              value={digit}
              autoFocus={index === 0}
              disabled={busy}
              onChange={(e) => onChange(index, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
              }}
              className="h-14 w-12 rounded-md border border-input bg-background text-center text-2xl font-semibold"
            />
          ))}
        </div>
        <Button type="button" className="w-full" disabled={busy || digits.some((digit) => !digit)} onClick={() => verify(digits.join(""))}>
          {busy ? "Verifying…" : "Verify email"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t receive the code?{" "}
          <button type="button" className="font-medium text-primary underline" disabled={resending} onClick={resend}>
            {resending ? "Sending…" : "Resend code"}
          </button>
        </p>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/" className="text-primary underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
