import { createFileRoute } from "@tanstack/react-router";

import { CreateTicketPage } from "@/pages/support/CreateTicketPage";

export const Route = createFileRoute("/support/new")({
  component: CreateTicketPage,
});
