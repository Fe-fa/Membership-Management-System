import { createFileRoute } from "@tanstack/react-router";
import { PaymentPage } from "@/pages/member/PaymentPage";

export const Route = createFileRoute("/payment")({
  head: () => ({
    meta: [
      { title: "Payment — Aero Club of East Africa" },
      {
        name: "description",
        content: "Record and review your membership payments in one place.",
      },
    ],
  }),
  component: PaymentPage,
});
