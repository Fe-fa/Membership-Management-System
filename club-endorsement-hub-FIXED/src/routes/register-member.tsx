import { createFileRoute } from "@tanstack/react-router";
import { RegisterMemberPage } from "@/pages/admin/RegisterMemberPage";

export const Route = createFileRoute("/register-member")({
  head: () => ({
    meta: [{ title: "Register existing member — Aero Club of East Africa" }],
  }),
  component: RegisterMemberPage,
});
