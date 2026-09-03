import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Loader2, Save } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils/cn";
import { API_BASE, extractErrorMessage, uploadFile } from "@/services/membership/api";
import { EXISTING_MEMBER_STEPS, STEPS, stepIndex, type StepId } from "@/services/membership/steps";
import { validateSection, type ErrorMap } from "@/services/membership/useApplication";
import type { ApplicationDraft } from "@/services/membership/schema";
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
    if (step === "personal") delete errors.photo;
    return errors;
  }
  return validateSection(step, value);
}

function photoSrc(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
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
  const photoUrl = photoSrc(draft.personal.photo?.url);

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

  const countableSteps = formSteps.filter((item) => item.key !== "review");
  const completedCount = countableSteps.filter(
    (item) => sectionStatus[item.key as Exclude<StepId, "review">],
  ).length;

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
        nextErrors.membershipNo = "Membership number is required";
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
          hidePhotoField={variant === "existingMember"}
        />
      ) : null}
      {step === "family" ? <StepFamily value={draft.family} errors={errors} onChange={patch("family")} /> : null}
      {step === "aviation" ? <StepAviation value={draft.aviation} errors={errors} onChange={patch("aviation")} /> : null}
      {step === "membership" ? (
        <StepMembership
          value={draft.membership}
          errors={errors}
          onChange={patch("membership")}
          membershipNo={membershipNo}
          onMembershipNoChange={onMembershipNoChange}
          existingMemberMode={variant === "existingMember"}
        />
      ) : null}
      {step === "supporters" && variant !== "existingMember" ? (
        <StepSupporters value={draft.supporters} errors={errors} onChange={patch("supporters")} />
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
        />
      ) : null}
    </>
  );

  const footer = (
    <footer className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-5">
      <Button
        type="button"
        variant="outline"
        onClick={() => go(formSteps[Math.max(0, index - 1)]!.key)}
        disabled={index === 0 || saving}
      >
        <ArrowLeft className="size-4" /> Back
      </Button>
      {readOnly ? null : (
        <Button type="button" variant="ghost" disabled={saving} onClick={() => void onSave()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saveLabel}
        </Button>
      )}
      {step !== "review" ? (
        <Button type="button" className="ml-auto" onClick={continueNext} disabled={saving}>
          Continue <ArrowRight className="size-4" />
        </Button>
      ) : readOnly ? null : (
        <Button type="button" className="ml-auto" disabled={saving} onClick={() => void onSave()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saveLabel}
        </Button>
      )}
    </footer>
  );

  const stepper = formSteps.map((item, i) => {
    const done = item.key !== "review" && sectionStatus[item.key as Exclude<StepId, "review">];
    const active = item.key === step;
    return { item, i, done, active };
  });

  if (variant === "existingMember") {
    return (
      <div className="space-y-5">
        <section className="surface-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative shrink-0">
                <button
                  type="button"
                  className="grid size-24 place-items-center overflow-hidden rounded-full bg-[#d8dee6] text-xs font-medium text-muted-foreground"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoBusy}
                  title="Change photo"
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    "Photo"
                  )}
                </button>
                <button
                  type="button"
                  className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoBusy}
                  aria-label="Upload photo"
                >
                  {photoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void onPhotoPicked(event)}
                />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-3xl leading-tight sm:text-4xl">{displayName}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[profileStatus, profileMeta].filter(Boolean).join(" · ") || "Recording an existing member"}
                </p>
              </div>
            </div>
            {headerActions ? <div className="flex shrink-0 flex-wrap gap-2">{headerActions}</div> : null}
          </div>

          <div className="-mx-1 mt-5 overflow-x-auto pb-1">
            <ol className="flex min-w-max items-center gap-2 px-1">
              {stepper.map(({ item, i, done, active }) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => go(item.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : done
                          ? "border-emerald-200 bg-emerald-50 text-foreground hover:bg-emerald-100"
                          : "border-border bg-card text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-[11px] font-semibold",
                        active
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : done
                            ? "bg-success text-white"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {done && !active ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    {item.short}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="flex flex-col gap-3 rounded-xl bg-muted/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {completedCount} of {countableSteps.length} sections complete.
          </p>
          <div className="w-full sm:max-w-xs">
            <Progress value={(completedCount / Math.max(countableSteps.length, 1)) * 100} className="h-1.5" />
          </div>
        </div>

        <div className="surface-card p-5 sm:p-8">
          <header className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Step {index + 1} of {formSteps.length}
            </p>
            <h2 className="mt-1 text-3xl">{formSteps[index]!.title}</h2>
          </header>
          <fieldset disabled={readOnly} className={cn(readOnly && "disabled:opacity-100")}>
            {fields}
          </fieldset>
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? `${completedCount} of ${countableSteps.length} sections complete. View only — request the applicant to update anything missing.`
              : `${completedCount} of ${countableSteps.length} sections complete. Same fields as the applicant form${onMembershipNoChange ? ", plus membership number." : "."}`}
          </p>
          <div className="w-full lg:max-w-xs">
            <Progress value={(completedCount / Math.max(countableSteps.length, 1)) * 100} className="h-2" />
          </div>
        </div>
        <div className="-mx-1 mt-4 overflow-x-auto pb-1">
          <ol className="flex min-w-max items-stretch gap-2 px-1">
            {stepper.map(({ item, i, done, active }) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => go(item.key)}
                  className={cn(
                    "flex min-w-[9rem] items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : done
                        ? "border-border bg-secondary/50 text-foreground hover:bg-secondary"
                        : "border-border/70 bg-card text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      active
                        ? "border-primary-foreground/40 bg-primary-foreground/10"
                        : done
                          ? "border-success bg-success text-primary-foreground"
                          : "border-border bg-background",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="block truncate font-medium">{item.short}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="surface-card p-5 sm:p-7">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Step {index + 1} of {formSteps.length}
          </p>
          <h2 className="mt-1 text-2xl">{formSteps[index]!.title}</h2>
        </header>
        <fieldset disabled={readOnly} className={cn(readOnly && "disabled:opacity-100")}>
          {fields}
        </fieldset>
        {footer}
      </div>
    </div>
  );
}
