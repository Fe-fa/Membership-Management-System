import { createFileRoute, redirect } from "@tanstack/react-router";
import { canVisitPath, homePathForUser, isReceptionistOnly, readUser } from "@/lib/auth";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (!canVisitPath(user, "/admin")) {
      throw redirect({ to: homePathForUser(user) });
    }
    if (isReceptionistOnly(user)) {
      throw redirect({ to: "/reception" });
    }
  },
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Aero Club of East Africa" },
      {
        name: "description",
        content:
          "Club operations portal for members, payments, governance, and accommodation at the Aero Club of East Africa.",
      },
      { property: "og:title", content: "ACEA Admin Dashboard" },
    ],
  }),
  component: AdminDashboardPage,
});
