import { createFileRoute } from "@tanstack/react-router";
import { SettingsHubPage } from "@/pages/settings/SettingsHubPage";

export const Route = createFileRoute("/settings/")({
  component: SettingsHubPage,
});
