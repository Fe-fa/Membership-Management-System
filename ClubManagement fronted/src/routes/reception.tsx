import { createFileRoute } from "@tanstack/react-router";
import { ReceptionDashboardPage } from "@/pages/admin/ReceptionDashboardPage";

const SECTIONS = ["lookup", "visit", "onsite", "policy"] as const;

export const Route = createFileRoute("/reception")({
  validateSearch: (search: Record<string, unknown>) => {
    const section = String(search.section ?? "");
    if ((SECTIONS as readonly string[]).includes(section)) return { section };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Reception dashboard — Aero Club of East Africa" },
      { name: "description", content: "Guest Book: introduce guests and log club visits." },
    ],
  }),
  component: ReceptionDashboardPage,
});
