import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/existing-members/privileges/")({
  beforeLoad: () => {
    throw redirect({ to: "/existing-members", search: { tab: "privileges" } });
  },
});
