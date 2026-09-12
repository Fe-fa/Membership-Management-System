import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { RejectApplicationDialog } from "@/components/admin/RejectApplicationDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

type Invite = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  applicantPhotoUrl?: string | null;
  membershipType: string;
  role: string;
  status: string;
  endorserYearOfJoining?: number | null;
};

type HistoryRow = {
  endorsementId?: number | null;
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  applicantPhotoUrl?: string | null;
  role: string;
  outcome: string;
  applicationStatusCode?: string | null;
  membershipType?: string | null;
  completedAt: string;
  yearsKnownCandidate?: number | null;
  personalKnowledge?: string | null;
  professionalKnowledge?: string | null;
  valueAddition?: string | null;
  declineReason?: string | null;
  declinedAt?: string | null;
  lastRejectionReason?: string | null;
  canEdit: boolean;
  canDelete: boolean;
  hidden: boolean;
};

function formatHistoryDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function outcomeTone(outcome: string): "muted" | "primary" | "rose" {
  const value = outcome.toLowerCase();
  if (value.includes("declin") || value.includes("reject") || value.includes("not elected")) {
    return "rose";
  }
  return "muted";
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "??";
}

function ApplicantAvatar({
  name,
  photoUrl,
  size = "md",
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "h-16 w-16 text-lg"
      : size === "sm"
        ? "h-9 w-9 text-xs"
        : "h-12 w-12 text-sm";

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ring-1 ring-border`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${sizeClass} inline-flex items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground ring-1 ring-border`}
    >
      {getInitials(name)}
    </span>
  );
}

const Badge = ({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "primary" | "rose";
  children: React.ReactNode;
}) => (
  <span
    className={
      tone === "primary"
        ? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
        : tone === "rose"
          ? "inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800"
          : "inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
    }
  >
    {children}
  </span>
);

function EndorseForm({
  invite,
  onCollapsed,
}: {
  invite: Invite;
  onCollapsed: () => void;
}) {
  const [form, setForm] = useState({
    yearsKnownCandidate: "",
    personalKnowledge: "",
    professionalKnowledge: "",
    valueAddition: "",
    integrityConfirmed: false,
    signatureImageUrl: "",
  });
  const [rejectOpen, setRejectOpen] = useState(false);

  const isValid = useMemo(() => {
    const years = Number(form.yearsKnownCandidate);
    return (
      form.integrityConfirmed &&
      form.signatureImageUrl.trim().length > 0 &&
      Number.isFinite(years) &&
      years >= 0 &&
      form.personalKnowledge.trim().length > 0 &&
      form.professionalKnowledge.trim().length > 0 &&
      form.valueAddition.trim().length > 0
    );
  }, [form]);

  const submit = useMutation({
    mutationFn: () =>
      apiRequest(`/api/members/me/endorsements/${invite.applicationId}`, {
        method: "POST",
        body: JSON.stringify({
          endorserRole: invite.role,
          yearsKnownCandidate: Number(form.yearsKnownCandidate),
          personalKnowledge: form.personalKnowledge,
          professionalKnowledge: form.professionalKnowledge,
          valueAddition: form.valueAddition,
          integrityConfirmed: form.integrityConfirmed,
          signatureImageUrl: form.signatureImageUrl.startsWith("typed:")
            ? form.signatureImageUrl
            : `typed:${form.signatureImageUrl}`,
        }),
      }),
    onSuccess: () => {
      toast.success("Endorsement complete.");
      onCollapsed();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const reject = useMutation({
    mutationFn: (reason: string) =>
      apiRequest(`/api/members/me/endorsements/${invite.applicationId}/reject`, {
        method: "POST",
        body: JSON.stringify({
          endorserRole: invite.role,
          reason,
        }),
      }),
    onSuccess: () => {
      toast.success("Endorsement rejected.");
      setRejectOpen(false);
      onCollapsed();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const busy = submit.isPending || reject.isPending;

  return (
    <>
      <form
        className="mt-5 grid gap-4 animate-in fade-in slide-in-from-top-2 duration-200"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
        onClick={(e) => e.stopPropagation()}
      >
      {/* <p className="text-sm text-muted-foreground">
        Your endorsement for{" "}
        <span className="font-medium text-foreground">{invite.applicantName}</span>{" "}
        ({invite.membershipType} Membership · {invite.applicationNo}) · Year of
        joining (endorser):{" "}
        {invite.endorserYearOfJoining ?? "from your profile"}.
      </p> */}

      <label className="text-sm">
        Years the candidate has been known to you
        <Input
          className="mt-1"
          type="number"
          min={0}
          placeholder="e.g. 3"
          value={form.yearsKnownCandidate}
          onChange={(e) =>
            setForm({ ...form, yearsKnownCandidate: e.target.value })
          }
        />
      </label>

      <label className="text-sm">
        Detail your personal knowledge of the candidate
        <Textarea
          className="mt-1"
          value={form.personalKnowledge}
          onChange={(e) =>
            setForm({ ...form, personalKnowledge: e.target.value })
          }
        />
      </label>

      <label className="text-sm">
        Detail your professional knowledge of the candidate
        <Textarea
          className="mt-1"
          value={form.professionalKnowledge}
          onChange={(e) =>
            setForm({ ...form, professionalKnowledge: e.target.value })
          }
        />
      </label>

      <label className="text-sm">
        Explain why you feel that the applicant will add value to the Club
        <Textarea
          className="mt-1"
          value={form.valueAddition}
          onChange={(e) => setForm({ ...form, valueAddition: e.target.value })}
        />
      </label>

      <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <Checkbox
          checked={form.integrityConfirmed}
          onCheckedChange={(value) =>
            setForm({ ...form, integrityConfirmed: value === true })
          }
        />
        <span>
          I am satisfied as to the candidate&apos;s integrity in public life.
        </span>
      </label>

      <label className="text-sm">
        Signature
        <Input
          className="mt-1 font-serif"
          placeholder="Type your full name"
          value={form.signatureImageUrl.replace(/^typed:/, "")}
          onChange={(e) =>
            setForm({ ...form, signatureImageUrl: e.target.value })
          }
        />
      </label>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="destructive"
          disabled={busy}
          onClick={() => setRejectOpen(true)}
        >
          {reject.isPending ? "Rejecting…" : "Reject"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCollapsed}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !isValid}>
          {submit.isPending ? "Submitting…" : "Submit endorsement"}
        </Button>
      </div>
      </form>
      <RejectApplicationDialog
        open={rejectOpen}
        applicantLabel={invite.applicantName}
        pending={reject.isPending}
        onOpenChange={setRejectOpen}
        onConfirm={(reason) => reject.mutate(reason)}
        description={`This will decline your ${invite.role} endorsement for ${invite.applicantName}. `}
        reasonPlaceholder="Why you cannot endorse this applicant"
        submitLabel="Reject endorsement"
      />
    </>
  );
}

export function EndorsementsPage() {
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: ["member-endorsements"],
    queryFn: () =>
      apiRequest<{ pending: Invite[]; history: HistoryRow[] }>(
        "/api/members/me/endorsements",
      ),
  });

  const [openId, setOpenId] = useState<number | null>(null);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [retrieveOpen, setRetrieveOpen] = useState(false);

  const pending = data.data?.pending ?? [];
  const history = data.data?.history ?? [];

  const refreshEndorsements = () => {
    void queryClient.invalidateQueries({ queryKey: ["member-endorsements"] });
    void queryClient.invalidateQueries({ queryKey: ["member-endorsements-search"] });
    void queryClient.invalidateQueries({ queryKey: ["member-me"] });
  };

  return (
    <PageFrame>
      <PageHeader title="Endorsements" />

      <Tabs defaultValue="pending" className="mt-2">
        <TabsList>
          <TabsTrigger value="pending">Requests ({pending.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6 space-y-4">
          {data.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading pending endorsements…
            </p>
          ) : data.isError ? (
            <div className="surface-card p-5 text-sm text-destructive">
              {extractErrorMessage(data.error) ?? "Could not load endorsements."}
            </div>
          ) : pending.length === 0 ? (
            <div className="surface-card p-6 text-sm text-muted-foreground">
              No outstanding endorsements.
            </div>
          ) : (
            pending.map((row) => {
              const isOpen = openId === row.applicationId;
              return (
                <div
                  key={`${row.applicationId}-${row.role}`}
                  className="surface-card p-5"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : row.applicationId)}
                    className="flex w-full items-start gap-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <ApplicantAvatar
                      name={row.applicantName}
                      photoUrl={row.applicantPhotoUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="primary">{row.role}</Badge>
                        <Badge>{row.membershipType} Membership</Badge>
                        {row.status ? <Badge>{row.status}</Badge> : null}
                      </div>
                      <p className="mt-1 truncate font-display text-lg font-semibold leading-tight">
                        {row.applicantName}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Application {row.applicationNo}
                      </p>
                      <p className="mt-3 text-sm text-foreground/80">
                        You have been selected as{" "}
                        <span className="font-medium">{row.role}</span> for this{" "}
                        {row.membershipType} Membership application.
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className={`self-center text-xl text-muted-foreground transition-transform duration-200 ${
                        isOpen ? "rotate-90 text-primary" : ""
                      }`}
                    >
                      ›
                    </span>
                  </button>

                  {isOpen ? (
                    <EndorseForm
                      invite={row}
                      onCollapsed={() => {
                        setOpenId(null);
                        refreshEndorsements();
                      }}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-xl text-sm text-muted-foreground">
              Past proposer and seconder records stay here after a later-stage
              rejection. Retrieve a name or application number if someone is
              missing from this list.
            </p>
            <Button type="button" variant="outline" onClick={() => setRetrieveOpen(true)}>
              <Search className="size-4" />
              Retrieve
            </Button>
          </div>

          {data.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : data.isError ? (
            <div className="surface-card p-5 text-sm text-destructive">
              {extractErrorMessage(data.error) ?? "Could not load history."}
            </div>
          ) : history.length === 0 ? (
            <div className="surface-card p-6 text-sm text-muted-foreground">
              You have not endorsed an application yet. Use Retrieve if a
              previous applicant is missing from this list.
            </div>
          ) : (
            history.map((row) => {
              const when = formatHistoryDate(row.completedAt);
              return (
                <button
                  type="button"
                  key={`${row.endorsementId ?? "app"}-${row.applicationId}-${row.role}-${row.completedAt}`}
                  className="surface-card flex w-full items-center gap-4 px-5 py-4 text-left text-sm"
                  onClick={() => setSelected(row)}
                >
                  <ApplicantAvatar
                    name={row.applicantName}
                    photoUrl={row.applicantPhotoUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold">
                      {row.role} for {row.applicantName}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {row.applicationNo}
                      {when ? ` · ${when}` : ""}
                    </p>
                  </div>
                  <Badge tone={outcomeTone(row.outcome)}>{row.outcome}</Badge>
                </button>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      <HistoryDetailDialog
        row={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onUpdated={(next) => {
          setSelected(next);
          refreshEndorsements();
        }}
        onRemoved={() => {
          setSelected(null);
          refreshEndorsements();
        }}
      />

      <RetrieveHistoryDialog
        open={retrieveOpen}
        onOpenChange={setRetrieveOpen}
        onSelect={(row) => {
          setRetrieveOpen(false);
          setSelected(row);
        }}
        onRestored={refreshEndorsements}
      />
    </PageFrame>
  );
}

function HistoryDetailDialog({
  row,
  onOpenChange,
  onUpdated,
  onRemoved,
}: {
  row: HistoryRow | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (row: HistoryRow) => void;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [form, setForm] = useState({
    yearsKnownCandidate: "",
    personalKnowledge: "",
    professionalKnowledge: "",
    valueAddition: "",
    declineReason: "",
  });

  const declined = Boolean(row?.declineReason) || row?.outcome === "Declined";

  const openEditor = () => {
    if (!row) return;
    setForm({
      yearsKnownCandidate: row.yearsKnownCandidate?.toString() ?? "",
      personalKnowledge: row.personalKnowledge ?? "",
      professionalKnowledge: row.professionalKnowledge ?? "",
      valueAddition: row.valueAddition ?? "",
      declineReason: row.declineReason ?? "",
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!row?.endorsementId) throw new Error("This record cannot be edited.");
      return apiRequest<HistoryRow>(
        `/api/members/me/endorsements/history/${row.endorsementId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            yearsKnownCandidate: form.yearsKnownCandidate
              ? Number(form.yearsKnownCandidate)
              : null,
            personalKnowledge: form.personalKnowledge,
            professionalKnowledge: form.professionalKnowledge,
            valueAddition: form.valueAddition,
            declineReason: form.declineReason,
          }),
        },
      );
    },
    onSuccess: (next) => {
      toast.success("History updated.");
      setEditing(false);
      onUpdated(next);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!row?.endorsementId) throw new Error("This record cannot be removed.");
      await apiRequest(
        `/api/members/me/endorsements/history/${row.endorsementId}`,
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      toast.success("Removed from history. Use Retrieve to bring it back.");
      setConfirmRemove(false);
      onRemoved();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const restore = useMutation({
    mutationFn: async () => {
      if (!row?.endorsementId) throw new Error("This record cannot be restored.");
      await apiRequest(
        `/api/members/me/endorsements/history/${row.endorsementId}/restore`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      toast.success("Restored to history.");
      if (row) onUpdated({ ...row, hidden: false });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const when = formatHistoryDate(row?.completedAt);
  const busy = save.isPending || remove.isPending || restore.isPending;

  return (
    <>
      <Dialog
        open={row != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(false);
            setConfirmRemove(false);
          }
          onOpenChange(open);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {row ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {row.role} for {row.applicantName}
                </DialogTitle>
                <DialogDescription>
                  {row.applicationNo}
                  {row.membershipType ? ` · ${row.membershipType}` : ""}
                  {when ? ` · ${when}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-3">
                <ApplicantAvatar
                  name={row.applicantName}
                  photoUrl={row.applicantPhotoUrl}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="font-medium">{row.applicantName}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={outcomeTone(row.outcome)}>{row.outcome}</Badge>
                    {row.hidden ? <Badge tone="rose">Removed from list</Badge> : null}
                  </div>
                </div>
              </div>

              {row.lastRejectionReason ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  Later-stage rejection: {row.lastRejectionReason}
                </p>
              ) : null}

              {editing ? (
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate();
                  }}
                >
                  {declined ? (
                    <label className="text-sm">
                      Rejection reason
                      <Textarea
                        className="mt-1"
                        value={form.declineReason}
                        onChange={(e) =>
                          setForm({ ...form, declineReason: e.target.value })
                        }
                      />
                    </label>
                  ) : (
                    <>
                      <label className="text-sm">
                        Years known
                        <Input
                          className="mt-1"
                          type="number"
                          min={0}
                          value={form.yearsKnownCandidate}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              yearsKnownCandidate: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="text-sm">
                        Personal knowledge
                        <Textarea
                          className="mt-1"
                          value={form.personalKnowledge}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              personalKnowledge: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="text-sm">
                        Professional knowledge
                        <Textarea
                          className="mt-1"
                          value={form.professionalKnowledge}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              professionalKnowledge: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="text-sm">
                        Value to the Club
                        <Textarea
                          className="mt-1"
                          value={form.valueAddition}
                          onChange={(e) =>
                            setForm({ ...form, valueAddition: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy}>
                      {save.isPending ? "Saving…" : "Save"}
                    </Button>
                  </DialogFooter>
                </form>
              ) : (
                <>
                  {declined ? (
                    <div className="text-sm">
                      <p className="font-medium">Your rejection reason</p>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {row.declineReason || "No reason recorded."}
                      </p>
                    </div>
                  ) : row.personalKnowledge ||
                    row.professionalKnowledge ||
                    row.valueAddition ? (
                    <div className="grid gap-3 text-sm">
                      {row.yearsKnownCandidate != null ? (
                        <p>
                          <span className="font-medium">Years known:</span>{" "}
                          {row.yearsKnownCandidate}
                        </p>
                      ) : null}
                      <FieldBlock
                        title="Personal knowledge"
                        value={row.personalKnowledge}
                      />
                      <FieldBlock
                        title="Professional knowledge"
                        value={row.professionalKnowledge}
                      />
                      <FieldBlock
                        title="Value to the Club"
                        value={row.valueAddition}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      You were named on this application, but there is no
                      saved endorsement statement. The application later moved
                      to {row.outcome}.
                    </p>
                  )}

                  <DialogFooter className="gap-2 sm:justify-between">
                    {row.canDelete && !row.hidden ? (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => setConfirmRemove(true)}
                      >
                        Remove from history
                      </Button>
                    ) : row.hidden && row.endorsementId ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => restore.mutate()}
                      >
                        {restore.isPending ? "Restoring…" : "Restore to history"}
                      </Button>
                    ) : (
                      <span />
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                      >
                        Close
                      </Button>
                      {row.canEdit ? (
                        <Button type="button" disabled={busy} onClick={openEditor}>
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  </DialogFooter>
                </>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from your history?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides the record from the History list. The club still keeps
              the endorsement. You can bring it back with Retrieve.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FieldBlock({ title, value }: { title: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{value}</p>
    </div>
  );
}

function RetrieveHistoryDialog({
  open,
  onOpenChange,
  onSelect,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (row: HistoryRow) => void;
  onRestored: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = useQuery({
    queryKey: ["member-endorsements-search", query],
    queryFn: () =>
      apiRequest<HistoryRow[]>(
        `/api/members/me/endorsements/history/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: open,
  });

  const restore = useMutation({
    mutationFn: (endorsementId: number) =>
      apiRequest(`/api/members/me/endorsements/history/${endorsementId}/restore`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Restored to history.");
      void results.refetch();
      onRestored();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const rows = results.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Retrieve endorsement history</DialogTitle>
          <DialogDescription>
            Search by applicant name or application number. Leave the box empty
            to see records you removed from History.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1 text-sm">
          <Label htmlFor="history-retrieve">Applicant or application no.</Label>
          <Input
            id="history-retrieve"
            value={query}
            placeholder="e.g. Brian Korir or ACEA-2026-92835"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {results.isLoading ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : results.isError ? (
          <p className="text-sm text-destructive">
            {extractErrorMessage(results.error) ?? "Could not search history."}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query.trim().length === 1
              ? "Type at least two characters to search."
              : query.trim()
                ? "No matching proposer or seconder records."
                : "No removed records. Search to find a past applicant."}
          </p>
        ) : (
          <div className="grid gap-2">
            {rows.map((row) => (
              <div
                key={`retrieve-${row.endorsementId ?? "app"}-${row.applicationId}-${row.role}`}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <ApplicantAvatar
                  name={row.applicantName}
                  photoUrl={row.applicantPhotoUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {row.applicantName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.role} · {row.applicationNo} · {row.outcome}
                    {row.hidden ? " · removed" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {row.hidden && row.endorsementId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(row.endorsementId!)}
                    >
                      Restore
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onSelect(row)}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
