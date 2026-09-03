import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApplicantReview } from "@/components/panels/ApplicantReview";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { StaffMembershipForm } from "@/components/membership/StaffMembershipForm";
import { Button } from "@/components/ui/button";
import { draftToMemberUpdate, memberProfileToDraft } from "@/services/admin/memberForm";
import {
  formatMembershipDate,
  type MemberProfile,
  type MembershipTypeRow,
} from "@/services/admin/membershipDesk";
import { emptyDraft, type ApplicationDraft } from "@/services/membership/schema";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

const routeApi = getRouteApi("/existing-members/$accountId");

export function ExistingMemberDetailPage() {
  const { accountId } = routeApi.useParams();
  const { mode } = routeApi.useSearch();
  const navigate = useNavigate({ from: "/existing-members/$accountId" });
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ApplicationDraft>(emptyDraft());
  const [membershipNo, setMembershipNo] = useState("");

  const profile = useQuery({
    queryKey: ["member-profile", accountId],
    queryFn: () => apiRequest<MemberProfile>(`/api/membership-accounts/${accountId}`),
  });
  const types = useQuery({
    queryKey: ["membership-types"],
    queryFn: () => apiRequest<MembershipTypeRow[]>("/api/membership-types"),
  });

  useEffect(() => {
    if (!profile.data) return;
    setDraft(memberProfileToDraft(profile.data));
    setMembershipNo(profile.data.membershipNo);
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => {
      const typeId =
        types.data?.find(
          (row) =>
            row.code === draft.membership.membershipType ||
            row.name === draft.membership.membershipType,
        )?.membershipTypeId ?? profile.data?.governance.membershipTypeId ?? 0;
      return apiRequest<MemberProfile>(`/api/membership-accounts/${accountId}`, {
        method: "PUT",
        body: JSON.stringify(draftToMemberUpdate(draft, membershipNo, typeId)),
      });
    },
    onSuccess: (data) => {
      toast.success("Member details updated.");
      setDraft(memberProfileToDraft(data));
      setMembershipNo(data.membershipNo);
      void queryClient.invalidateQueries({ queryKey: ["member-profile", accountId] });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => apiRequest(`/api/membership-accounts/${accountId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Member record deleted.");
      void navigate({ to: "/existing-members" });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  if (profile.isLoading) {
    return (
      <PageFrame width="lg">
        <PageBackLink to="/existing-members" label="Back to existing members" />
        <p className="text-sm text-muted-foreground">Loading member profile…</p>
      </PageFrame>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <PageFrame width="lg">
        <PageBackLink to="/existing-members" label="Back to existing members" />
        <p className="text-sm text-muted-foreground">
          {profile.error ? extractErrorMessage(profile.error) : "Member was not found."}
        </p>
      </PageFrame>
    );
  }

  const record = profile.data;

  return (
    <PageFrame width="lg">
      <PageBackLink to="/existing-members" label="Back to existing members" />
      {mode === "edit" ? (
        <StaffMembershipForm
          variant="existingMember"
          draft={draft}
          onChange={setDraft}
          membershipNo={membershipNo}
          onMembershipNoChange={setMembershipNo}
          saving={save.isPending}
          saveLabel="Update details"
          onSave={() => save.mutateAsync()}
          profileStatus={record.status}
          profileMeta={`Joined ${formatMembershipDate(record.joinedDate)}`}
          headerActions={
            <>
              <Button variant="outline" onClick={() => void navigate({ params: { accountId }, search: { mode: "view" } })}>
                View details
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Delete this member record? This cannot be undone from the register.")) {
                    remove.mutate();
                  }
                }}
              >
                {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete
              </Button>
            </>
          }
        />
      ) : (
        <>
          <PageHeader
            title={record.fullName || "Member"}
            description={[record.membershipNo, record.status, `Joined ${formatMembershipDate(record.joinedDate)}`].filter(Boolean).join(" · ")}
            actions={
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={() =>
                    void navigate({
                      params: { accountId },
                      search: { mode: "edit" },
                    })
                  }
                >
                  <Pencil className="size-4" />
                  Edit / update
                </Button>
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm("Delete this member record? This cannot be undone from the register.")) {
                      remove.mutate();
                    }
                  }}
                >
                  {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Delete
                </Button>
              </div>
            }
          />
          <ApplicantReview applicationId={String(record.applicationId ?? 0)} draft={draft} documents={[]} />
        </>
      )}
    </PageFrame>
  );
}
