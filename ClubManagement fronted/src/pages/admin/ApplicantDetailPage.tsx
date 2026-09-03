import { getRouteApi, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApplicantReview, parseApplicationDraft } from "@/components/panels/ApplicantReview";
import { RejectApplicationDialog } from "@/components/admin/RejectApplicationDialog";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { StaffMembershipForm } from "@/components/membership/StaffMembershipForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CLOSED_APPLICATION_STATUSES,
  canStartReview,
  displayApplicationStatus,
  formatMembershipDate,
  nextApplicationStage,
  type ApplicationDetailAdmin,
} from "@/services/admin/membershipDesk";
import { hasAnyRole, readUser } from "@/lib/auth";
import { kenyaTodayISO } from "@/utils/kenyaDate";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { STEPS } from "@/services/membership/steps";
import type { ApplicationDraft } from "@/services/membership/schema";

const routeApi = getRouteApi("/members/$applicationId");

export function ApplicantDetailPage() {
  const { applicationId } = routeApi.useParams();
  const search = useSearch({ strict: false }) as {
    edit?: boolean;
    view?: string;
    section?: string;
  };
  const fromManager = search.view === "manager";
  const editing = Boolean(search.edit) && !fromManager;
  const backTo = "/members";
  const backLabel = fromManager ? "Back to Notification" : "Back to pending applications";
  const managerSearch = fromManager
    ? {
        view: "manager" as const,
        section: search.section === "history" ? ("history" as const) : ("pending" as const),
      }
    : {};
  const backSearch = managerSearch;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [dateElected, setDateElected] = useState(kenyaTodayISO());
  const [membershipNumber, setMembershipNumber] = useState("");
  const [electedType, setElectedType] = useState<"FULL" | "COUNTRY" | "OVERSEAS" | "">("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const canChairElect = hasAnyRole(readUser(), ["CHAIRMAN", "ADMIN"]);

  const detail = useQuery({
    queryKey: ["applications", "detail", applicationId],
    queryFn: () => apiRequest<ApplicationDetailAdmin>(`/api/applications/${applicationId}`),
  });

  useEffect(() => {
    if (detail.data) setDraft(parseApplicationDraft(detail.data.formDataJson));
  }, [detail.data]);

  useEffect(() => {
    if (!fromManager || !search.edit) return;
    void navigate({
      to: "/members/$applicationId",
      params: { applicationId },
      search: {
        view: "manager" as const,
        section: search.section === "history" ? ("history" as const) : ("pending" as const),
      },
      replace: true,
    });
  }, [fromManager, search.edit, search.section, applicationId, navigate]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
    void queryClient.invalidateQueries({ queryKey: ["members"] });
  };

  const review = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/review`, {
        method: "POST",
        body: JSON.stringify({ reason: "Admin opened the application for review" }),
      }),
    onSuccess: () => {
      toast.success("Applicant is now under review.");
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["applications", "detail", applicationId] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const authorize = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/advance`, {
        method: "POST",
        body: JSON.stringify({ reason: "Authorized to the next stage after review" }),
      }),
    onSuccess: () => {
      const next = nextApplicationStage(detail.data?.statusCode);
      toast.success(
        next
          ? `Authorized. Application moved to ${next.stage}.`
          : "Applicant authorized to the next stage.",
      );
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["applications", "detail", applicationId] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const elect = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/elect`, {
        method: "POST",
        body: JSON.stringify({
          dateElected,
          membershipNumber: membershipNumber.trim(),
          electedMembershipType: electedType,
        }),
      }),
    onSuccess: () => {
      toast.success("Chairman election recorded. Membership type and number assigned.");
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["applications", "detail", applicationId] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const reject = useMutation({
    mutationFn: (reason: string) =>
      apiRequest(`/api/applications/${applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          statusCode: "Rejected",
          reason,
        }),
      }),
    onSuccess: () => {
      toast.success("Application rejected.");
      setRejectOpen(false);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["applications", "detail", applicationId] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const reopen = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          statusCode: "Committee",
          reason: "Reopened after committee rejection for correction and re-processing",
        }),
      }),
    onSuccess: () => {
      toast.success("Application reopened at Committee stage.");
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["applications", "detail", applicationId] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const requestUpdate = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/manager-requests`, {
        method: "POST",
        body: JSON.stringify({
          requestType: "details",
          message: requestNote.trim() || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Update request sent to the applicant.");
      setRequestOpen(false);
      setRequestNote("");
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const save = useMutation({
    mutationFn: (payload: ApplicationDraft) =>
      apiRequest(`/api/applications/${applicationId}`, {
        method: "PUT",
        body: JSON.stringify({
          formDataJson: JSON.stringify(payload),
          completedSteps: STEPS.filter((step) => step.key !== "review").map((step) => step.key),
          proposerProfileId: payload.supporters.proposer.memberProfileId
            ? Number(payload.supporters.proposer.memberProfileId)
            : undefined,
          seconderProfileId: payload.supporters.seconder.memberProfileId
            ? Number(payload.supporters.seconder.memberProfileId)
            : undefined,
        }),
      }),
    onSuccess: () => {
      toast.success("Applicant details updated.");
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({ statusCode: "Withdrawn", reason: "Deleted from applicant desk" }),
      }),
    onSuccess: () => {
      toast.success("Applicant record deleted.");
      void navigate({ to: "/members" });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  if (detail.isLoading) {
    return (
      <PageFrame width="lg">
        <PageBackLink to={backTo} search={backSearch} label={backLabel} />
        <p className="text-sm text-muted-foreground">Loading applicant details…</p>
      </PageFrame>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <PageFrame width="lg">
        <PageBackLink to={backTo} search={backSearch} label={backLabel} />
        <p className="text-sm text-muted-foreground">
          {detail.error ? extractErrorMessage(detail.error) : "Applicant record was not found."}
        </p>
      </PageFrame>
    );
  }

  const record = detail.data;
  const currentDraft = draft ?? parseApplicationDraft(record.formDataJson);
  const stage = displayApplicationStatus(record.statusCode, record.statusName);
  const next = nextApplicationStage(record.statusCode);
  const showReview = canStartReview(record.statusCode);
  const closed = CLOSED_APPLICATION_STATUSES.has(record.statusCode ?? "");
  const canElect =
    canChairElect &&
    (record.statusCode === "Waitlist" ||
      record.statusCode === "ElectionReview" ||
      record.statusCode === "TemporaryMember" ||
      record.statusCode === "Committee" ||
      record.statusCode === "CommitteeReview" ||
      record.statusCode === "Approved");
  const busy =
    review.isPending ||
    authorize.isPending ||
    elect.isPending ||
    reject.isPending ||
    remove.isPending ||
    reopen.isPending;

  return (
    <PageFrame width="lg">
      <PageBackLink to={backTo} search={backSearch} label={backLabel} />
      <PageHeader
        title={record.applicantName || `${currentDraft.personal.firstName} ${currentDraft.personal.lastName}`.trim() || "Applicant"}
        description={`${record.applicationNo} Â· ${stage} Â· Updated ${formatMembershipDate(record.updatedAt)}`}
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {fromManager ? (
              <Button
                variant="outline"
                disabled={closed || requestUpdate.isPending}
                onClick={() => setRequestOpen(true)}
              >
                {requestUpdate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Request update
              </Button>
            ) : editing ? (
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: "/members/$applicationId",
                    params: { applicationId },
                    search: {},
                  })
                }
              >
                View details
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: "/members/$applicationId",
                    params: { applicationId },
                    search: { edit: true },
                  })
                }
              >
                Edit / update
              </Button>
            )}
            {closed && record.statusCode === "Rejected" ? (
              <Button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Reopen this application after committee rejection? It will return to Committee.",
                    )
                  ) {
                    reopen.mutate();
                  }
                }}
              >
                {reopen.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Reopen after rejection
              </Button>
            ) : null}
            {fromManager ? null : showReview ? (
              <Button disabled={busy} onClick={() => review.mutate()}>
                {review.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {record.statusCode === "Endorsement" ? "Submit to manager" : "Review"}
              </Button>
            ) : null}
            {fromManager ? null : !showReview && next ? (
              <Button disabled={busy} onClick={() => authorize.mutate()}>
                {authorize.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {record.statusCode === "EndorsementReview" ? "Authorize to interview" : "Authorize"}
              </Button>
            ) : null}
            {fromManager ? null : canElect ? (
              <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                <label className="grid gap-1 text-xs">
                  Membership number
                  <input
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={membershipNumber}
                    onChange={(e) => setMembershipNumber(e.target.value)}
                    placeholder="Assigned by Chairman"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  Date Elected
                  <input
                    type="date"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={dateElected}
                    onChange={(e) => setDateElected(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  Elected type
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={electedType}
                    onChange={(e) =>
                      setElectedType(e.target.value as "FULL" | "COUNTRY" | "OVERSEAS" | "")
                    }
                  >
                    <option value="">Select…</option>
                    <option value="FULL">Full</option>
                    <option value="COUNTRY">Country</option>
                    <option value="OVERSEAS">Overseas</option>
                  </select>
                </label>
                <Button
                  variant={next ? "outline" : "default"}
                  disabled={busy || !membershipNumber.trim() || !dateElected || !electedType}
                  onClick={() => elect.mutate()}
                >
                  {elect.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Record Chairman election
                </Button>
              </div>
            ) : null}
            {!closed ? (
              <Button variant="destructive" disabled={busy} onClick={() => setRejectOpen(true)}>
                {reject.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Reject
              </Button>
            ) : null}
            {fromManager ? null : (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Delete this applicant record?")) remove.mutate();
              }}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
            )}
          </div>
        }
      />
      {fromManager ? (
        <StaffMembershipForm
          draft={currentDraft}
          onChange={setDraft}
          readOnly
          saving={false}
          onSave={() => undefined}
        />
      ) : editing ? (
        <StaffMembershipForm
          draft={currentDraft}
          onChange={setDraft}
          saving={save.isPending}
          saveLabel="Update details"
          onSave={() => save.mutateAsync(currentDraft)}
        />
      ) : (
        <div className="space-y-4">
          {record.statusCode === "Rejected" && record.lastRejectionReason ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
              <span className="font-semibold">Rejected: </span>
              {record.lastRejectionReason}
            </p>
          ) : null}
          <ApplicantReview
            applicationId={applicationId}
            draft={currentDraft}
            documents={record.documents ?? []}
          />
        </div>
      )}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request applicant update</DialogTitle>
            <DialogDescription>
              The applicant will get a notification and email to complete the missing details. You cannot edit their form from manager review.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm">
            <Label htmlFor="request-note">What should they update?</Label>
            <Textarea
              id="request-note"
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              placeholder="e.g. Confirm residential address and upload a clearer ID copy"
              rows={4}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={requestUpdate.isPending || requestNote.trim().length < 3}
              onClick={() => requestUpdate.mutate()}
            >
              {requestUpdate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RejectApplicationDialog
        open={rejectOpen}
        applicantLabel={record.applicantName || undefined}
        pending={reject.isPending}
        onOpenChange={setRejectOpen}
        onConfirm={(reason) => reject.mutate(reason)}
      />
    </PageFrame>
  );
}
