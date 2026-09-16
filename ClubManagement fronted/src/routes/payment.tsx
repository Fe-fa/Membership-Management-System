import { createFileRoute } from "@tanstack/react-router";
import { PaymentPage } from "@/pages/member/PaymentPage";

export type PaymentSearch = {
  purpose?: "joining" | "annual" | "accommodation" | "corkage" | "other";
  amount?: number;
  nmId?: number;
  desc?: string;
};

export const Route = createFileRoute("/payment")({
  validateSearch: (search: Record<string, unknown>): PaymentSearch => ({
    purpose:
      search.purpose === "joining" ||
      search.purpose === "annual" ||
      search.purpose === "accommodation" ||
      search.purpose === "corkage" ||
      search.purpose === "other"
        ? search.purpose
        : undefined,
    amount: typeof search.amount === "number" ? search.amount : Number(search.amount) || undefined,
    nmId: typeof search.nmId === "number" ? search.nmId : Number(search.nmId) || undefined,
    desc: typeof search.desc === "string" ? search.desc : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payment" },
      {
        name: "description",
        content: "Record and review your membership payments in one place.",
      },
    ],
  }),
  component: PaymentPage,
});
