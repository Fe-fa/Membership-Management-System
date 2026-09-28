import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAuthenticated, homePathForUser, readUser } from "@/lib/auth";
import { VerifyEmailPage } from "@/pages/auth/VerifyEmailPage";

type VerifySearch = { email: string };

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): VerifySearch => ({
    email: typeof search.email === "string" ? search.email : "",
  }),
  beforeLoad: ({ search }) => {
    if (typeof window === "undefined") return;
    if (isAuthenticated()) throw redirect({ to: homePathForUser(readUser()) });
    if (!search.email) throw redirect({ to: "/register" });
  },
  component: function VerifyRoute() {
    const { email } = Route.useSearch();
    return <VerifyEmailPage email={email} />;
  },
});
