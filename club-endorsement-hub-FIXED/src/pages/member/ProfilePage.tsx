
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMembershipDate, type MemberProfile } from "@/services/admin/membershipDesk";
import { isClubMember, readUser } from "@/lib/auth";
import { API_BASE, apiRequest, extractErrorMessage } from "@/services/membership/api";
import { useMemberDashboard } from "@/services/member/dashboard";

function mediaUrl(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function ProfilePage() {
  const user = readUser();
  const member = useMemberDashboard();
  if (!isClubMember(user)) {
    return (
      <PageFrame width="sm">
        <PageHeader title="Profile" description="Complete your membership application first. Your full member profile opens after election." />
      </PageFrame>
    );
  }
  return <MemberProfileEditor />;
}

function MemberProfileEditor() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MemberProfile | null>(null);
  const profile = useQuery({
    queryKey: ["members-me-profile"],
    queryFn: () => apiRequest<MemberProfile>("/api/members/me/profile"),
  });

  useEffect(() => {
    if (profile.data) setForm(structuredClone(profile.data));
  }, [profile.data]);

  const save = useMutation({
    mutationFn: (payload: MemberProfile) =>
      apiRequest<MemberProfile>("/api/members/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          identity: payload.identity,
          contact: payload.contact,
          spouses: payload.spouses,
          children: payload.children,
          emergencyContacts: payload.emergencyContacts,
          aviation: payload.aviation,
          membershipTypeId: payload.governance.membershipTypeId,
        }),
      }),
    onSuccess: (data) => {
      toast.success("Profile saved.");
      setForm(data);
      void queryClient.invalidateQueries({ queryKey: ["members-me-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["member-me"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  if (profile.isLoading || !form) {
    return (
      <PageFrame>
        <p className="text-sm text-muted-foreground">Loading your membership card…</p>
      </PageFrame>
    );
  }

  if (profile.isError) {
    return (
      <PageFrame>
        <p className="text-sm text-muted-foreground">{extractErrorMessage(profile.error)}</p>
      </PageFrame>
    );
  }

  const photo = mediaUrl(form.identity.photoUrl);
  const g = form.governance;

  return (
    <PageFrame width="lg">
      <PageHeader
        title="My Profile"
        description={`${form.membershipNo} Â· ${g.membershipTypeName} Â· Elected ${formatMembershipDate(form.joinedDate)}`}
        actions={
          <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Digital membership card</CardTitle>
          <CardDescription>Class, member number and election date are maintained by the Club office.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          {photo ? (
            <img src={photo} alt="" className="h-28 w-28 rounded-lg object-cover" />
          ) : (
            <div className="grid h-28 w-28 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">Photo</div>
          )}
          <div className="grid gap-1 text-sm">
            <p className="text-lg font-semibold">{form.fullName}</p>
            <p>{form.membershipNo}</p>
            <p className="text-muted-foreground">{g.membershipTypeName}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Email" value={form.contact.email ?? ""} onChange={(v) => setForm({ ...form, contact: { ...form.contact, email: v } })} />
          <Field label="Mobile" value={form.contact.mobile ?? ""} onChange={(v) => setForm({ ...form, contact: { ...form.contact, mobile: v } })} />
          <Field label="Postal address" value={form.contact.postalAddress ?? ""} onChange={(v) => setForm({ ...form, contact: { ...form.contact, postalAddress: v } })} />
          <Field label="City" value={form.contact.city ?? ""} onChange={(v) => setForm({ ...form, contact: { ...form.contact, city: v } })} />
          <Field label="Photo URL" value={form.identity.photoUrl ?? ""} onChange={(v) => setForm({ ...form, identity: { ...form.identity, photoUrl: v } })} />
          <Field label="CV / licence copy URL" value={form.aviation.licenses[0]?.copyFileUrl ?? ""} onChange={(v) => {
            const licenses = form.aviation.licenses.length ? [...form.aviation.licenses] : [{ licenseNumber: "" }];
            licenses[0] = { ...licenses[0], copyFileUrl: v };
            setForm({ ...form, aviation: { ...form.aviation, licenses } });
          }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Emergency contact</CardTitle>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, emergencyContacts: [...form.emergencyContacts, { name: "", isPrimary: form.emergencyContacts.length === 0 }] })}>
            <Plus className="size-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.emergencyContacts.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Field label="Name" value={row.name} onChange={(v) => {
                const emergencyContacts = [...form.emergencyContacts];
                emergencyContacts[index] = { ...row, name: v };
                setForm({ ...form, emergencyContacts });
              }} />
              <Field label="Phone" value={row.phone ?? ""} onChange={(v) => {
                const emergencyContacts = [...form.emergencyContacts];
                emergencyContacts[index] = { ...row, phone: v };
                setForm({ ...form, emergencyContacts });
              }} />
              <Field label="Email" value={row.email ?? ""} onChange={(v) => {
                const emergencyContacts = [...form.emergencyContacts];
                emergencyContacts[index] = { ...row, email: v };
                setForm({ ...form, emergencyContacts });
              }} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, emergencyContacts: form.emergencyContacts.filter((_, i) => i !== index) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Spouse & children</CardTitle>
            <CardDescription>Children are prompted to take out their own membership at age 21 (Bye-Laws).</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, spouses: [...form.spouses, { name: "" }] })}>Add spouse</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, children: [...form.children, { name: "", requiresOwnMembership: false }] })}>Add child</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.spouses.map((spouse, index) => (
            <div key={`s-${index}`} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Spouse name" value={spouse.name} onChange={(v) => {
                const spouses = [...form.spouses];
                spouses[index] = { ...spouse, name: v };
                setForm({ ...form, spouses });
              }} />
              <Field label="Phone" value={spouse.phone ?? ""} onChange={(v) => {
                const spouses = [...form.spouses];
                spouses[index] = { ...spouse, phone: v };
                setForm({ ...form, spouses });
              }} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, spouses: form.spouses.filter((_, i) => i !== index) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {form.children.map((child, index) => (
            <div key={`c-${index}`} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Child name" value={child.name} onChange={(v) => {
                const children = [...form.children];
                children[index] = { ...child, name: v };
                setForm({ ...form, children });
              }} />
              <Field label="Date of birth" type="date" value={child.dateOfBirth?.slice(0, 10) ?? ""} onChange={(v) => {
                const children = [...form.children];
                children[index] = { ...child, dateOfBirth: v || null };
                setForm({ ...form, children });
              }} />
              <div className="flex items-end gap-2">
                {child.requiresOwnMembership || (child.ageYears ?? 0) >= 21 ? (
                  <p className="pb-2 text-xs text-amber-700">Own membership required at 21.</p>
                ) : null}
                <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, children: form.children.filter((_, i) => i !== index) })}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageFrame>
  );
}
