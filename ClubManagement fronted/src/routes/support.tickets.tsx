import { createFileRoute } from "@tanstack/react-router";

import { MyTicketsPage } from "@/pages/support/MyTicketsPage";

export const Route = createFileRoute("/support/tickets")({
  validateSearch: (search: Record<string, unknown>) => ({
    scope: search.scope === "inbox" ? ("inbox" as const) : ("mine" as const),
  }),
  component: SupportTicketsRoute,
});

function SupportTicketsRoute() {
  const { scope } = Route.useSearch();
  return <MyTicketsPage scope={scope} />;
}
