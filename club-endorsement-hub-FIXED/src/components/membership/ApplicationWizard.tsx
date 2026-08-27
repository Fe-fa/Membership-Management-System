import { useCallback, useMemo } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Save, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils/cn";
import { extractErrorMessage } from "@/services/membership/api";
import { STEPS, stepIndex, type StepId } from "@/services/membership/steps";
import { useApplication } from "@/services/membership/useApplication";
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

  const index = stepIndex(step);
  const submitted = app.record?.status && app.record.status !== "Draft";

  const completedCount = useMemo(
    () =>
      STEPS.filter((s) => s.key !== "review" && sectionStatus[s.key as Exclude<StepId, "review">])
        .length,
    [sectionStatus],
  );

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

  return (
    <div className="space-y-6">
      <div className="surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {completedCount} of {STEPS.length - 1} sections complete
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Completed steps remain clickable so applicants can jump back and amend earlier answers.
            </p>
          </div>
          <div className="w-full lg:max-w-xs">
            <Progress value={(completedCount / (STEPS.length - 1)) * 100} className="h-2" />
          </div>
        </div>

        <div className="-mx-1 mt-4 overflow-x-auto pb-1">
          <ol className="flex min-w-max items-stretch gap-2 px-1">
            {STEPS.map((s, i) => {
              const done = s.key !== "review" && sectionStatus[s.key as Exclude<StepId, "review">];
              const active = s.key === step;
              const canJump = done || active;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => {
                      if (canJump) app.goTo(s.key);
                    }}
                    disabled={!canJump}
                    className={cn(
                      "flex min-w-[9rem] items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors sm:min-w-[10rem]",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : done
                          ? "border-border bg-secondary/50 text-foreground hover:bg-secondary"
                          : "border-border/70 bg-card text-muted-foreground",
                      !canJump && "cursor-not-allowed opacity-70",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        active
                          ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground"
                          : done
                            ? "border-success bg-success text-primary-foreground"
                            : "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.short}</span>
                      <span className={cn("block truncate text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>Step {i + 1}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        {submitted && (
          <div className="rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm">
            Application <strong>{app.record?.reference}</strong> was submitted on{" "}
            {new Date(app.record!.submittedAt ?? Date.now()).toLocaleDateString()}. Further edits
            are saved as amendments for the Membership Desk.
          </div>
        )}

        {app.isSubmitting && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
            <div>
              <p className="font-semibold">Submitting application…</p>
              <p className="mt-0.5 text-muted-foreground">
                Your details are being validated and saved. Please keep this page open until confirmation appears.
              </p>
            </div>
          </div>
        )}

        {submitError && step === "review" && (
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
            ></button>
          </div>
        )}

        <div className="surface-card p-5 sm:p-7">
          <header className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Step {index + 1} of {STEPS.length}
            </p>
            <h2 className="mt-1 text-2xl">{STEPS[index]!.title}</h2>
          </header>

          {step === "personal" && (
            <StepPersonal value={draft.personal} errors={errors} onChange={patch("personal")} />
          )}
          {step === "family" && (
            <StepFamily value={draft.family} errors={errors} onChange={patch("family")} />
          )}
          {step === "aviation" && (
            <StepAviation value={draft.aviation} errors={errors} onChange={patch("aviation")} />
          )}
          {step === "membership" && (
            <StepMembership
              value={draft.membership}
              errors={errors}
              onChange={patch("membership")}
            />
          )}
          {step === "supporters" && (
            <StepSupporters
              value={draft.supporters}
              errors={errors}
              onChange={patch("supporters")}
            />
          )}
          {step === "clubs" && (
            <StepClubs value={draft.clubs} errors={errors} onChange={patch("clubs")} />
          )}
          {step === "consent" && (
            <StepConsent value={draft.consent} errors={errors} onChange={patch("consent")} />
          )}
          {step === "review" && (
            <StepReview draft={draft} sectionStatus={sectionStatus} onEdit={(s) => app.goTo(s)} />
          )}

          <footer className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={app.back} disabled={index === 0 || app.isSubmitting}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button type="button" variant="ghost" onClick={handleSave} disabled={app.isSaving || app.isSubmitting}>
              {app.isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}{" "}
              Save progress
            </Button>
            <div className="ml-auto flex gap-3">
              {step === "review" ? (
                <Button type="button" onClick={handleSubmit} disabled={app.isSubmitting}>
                  {app.isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {app.readyToSubmit ? "Submit application" : "Check & submit"}
                </Button>
              ) : (
                <Button type="button" onClick={() => app.next()} disabled={app.isSubmitting}>
                  Save & continue <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
