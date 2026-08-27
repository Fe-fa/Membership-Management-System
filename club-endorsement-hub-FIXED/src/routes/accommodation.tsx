import { createFileRoute } from "@tanstack/react-router";
import { AccommodationPage } from "@/pages/member/AccommodationPage";

export const Route = createFileRoute("/accommodation")({
  head: () => ({
    meta: [{ title: "Accommodation & Facilities — Aero Club of East Africa" }],
  }),
  component: AccommodationPage,
});
