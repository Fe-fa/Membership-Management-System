import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";
import { kenyaTodayISO } from "@/utils/kenyaDate";

import { VISIT_PURPOSES, type ReceptionHost, type ReceptionVisitRow } from "./types";

type Props = {
  onRegistered: (visit: ReceptionVisitRow) => void;
  requestedHost?: ReceptionHost | null;
};

export function RegisterGuestCard({ onRegistered, requestedHost }: Props) {
  const [hostQuery, setHostQuery] = useState("");
  const [debouncedHost, setDebouncedHost] = useState("");
  const [host, setHost] = useState<ReceptionHost | null>(null);
  const [openHosts, setOpenHosts] = useState(false);
  const [guest, setGuest] = useState({
    firstName: "",
    surname: "",
    email: "",
    visitDate: kenyaTodayISO(),
    purpose: "",
    status: "On site",
    signatureName: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedHost(hostQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [hostQuery]);

  useEffect(() => {
    if (!requestedHost) return;
    setHost(requestedHost);
    setHostQuery(requestedHost.membershipNo ? `${requestedHost.fullName} (${requestedHost.membershipNo})` : requestedHost.fullName);
    setOpenHosts(false);
  }, [requestedHost]);

  const hosts = useQuery({
    queryKey: ["reception-hosts", debouncedHost],
    queryFn: () => apiRequest<ReceptionHost[]>(`/api/reception/members?search=${encodeURIComponent(debouncedHost)}`),
    enabled: !host && debouncedHost.length >= 2,
  });

  const register = useMutation({
    mutationFn: () =>
      apiRequest<ReceptionVisitRow>("/api/reception/register", {
        method: "POST",
        body: JSON.stringify({
          firstName: guest.firstName.trim(),
          surname: guest.surname.trim(),
          email: guest.email.trim() || null,
          hostProfileId: host?.profileId,
          visitDate: guest.visitDate,
          purpose: guest.purpose || null,
          signature: `typed:${guest.signatureName.trim()}`,
          status: guest.status,
        }),
      }),
    onSuccess: (visit) => {
      setSuccess(`${visit.guestName} signed in.`);
      setGuest({
        firstName: "",
        surname: "",
        email: "",
        visitDate: kenyaTodayISO(),
        purpose: "",
        status: "On site",
        signatureName: "",
      });
      setErrors({});
      onRegistered(visit);
    },
  });

  function validate() {
    const next: Record<string, string> = {};
    if (!host) next.host = "Select the host member.";
    if (!guest.firstName.trim()) next.firstName = "Required.";
    if (!guest.surname.trim()) next.surname = "Required.";
    if (guest.email.trim() && !guest.email.includes("@")) next.email = "Enter a valid email.";
    if (!guest.visitDate) next.visitDate = "Required.";
    if (!guest.signatureName.trim()) next.signature = "Type the guest's name.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <section id="reception-register" className="flex h-full flex-col rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Guest entry</h2>
      </div>

      <form
        className="flex flex-1 flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSuccess(null);
          if (!validate()) return;
          register.mutate();
        }}
      >
        <div className="space-y-2">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground"><h3>Host member</h3></span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={hostQuery}
                onChange={(event) => {
                  setHostQuery(event.target.value);
                  setHost(null);
                  setOpenHosts(true);
                  setSuccess(null);
                }}
                onFocus={() => setOpenHosts(true)}
                placeholder="Search host by name, number, email, or phone"
                aria-invalid={Boolean(errors.host)}
              />
            </span>
            {errors.host ? <span className="text-xs text-destructive">{errors.host}</span> : null}
          </label>

          {openHosts && !host && debouncedHost.length >= 2 ? (
            <div className="max-h-44 overflow-y-auto rounded-md border border-border" role="listbox">
              {hosts.isFetching ? (
                <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </p>
              ) : (hosts.data ?? []).length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">No existing member. A new member is not created here.</p>
              ) : (
                hosts.data?.map((row) => (
                  <button
                    key={row.profileId}
                    type="button"
                    className="block w-full border-t border-border px-3 py-2 text-left text-sm first:border-t-0 hover:bg-muted/40"
                    onClick={() => {
                      setHost(row);
                      setHostQuery(`${row.fullName} (${row.membershipNo})`);
                      setOpenHosts(false);
                    }}
                  >
                    <span className="font-medium">{row.fullName}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.membershipNo} · {row.status ?? "Member"} · {row.email || row.phone || "No contact"}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          {host ? (
            <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{host.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {host.membershipNo || "Membership on file"} · {host.status || "Active"} · {host.email || host.phone || "No contact"}
                  </p>
                </div>
                <button type="button" className="text-xs text-primary underline" onClick={() => { setHost(null); setHostQuery(""); }}>
                  Change
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="col-span-2 text-xs font-medium text-muted-foreground"><h3>Guest details</h3></legend>
          <Field label="First name" error={errors.firstName}>
            <Input required value={guest.firstName} onChange={(event) => setGuest({ ...guest, firstName: event.target.value })} />
          </Field>
          <Field label="Surname" error={errors.surname}>
            <Input required value={guest.surname} onChange={(event) => setGuest({ ...guest, surname: event.target.value })} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={guest.email} onChange={(event) => setGuest({ ...guest, email: event.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Purpose">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={guest.purpose}
              onChange={(event) => setGuest({ ...guest, purpose: event.target.value })}
            >
              <option value="">Not specified</option>
              {VISIT_PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>{purpose}</option>
              ))}
            </select>
          </Field>
          <Field label="Visit date" error={errors.visitDate}>
            <Input type="date" required value={guest.visitDate} onChange={(event) => setGuest({ ...guest, visitDate: event.target.value })} />
          </Field>
          <Field label="Status">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={guest.status}
              onChange={(event) => setGuest({ ...guest, status: event.target.value })}
            >
              <option>On site</option>
              <option>Signed out</option>
            </select>
          </Field>
        </fieldset>

        <div className="mt-auto space-y-2">
          <Field label="Guest signature (type name)" error={errors.signature}>
            <Input
              value={guest.signatureName}
              onChange={(event) => setGuest({ ...guest, signatureName: event.target.value })}
              placeholder="Type the guest's full name"
              autoComplete="off"
            />
          </Field>
          {register.isError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {extractErrorMessage(register.error)}
            </p>
          ) : null}
          {success ? (
            <p className={cn("rounded-md border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-800")} role="status">
              {success}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? "Registering…" : guest.status === "Signed out" ? "Register visit" : "Register & sign in"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
