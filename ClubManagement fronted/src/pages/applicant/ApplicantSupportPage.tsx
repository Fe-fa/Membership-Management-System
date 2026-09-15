import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bold,
  CreditCard,
  FileText,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageCircle,
  Paperclip,
  Phone,
  Redo2,
  Search,
  Strikethrough,
  Underline,
  Undo2,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readUser } from "@/lib/auth";
import { cn } from "@/utils/cn";

type TicketStatus = "Open" | "Replied" | "Closed";
type Department = "Membership Manager" | "Finance Desk" | "Endorsements";

type TicketMessage = {
  id: string;
  author: string;
  role: "applicant" | "staff";
  body: string;
  at: string;
  attachments?: string[];
};

type Ticket = {
  id: string;
  subject: string;
  status: TicketStatus;
  department: Department;
  updatedAt: string;
  messages: TicketMessage[];
};

const KB_TOPICS = [
  {
    id: "application",
    title: "Application Guidance",
    description: "Pilot licence, document and photo upload help, and how to revise your application.",
    tone: "sky" as const,
    icon: Users,
    action: "Manager chat",
    actionIcon: MessageCircle,
  },
  {
    id: "payment",
    title: "Payment & Finance",
    description: "Large-sum M-Pesa failures, cheque clearance, and bank reference verification.",
    tone: "emerald" as const,
    icon: CreditCard,
    action: "Create ticket",
    actionIcon: ArrowRight,
  },
  {
    id: "endorsement",
    title: "Endorsement Issues",
    description: "Proposer or seconder delays, and quick ways to reach your endorsers.",
    tone: "rose" as const,
    icon: UsersRound,
    action: "Quick-contact options",
    actionIcon: Phone,
  },
];

const SEED_TICKETS: Ticket[] = [
  {
    id: "3070010",
    subject: "M-Pesa code verification",
    status: "Open",
    department: "Finance Desk",
    updatedAt: "Today, 13:33",
    messages: [
      {
        id: "m1",
        author: "You",
        role: "applicant",
        body: "Hi — my M-Pesa payment for the joining fee (Ksh 156,200) did not clear. Please help verify the reference.",
        at: "Today, 13:33",
      },
    ],
  },
  {
    id: "3070013",
    subject: "M-Pesa code verification",
    status: "Replied",
    department: "Membership Manager",
    updatedAt: "28 Jan 2024",
    messages: [
      {
        id: "m2",
        author: "You",
        role: "applicant",
        body: "Hi — asking about M-Pesa payment validation for Ksh 156,200 and bank reference verification.",
        at: "17 Jan 2024",
        attachments: ["Payment proof.pdf", "Bank reference.png"],
      },
      {
        id: "m3",
        author: "Membership Manager",
        role: "staff",
        body: "Thank you for your verification details. Finance will confirm the reference and update your application status.",
        at: "28 Jan 2024",
        attachments: ["Acknowledgement.pdf"],
      },
    ],
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

function statusClass(status: TicketStatus) {
  if (status === "Open") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "Replied") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-border bg-muted text-muted-foreground";
}

function storageKey(userId?: number) {
  return `acea-applicant-support-tickets:${userId ?? "guest"}`;
}

function loadTickets(userId?: number): Ticket[] {
  if (typeof window === "undefined") return SEED_TICKETS;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return SEED_TICKETS;
    const parsed = JSON.parse(raw) as Ticket[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_TICKETS;
  } catch {
    return SEED_TICKETS;
  }
}

function saveTickets(userId: number | undefined, tickets: Ticket[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(tickets));
}

export function ApplicantSupportPage() {
  const user = readUser();
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>(() => loadTickets(user?.userAccountId));
  const [selectedId, setSelectedId] = useState<string | null>(tickets[0]?.id ?? null);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [reply, setReply] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newDept, setNewDept] = useState<Department>("Membership Manager");

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return KB_TOPICS;
    return KB_TOPICS.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [query]);

  const visibleTickets = useMemo(() => {
    if (filter === "all") return tickets;
    return tickets.filter((t) => t.status !== "Closed");
  }, [tickets, filter]);

  const history = useMemo(
    () =>
      [...tickets]
        .sort((a, b) => b.id.localeCompare(a.id))
        .map((t) => ({
          id: t.id,
          updatedAt: t.updatedAt,
          department: t.department,
        })),
    [tickets],
  );

  function persist(next: Ticket[]) {
    setTickets(next);
    saveTickets(user?.userAccountId, next);
  }

  function openCategory(id: string) {
    if (id === "application") {
      setNewDept("Membership Manager");
      setNewSubject("Application guidance");
      setCreateOpen(true);
      return;
    }
    if (id === "payment") {
      setNewDept("Finance Desk");
      setNewSubject("Payment verification");
      setCreateOpen(true);
      return;
    }
    setNewDept("Endorsements");
    setNewSubject("Endorsement follow-up");
    setCreateOpen(true);
  }

  function createTicket() {
    if (!newSubject.trim() || !newBody.trim()) {
      toast.error("Subject and message are required.");
      return;
    }
    const id = String(3070000 + tickets.length + Math.floor(Math.random() * 80));
    const ticket: Ticket = {
      id,
      subject: newSubject.trim(),
      status: "Open",
      department: newDept,
      updatedAt: "Just now",
      messages: [
        {
          id: `m-${Date.now()}`,
          author: user?.fullName || "You",
          role: "applicant",
          body: newBody.trim(),
          at: "Just now",
        },
      ],
    };
    const next = [ticket, ...tickets];
    persist(next);
    setSelectedId(id);
    setCreateOpen(false);
    setNewSubject("");
    setNewBody("");
    toast.success("Support ticket created.");
  }

  function sendReply() {
    if (!selected) return;
    if (!reply.trim()) {
      toast.error("Type a reply first.");
      return;
    }
    const next = tickets.map((t) => {
      if (t.id !== selected.id) return t;
      return {
        ...t,
        status: "Open" as TicketStatus,
        updatedAt: "Just now",
        messages: [
          ...t.messages,
          {
            id: `m-${Date.now()}`,
            author: user?.fullName || "You",
            role: "applicant" as const,
            body: reply.trim(),
            at: "Just now",
          },
        ],
      };
    });
    persist(next);
    setReply("");
    toast.success("Reply sent.");
  }

  return (
    <PageFrame width="lg">
      <PageHeader
        title=""
        description="Search guidance, open a ticket with Membership or Finance, and follow replies in one place."
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
            <div
              key={topic.id}
              className={cn("flex flex-col gap-3 rounded-xl border p-4", TONE[topic.tone])}
            >
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
                onClick={() => openCategory(topic.id)}
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

          {visibleTickets.length === 0 ? (
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
                    const open = selectedId === ticket.id;
                    return (
                      <tr key={ticket.id} className="border-t border-border align-top">
                        <td className="px-4 py-3 font-medium tabular-nums">{ticket.id}</td>
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            className="text-left font-medium hover:underline"
                            onClick={() => setSelectedId(ticket.id)}
                          >
                            {ticket.subject}
                          </button>
                          {open ? (
                            <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                              {ticket.messages.map((msg) => (
                                <div key={msg.id} className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">{msg.author}</span>
                                    {msg.role === "staff" ? (
                                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                                        Replied
                                      </span>
                                    ) : null}
                                    <span>{msg.at}</span>
                                  </div>
                                  <p className="text-sm leading-relaxed">{msg.body}</p>
                                  {msg.attachments?.length ? (
                                    <div className="flex flex-wrap gap-2">
                                      {msg.attachments.map((file) => (
                                        <span
                                          key={file}
                                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                                        >
                                          <FileText className="size-3" />
                                          {file}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
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
                            {ticket.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{ticket.updatedAt}</td>
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
                  {history.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-4 py-2.5 tabular-nums">
                        <button
                          type="button"
                          className="font-medium hover:underline"
                          onClick={() => setSelectedId(row.id)}
                        >
                          {row.id}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">{row.updatedAt}</td>
                      <td className="px-4 py-2.5">{row.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">
              Reply{selected ? ` · #${selected.id}` : ""}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected
                ? `Responding on “${selected.subject}” to ${selected.department}.`
                : "Select a ticket to reply."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1.5 text-muted-foreground">
              {[Bold, Italic, Underline, Strikethrough, Link2, Paperclip, List, ListOrdered, Undo2, Redo2].map(
                (Icon, i) => (
                  <button
                    key={i}
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-md hover:bg-background hover:text-foreground"
                    title="Formatting (visual)"
                  >
                    <Icon className="size-3.5" />
                  </button>
                ),
              )}
            </div>
            <Textarea
              className="mt-2 min-h-[120px] rounded-xl"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your reply here…"
              disabled={!selected}
            />
            <div className="mt-3 flex justify-end">
              <Button type="button" disabled={!selected} onClick={sendReply}>
                Send
              </Button>
            </div>
          </section>
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg">
            <h3 className="text-base font-semibold">Create support ticket</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Membership or Finance will reply on this thread.
            </p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Department</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value as Department)}
                >
                  <option value="Membership Manager">Membership Manager</option>
                  <option value="Finance Desk">Finance Desk</option>
                  <option value="Endorsements">Endorsements</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Subject</span>
                <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Message</span>
                <Textarea
                  rows={4}
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Describe the issue…"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={createTicket}>
                Submit ticket
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageFrame>
  );
}
