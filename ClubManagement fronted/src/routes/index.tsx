import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  homePathForUser,
  isAuthenticated,
  isStaff,
  readPortalMode,
  readUser,
  subscribeAuthChanged,
} from "@/lib/auth";
import { LoginPage } from "@/pages/auth/LoginPage";
import { PortalHomePage } from "@/pages/member/PortalHomePage";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // Browser-only session. Guests stay on `/` and see the login form.
    if (typeof window === "undefined") return;
    if (!isAuthenticated()) return;
    const user = readUser();
    if (isStaff(user) && readPortalMode(user) === "admin") {
      throw redirect({ to: homePathForUser(user) });
    }
  },
  head: () => ({
    meta: [
      { title: "Aero Club of East Africa" },
      {
        name: "description",
        content:
          "Sign in to the Aero Club of East Africa portal. Applicants, members and staff each reach their own dashboard.",
      },
      { property: "og:title", content: "ACEA Portal" },
    ],
  }),
  component: IndexEntry,
});

/**
 * Avoid reading localStorage during SSR / first paint — that caused hydration
 * mismatches. After mount, listen for login/logout so we leave the login form.
 */
function IndexEntry() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAuthed(isAuthenticated());
      setReady(true);
    };
    sync();
    return subscribeAuthChanged(sync);
  }, []);

  if (!ready) {
    return <div className="min-h-screen bg-background" aria-busy="true" />;
  }
  if (!authed) return <LoginPage />;
  return <PortalHomePage />;
}
