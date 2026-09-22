import { useCallback, useRef, useState } from "react";
import { ArrowRight, Loader2, Save, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { extractErrorMessage, uploadFile } from "@/services/membership/api";
import { STEPS, type StepId } from "@/services/membership/steps";
import { useApplication } from "@/services/membership/useApplication";
import { MembershipSteppedShell, membershipPhotoSrc } from "./MembershipSteppedShell";
import { StepPersonal } from "./steps/StepPersonal";
import { StepFamily } from "./steps/StepFamily";
import { StepAviation } from "./steps/StepAviation";
import { StepMembership } from "./steps/StepMembership";
import { StepSupporters } from "./steps/StepSupporters";
import { StepClubs } from "./steps/StepClubs";
import { StepConsent } from "./steps/StepConsent";
import { StepReview } from "./steps/StepReview";

export function ApplicationWizard() {
  const app = useApplication();
  const { draft, step, errors, patchSection, sectionStatus, submitError } = app;
  const updating = Boolean(app.record?.id && app.record.status !== "Draft");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const displayName =
    [draft.personal.firstName, draft.personal.middleName, draft.personal.lastName]
      .filter((part) => part?.trim())
      .join(" ")
      .trim() || (updating ? "Update application" : "New application");

  const handleSave = useCallback(async () => {
    try {
      await app.saveAndExit();
      toast.success("Progress saved", {
        description: "You can return to this application at any time.",
      });
    } catch (err) {
      toast.error("We couldn't save your progress", {
        description: extractErrorMessage(err),
      });
    }
  }, [app]);

  const handleSaveUpdates = useCallback(async () => {
    try {
      await app.saveAndExit();
      toast.success("Application updated", {
        description: "Your existing application was saved. You did not start a new one.",
      });
    } catch (err) {
      toast.error("We couldn't save your updates", {
        description: extractErrorMessage(err),
      });
    }
  }, [app]);

  const handleSubmit = useCallback(async () => {
    try {
      const result = await app.submit();
      if (!result) {
        if (app.submitError) {
          toast.error("The server rejected your application", {
            description: app.submitError,
          });
          app.dismissSubmitError();
        } else {
          toast.error("Some sections are incomplete", {
            description: "We've taken you to the first section that needs attention.",
          });
        }
        return;
      }
      toast.success(`Application ${result.reference} submitted`, {
        description: "The Membership Desk will be in touch after committee review.",
      });
    } catch (err) {
      toast.error("Submission failed", { description: extractErrorMessage(err) });
    }
  }, [app]);

  const patch = useCallback(
    <K extends keyof typeof draft>(section: K) =>
      (value: Partial<(typeof draft)[K]>) =>
        patchSection(section, value),
    [patchSection],
  );

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

  return (
    <MembershipSteppedShell
      displayName={displayName}
      subtitle={
        updating
          ? "Edit the requested details and save. This is the same application — you are not starting a new one."
          : "Complete each step to create your membership application."
      }
      badge={`Application No: ${app.record?.reference?.trim() || "Auto-generated"}`}
      photoUrl={membershipPhotoSrc(draft.personal.photo?.url)}
      photoBusy={photoBusy}
      photoInputRef={photoInputRef}
      onPhotoPicked={(event) => void onPhotoPicked(event)}
      photoError={step === "personal" ? errors["photo"] : undefined}
      listTo="/applications"
      steps={STEPS.map((item, i) => {
        const done = item.key !== "review" && sectionStatus[item.key as Exclude<StepId, "review">];
        const active = item.key === step;
        return {
          key: item.key,
          short: item.short,
          index: i,
          done,
          active,
          disabled: !(updating || done || active),
        };
      })}
      onStep={(key) => {
        const item = STEPS.find((s) => s.key === key);
        if (!item) return;
        const done = item.key !== "review" && sectionStatus[item.key as Exclude<StepId, "review">];
        const active = item.key === step;
        if (updating || done || active) app.goTo(item.key);
      }}
      notices={
        <>
          {updating ? (
            <div className="rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm">
              Updating <strong>{app.record?.reference}</strong>. Change the requested section and save.
              This is the same application — you are not starting the process again.
            </div>
          ) : null}
          {app.isSubmitting ? (
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
              <div>
                <p className="font-semibold">Submitting application…</p>
                <p className="mt-0.5 text-muted-foreground">
                  Your details are being validated and saved. Please keep this page open until confirmation appears.
                </p>
              </div>
            </div>
          ) : null}
          {submitError && step === "review" ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">The server rejected your application</p>
                <p className="mt-0.5 text-destructive/90">{submitError}</p>
              </div>
              <button
                type="button"
                onClick={app.dismissSubmitError}
                className="text-destructive/70 hover:text-destructive"
                aria-label="Dismiss"
              />
            </div>
          ) : null}
        </>
      }
      footerStart={
        <Button type="button" variant="ghost" onClick={handleSave} disabled={app.isSaving || app.isSubmitting}>
          {app.isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save progress
        </Button>
      }
      footerEnd={
        step === "review" ? (
          updating ? (
            <Button type="button" className="rounded-full px-6" onClick={handleSaveUpdates} disabled={app.isSaving}>
              {app.isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save updates
            </Button>
          ) : (
            <Button type="button" className="rounded-full px-6" onClick={handleSubmit} disabled={app.isSubmitting}>
              {app.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {app.readyToSubmit ? "Submit application" : "Check & submit"}
            </Button>
          )
        ) : (
          <Button
            type="button"
            className="rounded-full px-6"
            onClick={() => app.next()}
            disabled={app.isSubmitting || app.isSaving}
          >
            Next <ArrowRight className="size-4" />
          </Button>
        )
      }
    >
      {step === "personal" && (
        <StepPersonal
          value={draft.personal}
          errors={errors}
          onChange={patch("personal")}
          hidePhotoField
          hidePaymentUploads={false}
        />
      )}
      {step === "family" && <StepFamily value={draft.family} errors={errors} onChange={patch("family")} />}
      {step === "aviation" && (
        <StepAviation value={draft.aviation} errors={errors} onChange={patch("aviation")} />
      )}
      {step === "membership" && (
        <StepMembership value={draft.membership} errors={errors} onChange={patch("membership")} />
      )}
      {step === "supporters" && (
        <StepSupporters
          value={draft.supporters}
          errors={errors}
          onChange={patch("supporters")}
          applicationId={app.record?.id ?? null}
        />
      )}
      {step === "clubs" && <StepClubs value={draft.clubs} errors={errors} onChange={patch("clubs")} />}
      {step === "consent" && <StepConsent value={draft.consent} errors={errors} onChange={patch("consent")} />}
      {step === "review" && <StepReview draft={draft} sectionStatus={sectionStatus} onEdit={(s) => app.goTo(s)} />}
    </MembershipSteppedShell>
  );
}
