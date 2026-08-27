import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { emptyDraft, type ApplicationDraft } from "@/services/membership/schema";
import type { MemberRow, MembershipTypeRow } from "@/services/admin/membershipDesk";
import { draftToMemberUpdate } from "@/services/admin/memberForm";
import { StaffMembershipForm } from "@/components/membership/StaffMembershipForm";
import { PageBackLink, PageFrame } from "@/components/layout/PageFrame";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export function RegisterMemberPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ApplicationDraft>(() => {
    const next = emptyDraft();
    next.membership.signatureDate = "";
    return next;
  });
  const [membershipNo, setMembershipNo] = useState("");

  const types = useQuery({
    queryKey: ["membership-types"],
    queryFn: () => apiRequest<MembershipTypeRow[]>("/api/membership-types"),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!membershipNo.trim()) throw new Error("Membership number is required.");
      if (!draft.membership.signatureDate?.trim()) {
        throw new Error("Joining date is required (the date this member actually joined the club).");
      }
      const typeId =
        types.data?.find(
          (row) =>
            row.code === draft.membership.membershipType ||
            row.name === draft.membership.membershipType,
        )?.membershipTypeId ?? types.data?.[0]?.membershipTypeId;
      if (!typeId) throw new Error("Select a membership class.");
      const created = await apiRequest<{
        member: MemberRow;
        username: string;
        inviteUrl: string;
        emailSent: boolean;
      }>("/api/membership-accounts/register-existing", {
        method: "POST",
        body: JSON.stringify({
          firstName: draft.personal.firstName,
          lastName: draft.personal.lastName,
          email: draft.personal.email,
          mobile: draft.personal.mobile || null,
          membershipNo: membershipNo.trim(),
          membershipTypeId: typeId,
          electionTypeId: 1,
          joinedDate: draft.membership.signatureDate,
        }),
      });
      await apiRequest(`/api/membership-accounts/${created.member.accountId}`, {
        method: "PUT",
        body: JSON.stringify(draftToMemberUpdate(draft, membershipNo.trim(), typeId)),
      });
      return created;
    },
    onSuccess: (result) => {
      toast.success(
        result.emailSent
          ? `Member registered. Username ${result.username}. Invite emailed.`
          : `Member registered. Username ${result.username}. Copy the set-password link from Existing members if needed.`,
      );
      void navigate({
        to: "/existing-members/$accountId",
        params: { accountId: String(result.member.accountId) },
        search: { mode: "view" },
      });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <PageFrame width="lg">
      <PageBackLink to="/existing-members" label="Back to existing members" />
      <StaffMembershipForm
        variant="existingMember"
        draft={draft}
        onChange={setDraft}
        membershipNo={membershipNo}
        onMembershipNoChange={setMembershipNo}
        saving={save.isPending}
        saveLabel="Create member account"
        onSave={() => save.mutateAsync()}
        profileStatus="New record"
        profileMeta="Membership number and joining date are entered on the Membership step"
      />
    </PageFrame>
  );
}
