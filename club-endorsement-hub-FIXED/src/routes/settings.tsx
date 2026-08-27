import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/pages/admin/SettingsPage";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Setting — Aero Club of East Africa" }],
  }),
  component: SettingsPage,
});
