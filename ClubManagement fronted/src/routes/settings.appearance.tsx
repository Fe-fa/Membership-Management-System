import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettingsPage } from "@/pages/settings/AppearanceSettingsPage";

export const Route = createFileRoute("/settings/appearance")({
  head: () => ({ meta: [{ title: "Personalization" }] }),
  component: AppearanceSettingsPage,
});
