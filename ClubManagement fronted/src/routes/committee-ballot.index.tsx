import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/committee-ballot/")({
  beforeLoad: () => {
    throw redirect({ to: "/committee-ballot/attendance" });
  },
});
