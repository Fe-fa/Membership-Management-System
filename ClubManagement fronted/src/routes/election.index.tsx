import { createFileRoute, redirect } from "@tanstack/react-router";
import { ElectionPage } from "@/pages/member/ElectionPage";
import { isStaff, readPortalMode, readUser } from "@/lib/auth";

export const Route = createFileRoute("/election/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = readUser();
    if (isStaff(user) && readPortalMode(user) === "admin") {
      throw redirect({ to: "/election/notice" });
    }
  },
  head: () => ({
    meta: [{ title: "AGM/EGM Election — Aero Club of East Africa" }],
  }),
  component: ElectionPage,
});
