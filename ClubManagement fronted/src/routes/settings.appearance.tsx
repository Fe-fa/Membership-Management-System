import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettingsPage } from "@/pages/settings/AppearanceSettingsPage";

export const Route = createFileRoute("/settings/appearance")({
  head: () => ({ meta: [{ title: "Personalization — Aero Club of East Africa" }] }),
  component: AppearanceSettingsPage,
});
