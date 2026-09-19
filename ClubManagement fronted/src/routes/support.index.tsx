import { createFileRoute } from "@tanstack/react-router";

import { SupportHomePage } from "@/pages/admin/SupportPage";

export const Route = createFileRoute("/support/")({
  component: SupportHomePage,
});
