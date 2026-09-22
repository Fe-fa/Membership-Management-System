import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/existing-members/privileges")({
  component: () => <Outlet />,
});
