import { createFileRoute } from "@tanstack/react-router";
import { SetPasswordPage } from "@/pages/auth/SetPasswordPage";

export const Route = createFileRoute("/set-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: SetPasswordPage,
});
