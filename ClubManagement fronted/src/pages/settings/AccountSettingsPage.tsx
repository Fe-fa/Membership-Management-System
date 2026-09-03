import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { persistUser, readUser, type AuthUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

export function AccountSettingsPage() {
  const user = readUser();
  const parts = (user?.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(parts[0] ?? "");
  const [lastName, setLastName] = useState(parts.slice(1).join(" "));
  const [email, setEmail] = useState(user?.email ?? "");
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const save = useMutation({
    mutationFn: () =>
      apiRequest<AuthUser>("/api/auth/me", {
        method: "PUT",
        body: JSON.stringify({ firstName, lastName, email, photoUrl: photoUrl.trim() || null }),
      }),
    onSuccess: (next) => {
      persistUser({ ...user!, ...next, fullName: next.fullName, email: next.email, photoUrl: next.photoUrl });
      toast.success("Account details saved.");
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const password = useMutation({
    mutationFn: () =>
      apiRequest("/api/auth/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => {
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  return (
    <PageFrame width="sm">
      <PageHeader
        title="Account & Profile"
        description="View or update your account email, display name, profile photo, and password."
      />
      <form
        className="space-y-3 rounded-xl border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className="size-16 rounded-full object-cover" />
        ) : null}
        <label className="grid gap-1 text-sm">
          <Label>First name</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm">
          <Label>Last name</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm">
          <Label>Profile photo URL</Label>
          <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
        </label>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save profile
        </Button>
      </form>

      <form
        className="space-y-3 rounded-xl border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          password.mutate();
        }}
      >
        <p className="text-sm font-medium">Password / security</p>
        <label className="grid gap-1 text-sm">
          <Label>Current password</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm">
          <Label>New password</Label>
          <Input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </label>
        <Button type="submit" disabled={password.isPending || newPassword.length < 8}>
          {password.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Update password
        </Button>
      </form>
    </PageFrame>
  );
}
