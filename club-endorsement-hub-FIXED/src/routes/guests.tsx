import { createFileRoute } from "@tanstack/react-router";
import { GuestsPage } from "@/pages/member/GuestsPage";

export const Route = createFileRoute("/guests")({
  component: GuestsPage,
});
