import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CreditCard,
  MessageCircle,
  Phone,
  Search,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { CreateTicketForm } from "@/components/support/CreateTicketForm";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/services/membership/api";
import {
  getSupportTicket,
  listSupportTickets,
  replySupportTicket,
  statusClass,
  statusLabel,
} from "@/services/support";
import { cn } from "@/utils/cn";

const KB_TOPICS = [
  {
    id: "application",
    title: "Application Guidance",
    description: "Pilot licence, document and photo upload help, and how to revise your application.",
    tone: "sky" as const,
    icon: Users,
    action: "Manager chat",
    actionIcon: MessageCircle,
    category: "GENERAL_MANAGER",
    subject: "Application guidance",
  },
  {
    id: "payment",
    title: "Payment & Finance",
    description: "Large-sum M-Pesa failures, cheque clearance, and bank reference verification.",
    tone: "emerald" as const,
    icon: CreditCard,
    action: "Create ticket",
    actionIcon: ArrowRight,
    category: "TREASURER",
    subject: "Payment verification",
  },
  {
    id: "endorsement",
    title: "Endorsement Issues",
    description: "Proposer or seconder delays, and quick ways to reach your endorsers.",
    tone: "rose" as const,
    icon: UsersRound,
    action: "Quick-contact options",
    actionIcon: Phone,
    category: "CHAIRMAN",
    subject: "Endorsement follow-up",
  },
];

const TONE: Record<(typeof KB_TOPICS)[number]["tone"], string> = {
  sky: "border-sky-200 bg-sky-50/80",
  emerald: "border-emerald-200 bg-emerald-50/80",
  rose: "border-rose-200 bg-rose-50/80",
};

const BTN_TONE: Record<(typeof KB_TOPICS)[number]["tone"], string> = {
  sky: "bg-primary text-primary-foreground hover:bg-primary/90",
  emerald: "border-emerald-600 text-emerald-800 hover:bg-emerald-100",
  rose: "border-rose-500 text-rose-800 hover:bg-rose-100",
};

export function ApplicantSupportPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [reply, setReply] = useState("");
  const [create, setCreate] = useState<{ category?: string; subject?: string } | null>(null);

  const tickets = useQuery({
    queryKey: ["support-tickets", "mine"],
    queryFn: () => listSupportTickets({ scope: "mine" }),
  });

  const detail = useQuery({
    queryKey: ["support-ticket", selectedId],
    queryFn: () => getSupportTicket(selectedId!),
    enabled: selectedId != null,
  });

  const replyMut = useMutation({
    mutationFn: () => replySupportTicket(selectedId!, reply),
    onSuccess: () => {
      setReply("");
      toast.success("Reply sent.");
      void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["support-ticket", selectedId] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return KB_TOPICS;
    return KB_TOPICS.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [query]);

  const rows = tickets.data ?? [];
  const visibleTickets = filter === "all" ? rows : rows.filter((t) => t.status !== "CLOSED");

  return (
    <PageFrame width="lg">
      <PageHeader
        title=""
        description="Search guidance, open a ticket to an office role, and follow replies in one place."
      />

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 rounded-xl pl-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search knowledge base (e.g. "Pilot licence scan guidelines" or "M-Pesa payment validation")'
        />
      </label>

      <section className="grid gap-3 md:grid-cols-3">
        {filteredTopics.map((topic) => {
          const Icon = topic.icon;
          const ActionIcon = topic.actionIcon;
          return (
            <div key={topic.id} className={cn("flex flex-col gap-3 rounded-xl border p-4", TONE[topic.tone])}>
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/80 text-foreground shadow-sm">
                <Icon className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{topic.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{topic.description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={topic.tone === "sky" ? "default" : "outline"}
                className={cn("mt-auto w-fit gap-1.5", topic.tone !== "sky" && BTN_TONE[topic.tone])}
                onClick={() => setCreate({ category: topic.category, subject: topic.subject })}
              >
                <ActionIcon className="size-3.5" />
                {topic.action}
              </Button>
            </div>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Active tickets</h3>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={filter}
              onChange={(e) => setFilter(e.target.value as "active" | "all")}
            >
              <option value="active">Active tickets</option>
              <option value="all">All tickets</option>
            </select>
          </div>

          {tickets.isLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">Loading tickets…</p>
          ) : visibleTickets.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">No tickets yet. Create one from a help category above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">ID</th>
                    <th className="px-2 py-2 font-medium">Subject</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTickets.map((ticket) => {
                    const open = selectedId === ticket.ticketId;
                    const thread = open ? detail.data : null;
                    return (
                      <tr key={ticket.ticketId} className="border-t border-border align-top">
                        <td className="px-4 py-3 font-medium tabular-nums">{ticket.ticketNo}</td>
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            className="text-left font-medium hover:underline"
                            onClick={() => setSelectedId(ticket.ticketId)}
                          >
                            {ticket.subject}
                          </button>
                          {thread ? (
                            <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                              {thread.messages.map((msg) => (
                                <div key={msg.messageId} className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">{msg.authorName}</span>
                                    {msg.isStaff ? (
                                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                                        Replied
                                      </span>
                                    ) : null}
                                    <span>{new Date(msg.createdAt).toLocaleString("en-KE")}</span>
                                  </div>
                                  <p className="text-sm leading-relaxed">{msg.body}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              statusClass(ticket.status),
                            )}
                          >
                            {statusLabel(ticket.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(ticket.updatedAt ?? ticket.createdAt).toLocaleString("en-KE")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Ticket history</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">ID</th>
                    <th className="px-2 py-2 font-medium">Updated</th>
                    <th className="px-4 py-2 font-medium">Department</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.ticketId} className="border-t border-border">
                      <td className="px-4 py-2.5 tabular-nums">
                        <button
                          type="button"
                          className="font-medium hover:underline"
                          onClick={() => setSelectedId(row.ticketId)}
                        >
                          {row.ticketNo}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">
                        {new Date(row.updatedAt ?? row.createdAt).toLocaleDateString("en-KE")}
                      </td>
                      <td className="px-4 py-2.5">{row.categoryRoleName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">
              Reply{detail.data ? ` · #${detail.data.ticketNo}` : ""}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {detail.data
                ? `Responding on “${detail.data.subject}” to ${detail.data.categoryRoleName}${
                    detail.data.categoryEmail ? ` (${detail.data.categoryEmail})` : ""
                  }.`
                : "Select a ticket to reply."}
            </p>
            <Textarea
              className="mt-3 min-h-[120px] rounded-xl"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your reply here…"
              disabled={!detail.data}
            />
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                disabled={!detail.data || !reply.trim() || replyMut.isPending}
                onClick={() => replyMut.mutate()}
              >
                Send
              </Button>
            </div>
          </section>
        </div>
      </div>

      {create ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-lg">
            <h3 className="text-base font-semibold">Create New Support Ticket</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Category is an office role. The selected role’s email is shown, and they see this ticket on their
              support dashboard.
            </p>
            <div className="mt-4">
              <CreateTicketForm
                initialCategory={create.category}
                initialSubject={create.subject}
                onCancel={() => setCreate(null)}
                onCreated={(ticketId) => {
                  setCreate(null);
                  setSelectedId(ticketId);
                  void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </PageFrame>
  );
}
