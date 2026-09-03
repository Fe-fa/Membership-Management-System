import { createFileRoute } from "@tanstack/react-router";
import { UserDetailPage } from "@/pages/admin/UserDetailPage";

export const Route = createFileRoute("/user-management/$userAccountId")({
  head: () => ({
    meta: [{ title: "User details — Aero Club of East Africa" }],
  }),
  component: UserDetailPage,
});
