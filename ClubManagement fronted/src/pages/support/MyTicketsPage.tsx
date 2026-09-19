import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, CircleDot, Lock, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageFrame } from "@/components/layout/PageFrame";
import { PageDataGate } from "@/components/layout/PageLoading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/services/membership/api";
import {
  changeSupportTicketStatus,
  getSupportTicket,
  listSupportTickets,
  priorityLabel,
  replySupportTicket,
  statusClass,
  statusLabel,
  type SupportTicketListItem,
} from "@/services/support";
import { cn } from "@/utils/cn";
import { isStaff, readUser } from "@/lib/auth";

const FILTERS = [
  { id: "all", label: "All my tickets", status: "all" },
  { id: "open", label: "My open tickets", status: "OPEN" },
  { id: "progress", label: "In progress", status: "IN_PROGRESS" },
  { id: "resolved", label: "Resolved", status: "RESOLVED" },
  { id: "closed", label: "Closed", status: "CLOSED" },
] as const;

export function MyTicketsPage({
  scope = "mine",
}: {
  scope?: "mine" | "inbox";
}) {
  const user = readUser();
  const staff = isStaff(user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const status = FILTERS.find((row) => row.id === filter)?.status ?? "all";

  const list = useQuery({
    queryKey: ["support-tickets", scope, status, search],
    queryFn: () => listSupportTickets({ scope, status, search: search.trim() || undefined }),
  });

  const counts = useQuery({
    queryKey: ["support-tickets", scope, "counts"],
    queryFn: () => listSupportTickets({ scope }),
  });

  const detail = useQuery({
    queryKey: ["support-ticket", selectedId],
    queryFn: () => getSupportTicket(selectedId!),
    enabled: selectedId != null,
  });

  const countFor = (statusCode: string) =>
    statusCode === "all"
      ? counts.data?.length ?? 0
      : (counts.data ?? []).filter((row) => row.status === statusCode).length;

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

  const statusMut = useMutation({
    mutationFn: (next: string) => changeSupportTicketStatus(selectedId!, next),
    onSuccess: () => {
      toast.success("Status updated.");
      void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["support-ticket", selectedId] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const rows = list.data ?? [];
  const title = scope === "inbox" ? "Assigned to my role" : "My tickets";

  return (
    <PageFrame width="lg">
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-3">
          <Button asChild className="w-full">
            <Link to="/support/new">
              <Plus className="size-4" />
              Create New Ticket
            </Link>
          </Button>
          <nav className="rounded-xl border border-border bg-card p-2 text-sm">
            {FILTERS.map((row) => {
              const active = filter === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted/70",
                  )}
                  onClick={() => setFilter(row.id)}
                >
                  <span>{row.label}</span>
                  <span className={cn("tabular-nums text-xs", active ? "opacity-90" : "text-muted-foreground")}>
                    {countFor(row.status)}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h1 className="text-lg font-semibold">{title}</h1>
            <label className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                placeholder="Search my tickets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>

          <PageDataGate loading={list.isLoading} label="Loading tickets…" minHeightClassName="min-h-[18rem]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Subject & category</th>
                    <th className="px-3 py-3 font-medium">Assigned</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Created on</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                        No data available in table
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <TicketRow
                        key={row.ticketId}
                        row={row}
                        selected={selectedId === row.ticketId}
                        onSelect={() => setSelectedId(row.ticketId)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PageDataGate>

          {detail.data ? (
            <div className="space-y-3 border-t border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    #{detail.data.ticketNo} · {detail.data.subject}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {detail.data.categoryRoleName}
                    {detail.data.categoryEmail ? ` · ${detail.data.categoryEmail}` : ""}
                  </p>
                </div>
                {staff ? (
                  <div className="flex flex-wrap gap-1">
                    {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((code) => (
                      <Button
                        key={code}
                        type="button"
                        size="sm"
                        variant={detail.data.status === code ? "default" : "outline"}
                        onClick={() => statusMut.mutate(code)}
                      >
                        {statusLabel(code)}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                {detail.data.messages.map((msg) => (
                  <div key={msg.messageId} className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{msg.authorName}</span>
                      {msg.isStaff ? " · Desk" : ""} · {new Date(msg.createdAt).toLocaleString("en-KE")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{msg.body}</p>
                  </div>
                ))}
              </div>
              <Textarea
                className="min-h-[90px]"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply here…"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => void navigate({ to: "/support" })}>
                  Back to dashboard
                </Button>
                <Button type="button" disabled={!reply.trim() || replyMut.isPending} onClick={() => replyMut.mutate()}>
                  Send
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </PageFrame>
  );
}

function TicketRow({
  row,
  selected,
  onSelect,
}: {
  row: SupportTicketListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const icon =
    row.status === "CLOSED" ? Lock : row.status === "RESOLVED" ? CheckCircle2 : CircleDot;
  const Icon = icon;
  return (
    <tr className={cn("border-t border-border", selected && "bg-muted/40")}>
      <td className="px-4 py-3">
        <button type="button" className="text-left" onClick={onSelect}>
          <p className="font-medium">{row.subject}</p>
          <p className="text-xs text-muted-foreground">
            #{row.ticketNo} · {row.categoryRoleName}
          </p>
        </button>
      </td>
      <td className="px-3 py-3 text-muted-foreground">
        <p>{row.categoryAssigneeName || row.categoryRoleName}</p>
        {row.categoryEmail ? <p className="text-xs">{row.categoryEmail}</p> : null}
      </td>
      <td className="px-3 py-3">
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", statusClass(row.status))}>
          <Icon className="size-3" />
          {statusLabel(row.status)}
        </span>
      </td>
      <td className="px-3 py-3">{priorityLabel(row.priority)}</td>
      <td className="px-4 py-3 text-muted-foreground">{new Date(row.createdAt).toLocaleString("en-KE")}</td>
    </tr>
  );
}
