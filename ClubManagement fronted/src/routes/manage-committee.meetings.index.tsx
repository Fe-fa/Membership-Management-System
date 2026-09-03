import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/manage-committee/meetings/")({
  beforeLoad: () => {
    throw redirect({ to: "/manage-committee/meetings/pending" });
  },
});
