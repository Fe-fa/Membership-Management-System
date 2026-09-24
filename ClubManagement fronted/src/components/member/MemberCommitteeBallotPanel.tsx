import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, PenLine, X } from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame } from "@/components/layout/PageFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE } from "@/config/env";
import { readUser } from "@/lib/auth";
import { ApiError, apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

type VoteChoice = "FOR" | "AGAINST";

type SignaturePerson = {
  profileId: number;
  name: string;
  roleName?: string;
  kind?: string;
  signedAt?: string | null;
};

type BallotItem = {
  committeeBallotItemId: number;
  applicationNo: string;
  applicantName: string;
  photoUrl?: string | null;
  itemStatus: string;
  votingOpen?: boolean;
  autoRejected: boolean;
  excludedUntil?: string | null;
  myVoteCast: boolean;
  myVoteValue?: string | null;
  appliedMembershipType?: string | null;
  occupation?: string | null;
  votesCast?: number;
  canProceedToSignatures?: boolean;
  financeFeesCleared?: boolean;
  committeeSignatures?: number;
  gmSignatures?: number;
  chairmanSigned?: boolean;
  signatures?: SignaturePerson[];
  Signatures?: SignaturePerson[];
  awaitingSignatures?: SignaturePerson[];
  AwaitingSignatures?: SignaturePerson[];
};

type Desk = {
  committeeMeetingId: number;
  deskMessage?: string | null;
  items: BallotItem[];
};

const STEPS = ["Review applicant", "Submit vote", "Confirmation"] as const;

function photoSrc(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function votingOpen(row: BallotItem) {
  return row.votingOpen === true || row.itemStatus === "OPEN";
}

function choiceLabel(choice: VoteChoice) {
  return choice === "FOR" ? "For" : "Against";
}

function signatureList(row: BallotItem) {
  return row.signatures ?? row.Signatures ?? [];
}

function memberAlreadySigned(row: BallotItem, profileId: number) {
  return signatureList(row).some(
    (s) => s.profileId === profileId && (s.kind ?? "").toUpperCase() === "COMMITTEE",
  );
}

function needsMemberSignature(row: BallotItem, profileId: number) {
  if (row.itemStatus !== "PASSED") return false;
  if ((row.committeeSignatures ?? 0) >= 4) return false;
  if (memberAlreadySigned(row, profileId)) return false;
  return true;
}

function useAdmissionBallot() {
  return useQuery({
    queryKey: ["committee", "admission-ballot"],
    queryFn: () => apiRequest<Desk>("/api/committees/admission-ballot"),
  });
}

/** Sitting Committee members review one membership applicant at a time, then vote. */
export function MemberCommitteeVotePage() {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState(0);
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [holdId, setHoldId] = useState<number | null>(null);
  const [confirmedName, setConfirmedName] = useState<string | null>(null);

  const desk = useAdmissionBallot();

  const vote = useMutation({
    mutationFn: ({ itemId, voteValue }: { itemId: number; voteValue: VoteChoice }) =>
      apiRequest<BallotItem>(`/api/committees/ballot/${itemId}/vote`, {
        method: "POST",
        body: JSON.stringify({ voteValue }),
      }),
    onSuccess: (row, variables) => {
      setHoldId(variables.itemId);
      setConfirmedName(row.applicantName || "this applicant");
      setChoice(null);
      queryClient.setQueryData<Desk>(["committee", "admission-ballot"], (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.committeeBallotItemId === variables.itemId
              ? { ...item, ...row, myVoteCast: true, myVoteValue: variables.voteValue }
              : item,
          ),
        };
      });
      if (row.autoRejected) {
        toast.message(
          `2 adverse votes — excluded until ${row.excludedUntil ?? "one year from today"}.`,
        );
      } else {
        toast.success("Vote recorded.");
      }
      void queryClient.invalidateQueries({ queryKey: ["committee", "admission-ballot"] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const data = desk.data;
  const forbidden =
    desk.error instanceof ApiError && (desk.error.status === 401 || desk.error.status === 403);
  const openItems = (data?.items ?? []).filter(
    (item) => !item.myVoteCast && votingOpen(item) && !item.autoRejected,
  );
  const held = (data?.items ?? []).find((item) => item.committeeBallotItemId === holdId);
  const index = openItems.length === 0 ? 0 : Math.min(cursor, openItems.length - 1);
  const row = held ?? openItems[index];
  const step = held ? 3 : choice ? 2 : 1;

  useEffect(() => {
    if (!held) setChoice(null);
  }, [row?.committeeBallotItemId, held]);

  function reviewAnother() {
    if (held) {
      setHoldId(null);
      setConfirmedName(null);
      setChoice(null);
      return;
    }
    if (openItems.length < 2) return;
    setChoice(null);
    setCursor((current) => (Math.min(current, openItems.length - 1) + 1) % openItems.length);
  }

  return (
    <PageFrame width="lg">
      <PageBackLink to="/election" label="Back to election" />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        {row ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            Status: {row.itemStatus || "OPEN"}
          </span>
        ) : null}
      </header>

      <div>
        <ol className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {STEPS.map((label, stepIndex) => {
            const number = stepIndex + 1;
            const active = number === step;
            const done = number < step;
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1",
                    active && "bg-slate-800 text-white",
                    done && "text-foreground",
                    !active && !done && "text-muted-foreground",
                  )}
                >
                  <span className="font-semibold">{number}.</span>
                  {label}
                </span>
                {stepIndex < STEPS.length - 1 ? (
                  <span className="hidden h-px w-8 bg-border sm:block" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {desk.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading applicants…</p>
      ) : forbidden ? (
        <p className="text-sm text-muted-foreground">
          Applicant voting is only for sitting Committee members.
        </p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Unable to load the applicant ballot.</p>
      ) : data.deskMessage && !data.committeeMeetingId ? (
        <p className="text-sm text-muted-foreground">{data.deskMessage}</p>
      ) : !row ? (
        <p className="text-sm text-muted-foreground">
          {confirmedName
            ? `Your vote for ${confirmedName} is recorded. No open applicants are left.`
            : "No open applicants are waiting for your vote."}
        </p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <section>
            <h2 className="text-base font-semibold">Candidate overview</h2>
            <div className="mt-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-4">
                <Avatar className="size-20 border border-border">
                  {photoSrc(row.photoUrl) ? <AvatarImage src={photoSrc(row.photoUrl)} alt="" /> : null}
                  <AvatarFallback className="text-base font-semibold">
                    {initials(row.applicantName) || "—"}
                  </AvatarFallback>
                </Avatar>
                <dl className="grid gap-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Name:</dt>
                    <dd className="font-semibold">{row.applicantName}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Title:</dt>
                    <dd>Applicant</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Application:</dt>
                    <dd>{row.applicationNo}</dd>
                  </div>
                  {row.appliedMembershipType ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Membership sought:</dt>
                      <dd>{row.appliedMembershipType}</dd>
                    </div>
                  ) : null}
                  {row.occupation ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Occupation:</dt>
                      <dd>{row.occupation}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold">
              {held
                ? `Vote recorded${row.myVoteValue ? `: ${choiceLabel(row.myVoteValue === "AGAINST" ? "AGAINST" : "FOR")}` : ""}.`
                : choice
                  ? `Your selection: ${choiceLabel(choice)}`
                  : "Your vote is pending"}
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Voting options
            </h2>
            {held ? (
              <div className="mt-3 rounded-xl border border-border bg-card px-4 py-5 text-sm shadow-sm">
                <p className="font-semibold">Vote submitted</p>
                <p className="mt-1 text-muted-foreground">
                  {row.applicantName} is no longer waiting for your vote.
                </p>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={vote.isPending}
                  onClick={() => {
                    setConfirmedName(null);
                    setChoice("FOR");
                  }}
                  className={cn(
                    "rounded-xl border bg-card px-3 py-4 text-center shadow-sm transition",
                    choice === "FOR"
                      ? "border-slate-800 ring-2 ring-slate-800"
                      : "border-border hover:border-slate-400",
                  )}
                >
                  <p className="text-sm font-semibold tracking-wide">FOR</p>
                  <Check className="mx-auto mt-2 size-7 text-slate-800" strokeWidth={2.5} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cast your vote for {row.applicantName}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={vote.isPending}
                  onClick={() => {
                    setConfirmedName(null);
                    setChoice("AGAINST");
                  }}
                  className={cn(
                    "rounded-xl border bg-card px-3 py-4 text-center shadow-sm transition",
                    choice === "AGAINST"
                      ? "border-slate-800 ring-2 ring-slate-800"
                      : "border-border hover:border-slate-400",
                  )}
                >
                  <p className="text-sm font-semibold tracking-wide">AGAINST</p>
                  <X className="mx-auto mt-2 size-7 text-slate-800" strokeWidth={2.5} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cast your vote against {row.applicantName}
                  </p>
                </button>
              </div>
            )}
            {held ? null : (
              <Button
                type="button"
                className="mt-3 w-full"
                disabled={!choice || vote.isPending}
                onClick={() => {
                  if (!choice) return;
                  vote.mutate({ itemId: row.committeeBallotItemId, voteValue: choice });
                }}
              >
                {vote.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Confirm &amp; submit vote
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full"
              disabled={vote.isPending || (held ? openItems.length === 0 : openItems.length < 2)}
              onClick={reviewAnother}
            >
              {held ? "Next applicant" : "Review other applicants"}
            </Button>
          </section>
        </div>
      )}
    </PageFrame>
  );
}

/** Member-only Committee signature step (not the full admin signatures desk). */
export function MemberCommitteeSignaturesPage() {
  const queryClient = useQueryClient();
  const user = readUser();
  const profileId = user?.profileId ?? 0;
  const [signItemId, setSignItemId] = useState<number | null>(null);
  const [signatureName, setSignatureName] = useState(user?.fullName ?? "");

  const desk = useAdmissionBallot();

  const sign = useMutation({
    mutationFn: ({ itemId, name }: { itemId: number; name: string }) =>
      apiRequest<BallotItem>(`/api/committees/ballot/${itemId}/sign`, {
        method: "POST",
        body: JSON.stringify({
          signatoryKind: "COMMITTEE",
          signatureName: name.trim(),
        }),
      }),
    onSuccess: (row) => {
      toast.success(`Signature recorded for ${row.applicantName}.`);
      setSignItemId(null);
      setSignatureName(user?.fullName ?? "");
      void queryClient.invalidateQueries({ queryKey: ["committee", "admission-ballot"] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const data = desk.data;
  const forbidden =
    desk.error instanceof ApiError && (desk.error.status === 401 || desk.error.status === 403);
  const signatureRows = useMemo(
    () => (data?.items ?? []).filter((item) => needsMemberSignature(item, profileId)),
    [data?.items, profileId],
  );
  const activeSignRow =
    signatureRows.find((item) => item.committeeBallotItemId === signItemId) ?? null;

  return (
    <PageFrame width="lg">
      <PageBackLink to="/election" label="Back to election" />
      <header className="border-b border-border pb-4">
      </header>

      <div>
        <h1 className="text-3xl leading-tight">Signatures</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign as a Committee member after the ballot has passed. GM and Chairman steps stay on the
          admin desk.
        </p>
      </div>

      {desk.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading signatures…</p>
      ) : forbidden ? (
        <p className="text-sm text-muted-foreground">
          Committee signatures are only for sitting Committee members.
        </p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Unable to load signatures.</p>
      ) : data.deskMessage && !data.committeeMeetingId ? (
        <p className="text-sm text-muted-foreground">{data.deskMessage}</p>
      ) : signatureRows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <PenLine className="size-7" strokeWidth={1.75} />
          </span>
          <p className="mt-3 text-base font-semibold tracking-tight">No signature work yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            After voting closes and the ballot is passed (more than 4 votes), applicants waiting for
            your Committee signature appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {signatureRows.map((item) => {
            const feesOk = item.financeFeesCleared !== false;
            const opening = signItemId === item.committeeBallotItemId;
            return (
              <article
                key={item.committeeBallotItemId}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar className="size-11 border border-border">
                      {photoSrc(item.photoUrl) ? (
                        <AvatarImage src={photoSrc(item.photoUrl)} alt="" />
                      ) : null}
                      <AvatarFallback className="text-sm font-semibold">
                        {initials(item.applicantName) || "—"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold tracking-tight">
                        {item.applicantName}
                      </h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.applicationNo}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Committee {item.committeeSignatures ?? 0}/4 signatures
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    PASSED
                  </span>
                </div>

                {!feesOk ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    Finance must mark entrance and annual fees Paid before you can sign.
                  </p>
                ) : null}

                {opening ? (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground">
                      Confirm your Committee signature for {item.applicantName}. Type your name as it
                      should appear on the ballot.
                    </p>
                    <label className="grid gap-1 text-sm">
                      <span className="text-muted-foreground">Your signature (type name)</span>
                      <Input
                        value={signatureName}
                        onChange={(e) => setSignatureName(e.target.value)}
                        placeholder={user?.fullName || "Full name"}
                        disabled={sign.isPending}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={sign.isPending || !signatureName.trim() || !feesOk}
                        onClick={() =>
                          sign.mutate({
                            itemId: item.committeeBallotItemId,
                            name: signatureName,
                          })
                        }
                      >
                        {sign.isPending &&
                        activeSignRow?.committeeBallotItemId === item.committeeBallotItemId ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <PenLine className="size-4" />
                        )}
                        Confirm signature
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={sign.isPending}
                        onClick={() => {
                          setSignItemId(null);
                          setSignatureName(user?.fullName ?? "");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex justify-end border-t border-border pt-4">
                    <Button
                      type="button"
                      disabled={!feesOk || sign.isPending}
                      onClick={() => {
                        setSignItemId(item.committeeBallotItemId);
                        setSignatureName(user?.fullName ?? "");
                      }}
                    >
                      <PenLine className="size-4" />
                      Sign as Committee member
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}
