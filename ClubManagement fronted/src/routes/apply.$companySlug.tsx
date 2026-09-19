import { createFileRoute } from "@tanstack/react-router";
import { ApplyRegisterPage } from "@/pages/auth/ApplyRegisterPage";

export const Route = createFileRoute("/apply/$companySlug")({
  head: () => ({ meta: [{ title: "Apply" }] }),
  component: ApplyRegisterPage,
});
