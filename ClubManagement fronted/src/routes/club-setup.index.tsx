import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/club-setup/")({
  beforeLoad: () => {
    throw redirect({ to: "/club-setup/countries" });
  },
});
