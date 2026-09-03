import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ZodTypeAny } from "zod";

import { fetchApplication, saveDraft, submitApplication, type ApplicationRecord } from "./api";
import { readUser } from "@/lib/auth";
import {
  applicationSchema,
  aviationSchema,
  clubsSchema,
  consentSchema,
  emptyDraft,
  familySchema,
  membershipSchema,
  normalizeDraft,
  personalSchema,
  supportersSchema,
  type ApplicationDraft,
} from "./schema";
import { STEPS, stepIndex, type StepId } from "./steps";

export type ErrorMap = Record<string, string>;

const SECTION_SCHEMAS: Record<Exclude<StepId, "review">, ZodTypeAny> = {
  personal: personalSchema,
  family: familySchema,
  aviation: aviationSchema,
  membership: membershipSchema,
  supporters: supportersSchema,
  clubs: clubsSchema,
  consent: consentSchema,
};

export function validateSection(step: Exclude<StepId, "review">, value: unknown): ErrorMap {
  const result = SECTION_SCHEMAS[step].safeParse(value);
  if (result.success) return {};
  const errors: ErrorMap = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_root";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function applicationQueryKey(userId?: number | null) {
  return ["membership", "application", userId ?? "anon"] as const;
}

export function useApplication() {
  const queryClient = useQueryClient();
  const userId = readUser()?.userAccountId ?? null;
  const queryKey = applicationQueryKey(userId);
  const { data: record, isLoading } = useQuery({
    queryKey,
    queryFn: fetchApplication,
    staleTime: 30_000,
    enabled: userId != null,
  });

  const [draft, setDraft] = useState<ApplicationDraft>(emptyDraft);
  const [completed, setCompleted] = useState<StepId[]>([]);
  const [step, setStep] = useState<StepId>("personal");
  const [errors, setErrors] = useState<ErrorMap>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(emptyDraft());
    setCompleted([]);
    setStep("personal");
    setErrors({});
  }, [userId]);

  useEffect(() => {
    if (!record?.id) return;
    setDraft(normalizeDraft({ ...emptyDraft(), ...record.draft }));
    setCompleted((record.completedSteps as StepId[]) ?? []);
    if (record.status && record.status !== "Draft") {
      setStep("review");
    }
  }, [userId, record?.id, record?.status]);

  const saveMutation = useMutation({
    mutationFn: saveDraft,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      void queryClient.invalidateQueries({ queryKey: ["member-notifications"] });
      setSaveError(null);
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "Could not save your progress.");
    },
  });

  const submitMutation = useMutation({
    mutationFn: ({
      draft,
      completedSteps,
    }: {
      draft: ApplicationDraft;
      completedSteps: string[];
    }) => submitApplication(draft, completedSteps),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["member-notifications"] });
      setSubmitError(null);
    },
    onError: (err) => {
      setSubmitError(err instanceof Error ? err.message : "Submission was rejected by the server.");
    },
  });

  const patchSection = useCallback(
    <K extends keyof ApplicationDraft>(section: K, patch: Partial<ApplicationDraft[K]>) => {
      setDraft((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
    },
    [],
  );

  const saveProgress = useCallback(
    (nextCompleted: StepId[], nextDraft: ApplicationDraft) =>
      saveMutation.mutateAsync({ draft: nextDraft, completedSteps: nextCompleted }),
    [saveMutation],
  );

  const goTo = useCallback((next: StepId) => {
    setErrors({});
    setSubmitError(null);
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const next = useCallback(() => {
    if (step === "review") return;
    const found = validateSection(step, draft[step]);
    setErrors(found);
    if (Object.keys(found).length > 0) return false;
    const nextCompleted = completed.includes(step) ? completed : [...completed, step];
    setCompleted(nextCompleted);
    void saveProgress(nextCompleted, draft);
    const target = STEPS[Math.min(stepIndex(step) + 1, STEPS.length - 1)]!.key;
    goTo(target);
    return true;
  }, [completed, draft, goTo, saveProgress, step]);

  const back = useCallback(() => {
    const target = STEPS[Math.max(stepIndex(step) - 1, 0)]!.key;
    goTo(target);
  }, [goTo, step]);

  const saveAndExit = useCallback(
    () => saveProgress(completed, draft),
    [completed, draft, saveProgress],
  );

  const sectionStatus = useMemo(() => {
    const status = {} as Record<Exclude<StepId, "review">, boolean>;
    for (const s of STEPS) {
      if (s.key === "review") continue;
      status[s.key] =
        completed.includes(s.key) && Object.keys(validateSection(s.key, draft[s.key])).length === 0;
    }
    return status;
  }, [completed, draft]);

  const readyToSubmit = useMemo(() => applicationSchema.safeParse(draft).success, [draft]);

  const submit = useCallback(async () => {
    setSubmitError(null);
    const parsed = applicationSchema.safeParse(draft);
    if (!parsed.success) {
      const firstIncomplete = STEPS.find(
        (s) => s.key !== "review" && !sectionStatus[s.key as Exclude<StepId, "review">],
      );
      if (firstIncomplete) goTo(firstIncomplete.key);
      return null;
    }
    try {
      return await submitMutation.mutateAsync({ draft, completedSteps: completed });
    } catch (err) {
      // submitMutation.onError already set submitError for the wizard toast;
      // rethrow is not needed because the wizard reads submitError directly.
      return null;
    }
  }, [completed, draft, goTo, sectionStatus, submitMutation]);

  const dismissSubmitError = useCallback(() => setSubmitError(null), []);
  const dismissSaveError = useCallback(() => setSaveError(null), []);

  return {
    record: (record ?? null) as ApplicationRecord | null,
    isLoading,
    draft,
    step,
    errors,
    completed,
    sectionStatus,
    readyToSubmit,
    isSaving: saveMutation.isPending,
    isSubmitting: submitMutation.isPending,
    saveError,
    submitError,
    dismissSaveError,
    dismissSubmitError,
    patchSection,
    setDraft,
    goTo,
    next,
    back,
    saveAndExit,
    submit,
  };
}

export type ApplicationController = ReturnType<typeof useApplication>;
