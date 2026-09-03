import { createFileRoute } from "@tanstack/react-router";
import { UserManagementPage } from "@/pages/admin/UserManagementPage";

export const Route = createFileRoute("/user-management/")({
  head: () => ({
    meta: [{ title: "User management — Aero Club of East Africa" }],
  }),
  component: UserManagementPage,
});
