import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MembershipTypeRow } from "@/services/admin/membershipDesk";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

export function MembershipTypeFormPage({ typeId }: { typeId?: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(typeId);
  const [form, setForm] = useState({ code: "", name: "", description: "" });

  const existing = useQuery({
    queryKey: ["membership-types", typeId],
    enabled: isEdit,
    queryFn: async () => {
      const rows = await apiRequest<MembershipTypeRow[]>("/api/membership-types");
      const row = rows.find((item) => item.membershipTypeId === typeId);
      if (!row) throw new Error("Membership type was not found.");
      return row;
    },
  });

  useEffect(() => {
    if (!existing.data) return;
    setForm({
      code: existing.data.code,
      name: existing.data.name,
      description: existing.data.description ?? "",
    });
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
      });
      if (isEdit && typeId) {
        return apiRequest<MembershipTypeRow>(`/api/membership-types/${typeId}`, {
          method: "PUT",
          body,
        });
      }
      return apiRequest<MembershipTypeRow>("/api/membership-types/create", {
        method: "POST",
        body,
      });
    },
    onSuccess: (created) => {
      toast.success(
        isEdit ? `${created.name} updated.` : `${created.name} added. Assign privileges under View and Manage.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["membership-types"] });
      void navigate({ to: "/existing-members", search: { tab: "privileges" } });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  if (isEdit && existing.isLoading) {
    return (
      <PageFrame width="sm">
        <PageHeader title="Edit membership type" />
        <PageBodyLoading label="Loading membership type…" />
      </PageFrame>
    );
  }

  if (isEdit && existing.isError) {
    return (
      <PageFrame width="sm">
        <PageHeader title="Edit membership type" description={extractErrorMessage(existing.error)} />
        <Button type="button" variant="outline" onClick={() => void navigate({ to: "/existing-members", search: { tab: "privileges" } })}>
          Back to View and Manage
        </Button>
      </PageFrame>
    );
  }

  return (
    <PageFrame width="sm">
      <PageHeader
        title={isEdit ? "Edit membership type" : "Add New membership type"}
        description={
          isEdit
            ? "Update the class code, name, and description."
            : "Create another membership class, then assign privileges under View and Manage."
        }
      />
      <form
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="grid gap-1.5 text-sm">
          Membership type code
          <Input
            className="uppercase"
            value={form.code}
            required
            maxLength={40}
            placeholder="e.g. ASSOCIATE"
            onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Membership name
          <Input
            value={form.name}
            required
            maxLength={120}
            placeholder="e.g. Associate"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Description
          <Textarea
            value={form.description}
            maxLength={500}
            rows={4}
            placeholder="Optional"
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigate({ to: "/existing-members", search: { tab: "privileges" } })}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {isEdit ? "Save changes" : "Save type"}
          </Button>
        </div>
      </form>
    </PageFrame>
  );
}
