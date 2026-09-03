import { createFileRoute } from "@tanstack/react-router";
import { PrivacySettingsPage } from "@/pages/settings/PrivacySettingsPage";

export const Route = createFileRoute("/settings/privacy")({
  head: () => ({ meta: [{ title: "Privacy — Aero Club of East Africa" }] }),
  component: PrivacySettingsPage,
});
