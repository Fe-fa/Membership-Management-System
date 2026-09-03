import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/manage-committee/meetings")({
  head: () => ({
    meta: [{ title: "Meetings — Aero Club of East Africa" }],
  }),
  component: () => <Outlet />,
});
