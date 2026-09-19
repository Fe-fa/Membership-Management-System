import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [{ title: "Support" }],
  }),
  component: () => <Outlet />,
});
