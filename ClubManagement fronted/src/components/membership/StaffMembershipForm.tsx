import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { extractErrorMessage, uploadFile } from "@/services/membership/api";
import { EXISTING_MEMBER_STEPS, STEPS, stepIndex, type StepId } from "@/services/membership/steps";
import { validateSection, type ErrorMap } from "@/services/membership/useApplication";
import type { ApplicationDraft } from "@/services/membership/schema";
import {
  MembershipSteppedShell,
  membershipPhotoSrc,
  type MembershipListTo,
} from "./MembershipSteppedShell";
import { StepPersonal } from "./steps/StepPersonal";
import { StepFamily } from "./steps/StepFamily";
import { StepAviation } from "./steps/StepAviation";
import { StepMembership } from "./steps/StepMembership";
import { StepSupporters } from "./steps/StepSupporters";
import { StepClubs } from "./steps/StepClubs";
import { StepConsent } from "./steps/StepConsent";
import { StepReview } from "./steps/StepReview";

export type StaffFormVariant = "applicant" | "existingMember";

const existingMembershipSchema = z.object({
  membershipType: z.string().trim().min(1, "Membership type is required"),
  signatureDate: z.string().trim().min(1, "Joining date is required"),
});

function validateStaffSection(
  variant: StaffFormVariant,
  step: Exclude<StepId, "review">,
  value: unknown,
): ErrorMap {
  if (variant === "existingMember") {
    if (step === "supporters" || step === "consent") return {};
    if (step === "membership") {
      const result = existingMembershipSchema.safeParse(value);
      if (result.success) return {};
      const errors: ErrorMap = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "membershipType";
        if (!errors[key]) errors[key] = issue.message;
      }
      return errors;
    }
    const errors = { ...validateSection(step, value) };
    if (step === "personal") delete errors["photo"];
    return errors;
  }
  return validateSection(step, value);
}

export function StaffMembershipForm({
  draft,
  onChange,
  membershipNo,
  onMembershipNoChange,
  onSave,
  saving = false,
  saveLabel = "Update details",
  variant = "applicant",
  readOnly = false,
  profileStatus,
  profileMeta,
  headerActions,
  applicationId,
  listTo,
  listSearch,
  listLabel = "Back to List",
  badgeLabel,
  badgeValue,
}: {
  draft: ApplicationDraft;
  onChange: (next: ApplicationDraft) => void;
  membershipNo?: string;
  onMembershipNoChange?: (value: string) => void;
  onSave: () => Promise<void> | void;
  saving?: boolean;
  saveLabel?: string;
  variant?: StaffFormVariant;
  readOnly?: boolean;
  profileStatus?: string;
  profileMeta?: string;
  headerActions?: ReactNode;
  applicationId?: string | number | null;
  listTo?: MembershipListTo;
  listSearch?: Record<string, string | boolean | undefined>;
  listLabel?: string;
  badgeLabel?: string;
  badgeValue?: string;
}) {
  const formSteps = variant === "existingMember" ? EXISTING_MEMBER_STEPS : STEPS;
  const [step, setStep] = useState<StepId>("personal");
  const [errors, setErrors] = useState<ErrorMap>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const index = Math.max(0, stepIndex(step, formSteps));
  const displayName =
    [draft.personal.firstName, draft.personal.middleName, draft.personal.lastName]
      .filter((part) => part?.trim())
      .join(" ")
      .trim() || (variant === "existingMember" ? "New member" : "Applicant");
  const photoUrl = membershipPhotoSrc(draft.personal.photo?.url);

  const patchSection = useCallback(
    <K extends keyof ApplicationDraft>(section: K, value: Partial<ApplicationDraft[K]>) => {
      onChange({ ...draft, [section]: { ...draft[section], ...value } });
    },
    [draft, onChange],
  );

  const patch = useCallback(
    <K extends keyof ApplicationDraft>(section: K) =>
      (value: Partial<ApplicationDraft[K]>) =>
        patchSection(section, value),
    [patchSection],
  );

  const sectionStatus = useMemo(() => {
    const status = {} as Record<Exclude<StepId, "review">, boolean>;
    for (const item of STEPS) {
      if (item.key === "review") continue;
      const key = item.key as Exclude<StepId, "review">;
      if (variant === "existingMember" && (key === "supporters" || key === "consent")) {
        status[key] = true;
        continue;
      }
      status[key] = Object.keys(validateStaffSection(variant, key, draft[key])).length === 0;
    }
    return status;
  }, [draft, variant]);

  function go(next: StepId) {
    setErrors({});
    setStep(next);
  }

  async function onPhotoPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    try {
      const uploaded = await uploadFile(file, "photo");
      patchSection("personal", { photo: uploaded });
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function continueNext() {
    if (step !== "review" && !readOnly) {
      const key = step as Exclude<StepId, "review">;
      const nextErrors = validateStaffSection(variant, key, draft[key]);
      if (onMembershipNoChange && key === "membership" && !membershipNo?.trim()) {
        nextErrors["membershipNo"] = "Membership number is required";
      }
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        return;
      }
    }
    const nextIndex = Math.min(index + 1, formSteps.length - 1);
    go(formSteps[nextIndex]!.key);
  }

  const fields = (
    <>
      {step === "personal" ? (
        <StepPersonal
          value={draft.personal}
          errors={errors}
          onChange={patch("personal")}
          hidePhotoField
          hidePaymentUploads={variant === "existingMember"}
        />
      ) : null}
      {step === "family" ? <StepFamily value={draft.family} errors={errors} onChange={patch("family")} /> : null}
      {step === "aviation" ? <StepAviation value={draft.aviation} errors={errors} onChange={patch("aviation")} /> : null}
      {step === "membership" ? (
        <StepMembership
          value={draft.membership}
          errors={errors}
          onChange={patch("membership")}
          existingMemberMode={variant === "existingMember"}
          {...(onMembershipNoChange
            ? { membershipNo: membershipNo ?? "", onMembershipNoChange }
            : {})}
        />
      ) : null}
      {step === "supporters" && variant !== "existingMember" ? (
        <StepSupporters
          value={draft.supporters}
          errors={errors}
          onChange={patch("supporters")}
          applicationId={applicationId ?? null}
        />
      ) : null}
      {step === "clubs" ? <StepClubs value={draft.clubs} errors={errors} onChange={patch("clubs")} /> : null}
      {step === "consent" && variant !== "existingMember" ? (
        <StepConsent value={draft.consent} errors={errors} onChange={patch("consent")} />
      ) : null}
      {step === "review" ? (
        <StepReview
          draft={draft}
          sectionStatus={sectionStatus}
          onEdit={(key) => go(key)}
          hideSteps={variant === "existingMember" ? ["supporters", "consent"] : []}
          hidePaymentUploads={variant === "existingMember"}
        />
      ) : null}
    </>
  );

  const resolvedListTo: MembershipListTo =
    listTo ?? (variant === "existingMember" ? "/existing-members" : "/members");
  const resolvedBadgeLabel = badgeLabel ?? (variant === "existingMember" ? "Membership No" : "Application No");
  const resolvedBadgeValue =
    badgeValue?.trim() ||
    (variant === "existingMember" ? membershipNo?.trim() || "Entered on Membership step" : "Auto-generated");

  return (
    <MembershipSteppedShell
      displayName={displayName}
      subtitle={
        [profileStatus, profileMeta].filter(Boolean).join(" · ") ||
        (variant === "existingMember" ? "Create a new member record" : "Update this application")
      }
      badge={`${resolvedBadgeLabel}: ${resolvedBadgeValue}`}
      photoUrl={photoUrl}
      photoBusy={photoBusy}
      photoInputRef={photoInputRef}
      onPhotoPicked={(event) => void onPhotoPicked(event)}
      showPhotoUpload={!readOnly}
      photoError={step === "personal" ? errors["photo"] : undefined}
      headerActions={headerActions}
      listTo={resolvedListTo}
      listSearch={listSearch}
      listLabel={listLabel}
      steps={formSteps.map((item, i) => ({
        key: item.key,
        short: item.short,
        index: i,
        done: item.key !== "review" && sectionStatus[item.key as Exclude<StepId, "review">],
        active: item.key === step,
      }))}
      onStep={(key) => go(key as StepId)}
      readOnly={readOnly}
      footerEnd={
        step !== "review" ? (
          <Button type="button" className="rounded-full px-6" onClick={continueNext} disabled={saving}>
            Next <ArrowRight className="size-4" />
          </Button>
        ) : readOnly ? null : (
          <Button type="button" className="rounded-full px-6" disabled={saving} onClick={() => void onSave()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saveLabel}
          </Button>
        )
      }
    >
      {fields}
    </MembershipSteppedShell>
  );
}
