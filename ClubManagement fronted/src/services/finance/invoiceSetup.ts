import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/services/membership/api";
import { mergePaymentSetup, type PaymentSetup } from "@/utils/invoiceSetup";

export const invoiceSetupQueryKey = ["invoice-setup"] as const;

export async function fetchInvoiceSetup() {
  const row = await apiRequest<Partial<PaymentSetup>>("/api/finance/invoice-setup");
  return mergePaymentSetup(row);
}

export function saveInvoiceSetup(setup: PaymentSetup) {
  return apiRequest<PaymentSetup>("/api/finance/invoice-setup", {
    method: "PUT",
    body: JSON.stringify(setup),
  }).then((row) => mergePaymentSetup(row));
}

export function useInvoiceSetup() {
  return useQuery({
    queryKey: invoiceSetupQueryKey,
    queryFn: fetchInvoiceSetup,
    staleTime: 60_000,
  });
}
