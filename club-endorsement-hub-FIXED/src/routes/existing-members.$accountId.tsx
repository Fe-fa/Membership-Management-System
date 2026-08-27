import { createFileRoute } from "@tanstack/react-router";
import { ExistingMemberDetailPage } from "@/pages/admin/ExistingMemberDetailPage";

export const Route = createFileRoute("/existing-members/$accountId")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "edit" ? ("edit" as const) : ("view" as const),
  }),
  head: () => ({
    meta: [{ title: "Member profile — Aero Club of East Africa" }],
  }),
  component: ExistingMemberDetailPage,
});
