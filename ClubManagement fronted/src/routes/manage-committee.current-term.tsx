import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/manage-committee/current-term")({
  beforeLoad: () => {
    throw redirect({ to: "/manage-committee/new-term" });
  },
});
