import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/pages/member/ProfilePage";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "My Profile — Aero Club of East Africa" }],
  }),
  component: ProfilePage,
});
