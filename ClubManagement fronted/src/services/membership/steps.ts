export const STEPS = [
  { key: "personal", title: "Personal details", short: "Personal" },
  { key: "family", title: "Marital & family status", short: "Family" },
  { key: "aviation", title: "Aviation affiliation", short: "Aviation" },
  { key: "membership", title: "Membership type", short: "Membership" },
  { key: "supporters", title: "Proposer & seconder", short: "Support" },
  { key: "clubs", title: "Other club memberships", short: "Clubs" },
  { key: "consent", title: "Data consent & declaration", short: "Consent" },
  { key: "review", title: "Review & submit", short: "Review" },
] as const;

export const EXISTING_MEMBER_STEPS = [
  { key: "personal", title: "Personal details", short: "Personal" },
  { key: "family", title: "Marital & family status", short: "Family" },
  { key: "aviation", title: "Aviation affiliation", short: "Aviation" },
  { key: "membership", title: "Membership type", short: "Membership" },
  { key: "clubs", title: "Other club memberships", short: "Clubs" },
  { key: "review", title: "Review & save", short: "Review" },
] as const satisfies ReadonlyArray<(typeof STEPS)[number]>;

export type StepId = (typeof STEPS)[number]["key"];
export const stepIndex = (key: StepId, steps: ReadonlyArray<{ key: StepId }> = STEPS) =>
  steps.findIndex((s) => s.key === key);
