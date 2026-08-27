import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";

export const Route = createFileRoute("/admin")({
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
