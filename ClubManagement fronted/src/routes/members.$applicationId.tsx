import { createFileRoute } from "@tanstack/react-router";
import { ApplicantDetailPage } from "@/pages/admin/ApplicantDetailPage";

export const Route = createFileRoute("/members/$applicationId")({
  validateSearch: (search: Record<string, unknown>) => {
    const view = search.view === "manager" ? ("manager" as const) : undefined;
    const section =
      search.section === "pending" || search.section === "history"
        ? (search.section as "pending" | "history")
        : undefined;
    const edit = search.edit === true || search.edit === "true" || search.edit === "1";
    return {
      ...(view ? { view } : {}),
      ...(section ? { section } : {}),
      ...(edit ? { edit: true as const } : {}),
    };
  },
  head: () => ({
    meta: [{ title: "Applicant details — Aero Club of East Africa" }],
  }),
  component: ApplicantDetailPage,
});
