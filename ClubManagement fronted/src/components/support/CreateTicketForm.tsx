import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/services/membership/api";
import {
  attachSupportTicket,
  createSupportTicket,
  listSupportCategories,
  type SupportCategory,
} from "@/services/support";

export function CreateTicketForm({
  initialCategory,
  initialSubject,
  onCancel,
  onCreated,
}: {
  initialCategory?: string;
  initialSubject?: string;
  onCancel: () => void;
  onCreated?: (ticketId: number) => void;
}) {
  const navigate = useNavigate();
  const categories = useQuery({
    queryKey: ["support-categories"],
    queryFn: listSupportCategories,
  });
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [category, setCategory] = useState(initialCategory ?? "");
  const [priority, setPriority] = useState("NORMAL");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const selected = useMemo(
    () => (categories.data ?? []).find((row) => row.roleCode === category) ?? null,
    [categories.data, category],
  );

  const create = useMutation({
    mutationFn: async () => {
      if (!subject.trim()) throw new Error("Subject is required.");
      if (!category) throw new Error("Select a category.");
      const ticket = await createSupportTicket({
        subject: subject.trim(),
        description: description.trim() || undefined,
        categoryRoleCode: category,
        priority,
      });
      if (file) {
        return attachSupportTicket(ticket.ticketId, file);
      }
      return ticket;
    },
    onSuccess: (ticket) => {
      toast.success(`Ticket #${ticket.ticketNo} created.`);
      if (onCreated) onCreated(ticket.ticketId);
      else void navigate({ to: "/support/tickets" });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  return (
    <form
      className="mx-auto max-w-3xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <Field label="Subject">
        <Input required value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Category">
        <select
          required
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Select a category</option>
          {(categories.data ?? []).map((row: SupportCategory) => (
            <option key={row.roleCode} value={row.roleCode}>
              {row.roleName}
            </option>
          ))}
        </select>
        {selected ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            {selected.contacts.length === 0 ? (
              <p className="text-muted-foreground">No one currently holds this role. The ticket will still be queued for the role.</p>
            ) : (
              <ul className="space-y-1">
                {selected.contacts.map((contact) => (
                  <li key={contact.email}>
                    <span className="font-medium">{contact.name || selected.roleName}</span>
                    {" · "}
                    <a className="text-primary underline-offset-2 hover:underline" href={`mailto:${contact.email}`}>
                      {contact.email}
                    </a>
                    {contact.companyName ? (
                      <span className="text-muted-foreground"> · {contact.companyName}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Field>
      <Field label="Priority">
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="LOW">Low</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
      </Field>
      <Field label="Description">
        <Textarea
          className="min-h-[140px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Attachment (optional PDF, PNG, JPG, DOC)">
        <Input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={create.isPending}>
          Submit ticket
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
