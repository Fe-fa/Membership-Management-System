import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

export type InboxNotification = {
  notificationId: number;
  typeCode: string;
  title: string;
  body: string;
  createdAtUtc: string;
  isRead: boolean;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  href?: string;
  /** Stage A checklist items are not deletable server rows. */
  synthetic?: boolean;
};

type ManagerReadiness = {
  statusCode?: string | null;
  endorsementsComplete?: boolean;
  paymentsReady?: boolean;
  cvUploaded?: boolean;
  idPassportUploaded?: boolean;
  readyForManager?: boolean;
  canProceedToInterview?: boolean;
  annualChequeUploaded?: boolean | null;
  joiningChequeUploaded?: boolean | null;
  pilotLicenseRequired?: boolean;
  pilotLicenseUploaded?: boolean;
};

const NOTIFICATIONS_KEY = ["member-notifications"] as const;

function actionHref(note: InboxNotification): string | undefined {
  if (note.href) return note.href;
  const code = (note.typeCode ?? "").toUpperCase();
  if (code.includes("PAYMENT")) return "/payment";
  if (code.includes("DOCUMENT") || code.includes("CV") || code.includes("PASSPORT")) return "/documents";
  if (code.includes("ENDORSEMENT")) return "/endorsements";
  if (note.relatedEntityType === "APPLICATION") return "/application";
  return undefined;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationBell() {
  const user = readUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const notifications = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => apiRequest<InboxNotification[]>("/api/members/me/notifications"),
    enabled: Boolean(user?.profileId),
    refetchInterval: 30_000,
  });

  const application = useQuery({
    queryKey: ["applications", "me", "for-bell", user?.userAccountId],
    queryFn: () =>
      apiRequest<Array<{ applicationId: number; statusCode?: string | null }>>("/api/applications/me"),
    enabled: Boolean(user?.userAccountId),
    staleTime: 30_000,
  });

  const activeApp = useMemo(() => {
    const rows = application.data ?? [];
    return (
      rows.find((a) => {
        const code = (a.statusCode ?? "").trim();
        return !["Approved", "Rejected", "Withdrawn", "NotElected", "Draft"].includes(code);
      }) ?? null
    );
  }, [application.data]);

  const readiness = useQuery({
    queryKey: ["manager-readiness", "bell", activeApp?.applicationId],
    queryFn: () =>
      apiRequest<ManagerReadiness>(`/api/applications/${activeApp!.applicationId}/manager-readiness`),
    enabled: Boolean(activeApp?.applicationId),
    staleTime: 20_000,
  });

  const stageANote = useMemo((): InboxNotification | null => {
    const r = readiness.data;
    if (!r || !activeApp) return null;
    const code = (activeApp.statusCode ?? r.statusCode ?? "").trim();
    if (["Approved", "Rejected", "Withdrawn", "Draft", "Interview", "InterviewReview", "Waitlist", "ElectionReview", "Committee", "CommitteeReview", "TemporaryMember"].includes(code)) {
      return null;
    }
    if (r.canProceedToInterview || r.readyForManager) return null;

    const missing: string[] = [];
    if (!r.endorsementsComplete) missing.push("Proposer and seconder must both submit their recommendations");
    if (!r.paymentsReady) {
      missing.push("Entrance / joining fee — pay or upload cheque");
      missing.push("Annual subscription fee — pay or upload cheque");
    }
    if (!r.cvUploaded) missing.push("Upload your CV");
    if (!r.idPassportUploaded) missing.push("Upload ID / Passport copy");
    if (missing.length === 0) return null;

    return {
      notificationId: -1,
      typeCode: "STAGE_A_CHECKLIST",
      title: "Complete items for the manager queue (Stage A)",
      body: `Until these are complete, your application will not appear on the manager's Notification queue.\n\n• ${missing.join("\n• ")}`,
      createdAtUtc: new Date().toISOString(),
      isRead: false,
      href: !r.paymentsReady ? "/payment" : "/documents",
      synthetic: true,
    };
  }, [activeApp, readiness.data]);

  const items = useMemo(() => {
    const rows = [...(notifications.data ?? [])];
    if (stageANote) rows.unshift(stageANote);
    return rows;
  }, [notifications.data, stageANote]);

  const unreadCount = items.filter((n) => !n.isRead).length;

  const markRead = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/members/me/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("/api/members/me/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      toast.success("All notifications marked as read.");
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const dismissOne = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/members/me/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Notification deleted.");
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const dismissAll = useMutation({
    mutationFn: () => apiRequest("/api/members/me/notifications", { method: "DELETE" }),
    onSuccess: () => {
      toast.success("All notifications deleted.");
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  if (!user?.profileId) return null;

  async function openItem(note: InboxNotification) {
    setExpandedId((prev) => (prev === note.notificationId ? null : note.notificationId));
    if (!note.isRead && !note.synthetic) {
      try {
        await markRead.mutateAsync(note.notificationId);
      } catch {
        /* keep open even if mark-read fails */
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          className="relative inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-secondary/60"
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-[26rem]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're up to date"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              disabled={unreadCount === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              title="Mark all as read"
            >
              {markAllRead.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-rose-700 hover:text-rose-800"
              disabled={items.filter((n) => !n.synthetic).length === 0 || dismissAll.isPending}
              onClick={() => dismissAll.mutate()}
              title="Delete all"
            >
              {dismissAll.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            </Button>
          </div>
        </div>

        <div className="max-h-[24rem] overflow-y-auto">
          {notifications.isLoading ? (
            <p className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((note) => {
                const expanded = expandedId === note.notificationId;
                const href = actionHref(note);
                return (
                  <li
                    key={note.notificationId}
                    className={cn("px-3 py-3", !note.isRead && "bg-primary/5")}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => void openItem(note)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm", !note.isRead ? "font-semibold" : "font-medium")}>
                          {note.title}
                        </p>
                        {!note.isRead ? (
                          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {note.synthetic ? "Action needed" : formatWhen(note.createdAtUtc)}
                      </p>
                      {expanded ? (
                        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                          {note.body || note.title}
                        </p>
                      ) : note.body && note.body !== note.title ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{note.body}</p>
                      ) : null}
                    </button>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {href ? (
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                          <Link to={href} onClick={() => setOpen(false)}>
                            Open
                          </Link>
                        </Button>
                      ) : null}
                      {!note.synthetic ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-rose-700 hover:text-rose-800"
                          disabled={dismissOne.isPending}
                          onClick={() => dismissOne.mutate(note.notificationId)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
