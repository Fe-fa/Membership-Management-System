import { createFileRoute } from "@tanstack/react-router";
import { AutomationsSettingsPage } from "@/pages/settings/AutomationsSettingsPage";

export const Route = createFileRoute("/settings/automations")({
  head: () => ({ meta: [{ title: "Automations — Aero Club of East Africa" }] }),
  component: AutomationsSettingsPage,
});
