import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiRequest, extractErrorMessage } from "@/services/membership/api";

import type {
  ApplicationDues,
  LookupOption,
  MemberPayPayload,
  MemberSubscription,
  MpesaStkResult,
  PaymentHistoryRow,
} from "./types";
import { sortPaymentMethods } from "./types";

export function useMemberSubscription() {
  return useQuery({
    queryKey: ["member-subscription"],
    queryFn: () => apiRequest<MemberSubscription>("/api/members/me/subscription"),
  });
}

export function useMemberPaymentHistory() {
  return useQuery({
    queryKey: ["member-payments"],
    queryFn: () => apiRequest<PaymentHistoryRow[]>("/api/members/me/payments"),
  });
}

export function useApplicationDues(applicationId: number) {
  return useQuery({
    queryKey: ["application-dues", applicationId],
    queryFn: () => apiRequest<ApplicationDues>(`/api/applications/${applicationId}/dues`),
    enabled: applicationId > 0,
  });
}

export function useApplicationPaymentHistory(applicationId: number) {
  return useQuery({
    queryKey: ["application-payments", applicationId],
    queryFn: () => apiRequest<PaymentHistoryRow[]>(`/api/applications/${applicationId}/payments`),
    enabled: applicationId > 0,
  });
}

export function useVoidApplicationPayment(applicationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: number) =>
      apiRequest<PaymentHistoryRow>(`/api/applications/${applicationId}/payments/${transactionId}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: "Voided by applicant" }),
      }),
    onSuccess: async () => {
      toast.success("Payment voided. You can submit a new payment.");
      await invalidateAfterApplicationPayment(queryClient, applicationId);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });
}

export function useVoidMemberPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: number) =>
      apiRequest<PaymentHistoryRow>(`/api/members/me/payments/${transactionId}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: "Voided by member" }),
      }),
    onSuccess: async () => {
      toast.success("Payment voided. You can submit a new payment.");
      await invalidateAfterMemberPayment(queryClient);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ["lookups", "payment-methods"],
    queryFn: async () => {
      const rows = await apiRequest<LookupOption[]>("/api/lookups/payment-methods");
      return sortPaymentMethods(rows);
    },
  });
}

export function useRecordMemberPayment(onSettledSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MemberPayPayload) =>
      apiRequest<PaymentHistoryRow>("/api/members/me/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      toast.success("Payment recorded.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["member-subscription"] }),
        queryClient.invalidateQueries({ queryKey: ["member-payments"] }),
        queryClient.invalidateQueries({ queryKey: ["member-dashboard"] }),
      ]);
      onSettledSuccess?.();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });
}

export function useMpesaStkPush() {
  return useMutation({
    mutationFn: (payload: {
      phone: string;
      amount: number;
      feeTypeCode: string;
      accountReference?: string | undefined;
    }) =>
      apiRequest<MpesaStkResult>("/api/members/me/payments/mpesa-stk", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onError: (err) => toast.error(extractErrorMessage(err)),
  });
}

export async function invalidateAfterMemberPayment(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["member-subscription"] }),
    queryClient.invalidateQueries({ queryKey: ["member-payments"] }),
    queryClient.invalidateQueries({ queryKey: ["member-dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["member-billing-accommodation"] }),
    queryClient.invalidateQueries({ queryKey: ["member-billing-corkage"] }),
    queryClient.invalidateQueries({ queryKey: ["member-billing-custom"] }),
    queryClient.invalidateQueries({ queryKey: ["nm-billing-summary"] }),
  ]);
}

export async function invalidateAfterApplicationPayment(
  queryClient: ReturnType<typeof useQueryClient>,
  applicationId: number,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["application-dues", applicationId] }),
    queryClient.invalidateQueries({ queryKey: ["application-payments", applicationId] }),
    queryClient.invalidateQueries({ queryKey: ["applications"] }),
    queryClient.invalidateQueries({ queryKey: ["membership", "application"] }),
  ]);
}
