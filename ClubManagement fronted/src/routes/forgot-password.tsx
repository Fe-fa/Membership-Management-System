import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : "",
  }),
  component: function ForgotPasswordRoute() {
    const { email } = Route.useSearch();
    return <ForgotPasswordPage initialEmail={email} />;
  },
});
