import { getRouteApi, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApplicantReview, parseApplicationDraft } from "@/components/panels/ApplicantReview";
import { ManagerStagePanel } from "@/components/admin/ManagerStagePanel";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { StaffMembershipForm } from "@/components/membership/StaffMembershipForm";
import { Button } from "@/components/ui/button";
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
  const search = useSearch({ strict: false }) as { edit?: boolean; view?: string };
  const editing = Boolean(search.edit);
  const fromManager = search.view === "manager";
  const backTo = "/members";
  const backLabel = fromManager ? "Back to Notification" : "Back to pending applications";
  const backSearch = fromManager ? { view: "manager" as const } : {};
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [dateElected, setDateElected] = useState(kenyaTodayISO());
  const [membershipNumber, setMembershipNumber] = useState("");
  const [electedType, setElectedType] = useState<"FULL" | "COUNTRY" | "OVERSEAS" | "">("");
  const canChairElect = hasAnyRole(readUser(), ["CHAIRMAN", "ADMIN"]);

  const detail = useQuery({
    queryKey: ["applications", "detail", applicationId],
    queryFn: () => apiRequest<ApplicationDetailAdmin>(`/api/applications/${applicationId}`),
  });

  useEffect(() => {
    if (detail.data) setDraft(parseApplicationDraft(detail.data.formDataJson));
  }, [detail.data]);

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
    mutationFn: () =>
      apiRequest(`/api/applications/${applicationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          statusCode: "Rejected",
          reason: "Rejected after reviewing application details",
        }),
      }),
    onSuccess: () => {
      toast.success("Application rejected.");
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
            {editing ? (
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: "/members/$applicationId",
                    params: { applicationId },
                    search: fromManager ? { view: "manager" } : {},
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
                    search: fromManager ? { view: "manager", edit: true } : { edit: true },
                  })
                }
              >
                <Pencil className="size-4" />
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
            {showReview ? (
              <Button disabled={busy} onClick={() => review.mutate()}>
                {review.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {record.statusCode === "Endorsement" ? "Submit to manager" : "Review"}
              </Button>
            ) : null}
            {!showReview && next ? (
              <Button disabled={busy} onClick={() => authorize.mutate()}>
                {authorize.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {record.statusCode === "EndorsementReview" ? "Authorize to interview" : "Authorize"}
              </Button>
            ) : null}
            {canElect ? (
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
              <Button variant="destructive" disabled={busy} onClick={() => reject.mutate()}>
                {reject.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Reject
              </Button>
            ) : null}
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
          </div>
        }
      />
      {editing ? (
        <StaffMembershipForm
          draft={currentDraft}
          onChange={setDraft}
          saving={save.isPending}
          saveLabel="Update details"
          onSave={() => save.mutateAsync(currentDraft)}
        />
      ) : (
        <div className="space-y-4">
          {(record.statusCode === "Endorsement" ||
            record.statusCode === "EndorsementReview" ||
            record.statusCode === "Interview") && (
            <ManagerStagePanel applicationId={applicationId} endorsements={record.endorsements} />
          )}
          <ApplicantReview
            applicationId={applicationId}
            draft={currentDraft}
            documents={record.documents ?? []}
          />
        </div>
      )}
    </PageFrame>
  );
}
