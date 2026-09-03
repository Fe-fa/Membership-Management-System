import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  role: string;
  outcome: string;
  completedAt: string;
};

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
  tone?: "muted" | "primary";
  children: React.ReactNode;
}) => (
  <span
    className={
      tone === "primary"
        ? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
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

  return (
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
        <Button type="button" variant="outline" onClick={onCollapsed}>
          Cancel
        </Button>
        <Button type="submit" disabled={submit.isPending || !isValid}>
          {submit.isPending ? "Submitting…" : "Submit endorsement"}
        </Button>
      </div>
    </form>
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

  const pending = data.data?.pending ?? [];
  const history = data.data?.history ?? [];

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
                        void queryClient.invalidateQueries({
                          queryKey: ["member-endorsements"],
                        });
                        void queryClient.invalidateQueries({
                          queryKey: ["member-me"],
                        });
                      }}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6 space-y-3">
          {data.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : data.isError ? (
            <div className="surface-card p-5 text-sm text-destructive">
              {extractErrorMessage(data.error) ?? "Could not load history."}
            </div>
          ) : history.length === 0 ? (
            <div className="surface-card p-6 text-sm text-muted-foreground">
              You have not endorsed an application yet.
            </div>
          ) : (
            history.map((row) => (
              <div
                key={`${row.applicationId}-${row.role}-${row.completedAt}`}
                className="surface-card flex items-center justify-between gap-4 px-5 py-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold">
                    {row.role} for {row.applicantName}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {row.applicationNo}
                  </p>
                </div>
                <Badge>{row.outcome}</Badge>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}
