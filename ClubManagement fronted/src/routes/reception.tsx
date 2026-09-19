import { createFileRoute } from "@tanstack/react-router";
import { ReceptionDashboardPage } from "@/pages/admin/ReceptionDashboardPage";

const SECTIONS = ["lookup", "visit", "onsite", "policy", "dashboard"] as const;

export const Route = createFileRoute("/reception")({
  validateSearch: (search: Record<string, unknown>) => {
    const section = String(search.section ?? "");
    if ((SECTIONS as readonly string[]).includes(section)) return { section };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Reception dashboard" },
      { name: "description", content: "Register guests against an existing member and keep the digital guest book." },
    ],
  }),
  component: ReceptionDashboardPage,
});
