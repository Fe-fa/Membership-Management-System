import { createFileRoute } from "@tanstack/react-router";
import { UserManagementLayout } from "@/pages/admin/UserManagementLayout";

export const Route = createFileRoute("/user-management")({
  component: UserManagementLayout,
});
