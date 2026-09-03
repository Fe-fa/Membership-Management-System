import { createFileRoute, redirect } from "@tanstack/react-router";
import { homePathForUser, isAuthenticated, readUser } from "@/lib/auth";
import { LoginPage } from "@/pages/auth/LoginPage";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (isAuthenticated()) {
      throw redirect({ to: homePathForUser(readUser()) });
    }
    // Prefer the root URL as the sign-in entry point.
    throw redirect({ to: "/" });
  },
  component: LoginPage,
});
