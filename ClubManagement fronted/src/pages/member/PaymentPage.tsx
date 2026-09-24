import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Printer, Receipt } from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import {
  MemberPaymentForm,
  PAYMENT_PAGE_DESCRIPTION,
  PaymentContextBar,
  SubscriptionSummaryCards,
  applicationDuesToSubscription,
  useApplicationDues,
  useMemberPaymentHistory,
  useMemberSubscription,
  usePaymentMethods,
} from "@/components/payments";
import { isReceiptViewable, type PaymentHistoryRow } from "@/components/payments/types";
import { MemberStatementDialog } from "@/components/finance/MemberStatementDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { isClubMember, readUser } from "@/lib/auth";
import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";
import { useInvoiceSetup } from "@/services/finance/invoiceSetup";
import { fetchApplication, saveDraft, extractErrorMessage, apiRequest } from "@/services/membership/api";
import {
  buildInvoiceHtml,
  buildReceiptHtml,
  printHtmlDocument,
  type InvoiceDocument,
  type ReceiptDocument,
} from "@/utils/financeExport";
import { mergePaymentSetup } from "@/utils/invoiceSetup";
import { formatKes } from "@/utils/format";
import { fetchMembershipTypes } from "@/services/membership/membershipTypes";
import { applicationQueryKey } from "@/services/membership/useApplication";
import { emptyDraft, type MembershipType } from "@/services/membership/schema";
import { cn } from "@/utils/cn";
import { Route } from "@/routes/payment";

export function PaymentPage() {
  if (isClubMember(readUser())) {
    return <MemberSubscriptionPage />;
  }
  return <ApplicantPaymentPage />;
}

function MemberSubscriptionPage() {
  const tenant = useCurrentTenant();
  const invoiceSetup = useInvoiceSetup();
  const search = Route.useSearch();
  const [statementOpen, setStatementOpen] = useState(false);
  const [receiptPickerOpen, setReceiptPickerOpen] = useState(false);
  const [printingInvoice, setPrintingInvoice] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const sub = useMemberSubscription();
  const methods = usePaymentMethods();
  const payments = useMemberPaymentHistory();
  const invoiceYear =
    sub.data?.upcomingYear && Number(sub.data.upcomingOutstanding || 0) > 0
      ? sub.data.upcomingYear
      : sub.data?.year;
  const printableReceipts = useMemo(() => {
    return [...(payments.data ?? [])]
      .filter((row) => row.receiptNumber && isReceiptViewable(row.status, row.statusCode))
      .sort((a, b) => {
        const byDate = (b.paymentDate ?? "").localeCompare(a.paymentDate ?? "");
        if (byDate !== 0) return byDate;
        return (b.transactionId ?? 0) - (a.transactionId ?? 0);
      });
  }, [payments.data]);

  async function printInvoice() {
    const year = invoiceYear ?? sub.data?.year;
    if (!year) {
      toast.error("Subscription year is not available yet.");
      return;
    }
    try {
      setPrintingInvoice(true);
      const doc = await apiRequest<InvoiceDocument>(
        `/api/members/me/invoices/current?year=${year}`,
      );
      printHtmlDocument(
        buildInvoiceHtml({
          ...doc,
          ...tenantDocumentBrand(tenant.data),
          setup: mergePaymentSetup(doc.setup ?? invoiceSetup.data),
        }),
      );
      toast.success(`Invoice ${doc.invoiceNo} is ready to print.`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setPrintingInvoice(false);
    }
  }

  async function printReceipt(row: PaymentHistoryRow) {
    try {
      setPrintingReceipt(true);
      const doc = await apiRequest<ReceiptDocument>(
        `/api/finance/payments/${row.transactionId}/receipt`,
      );
      printHtmlDocument(
        buildReceiptHtml({
          ...doc,
          ...tenantDocumentBrand(tenant.data),
          setup: mergePaymentSetup(doc.setup ?? invoiceSetup.data),
        }),
      );
      toast.success(`Receipt ${row.receiptNumber} is ready to print.`);
      setReceiptPickerOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setPrintingReceipt(false);
    }
  }

  useEffect(() => {
    if (search.purpose || search.nmId || search.amount) {
      document.getElementById("member-make-payment")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [search.purpose, search.nmId, search.amount]);

  if (sub.isLoading) {
    return (
      <PageFrame width="lg">
        <PaymentContextBar />
        <PageHeader title="Payment" description={PAYMENT_PAGE_DESCRIPTION} />
        <PageBodyLoading label="Loading your dues…" />
      </PageFrame>
    );
  }

  if (!sub.data) {
    return (
      <PageFrame width="lg">
        <PaymentContextBar />
        <PageHeader title="Payment" description="Membership account was not found." />
      </PageFrame>
    );
  }

  const row = sub.data;
  const memberPaymentDefaults = {
    ...(search.purpose ? { initialPurpose: search.purpose } : {}),
    ...(typeof search.amount === "number" ? { initialAmount: search.amount } : {}),
    ...(search.desc ? { initialLineDescription: search.desc } : {}),
    ...(typeof search.nmId === "number" ? { nmChargeId: search.nmId } : {}),
  };

  return (
    <PageFrame width="lg">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <PaymentContextBar year={invoiceYear ?? row.year} className="min-w-0 flex-1" />
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setStatementOpen(true)}>
            Print statement
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={printingInvoice}
            onClick={() => void printInvoice()}
          >
            {printingInvoice ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            Print invoice
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={payments.isLoading}
            onClick={() => {
              if (printableReceipts.length === 0) {
                toast.error("No official receipt yet. It appears here after a payment is cleared.");
                return;
              }
              setReceiptPickerOpen(true);
            }}
          >
            <Receipt className="size-4" />
            Print receipt
          </Button>
        </div>
      </div>

      <MemberStatementDialog
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        mode="self"
        year={row.year}
      />

      <MemberReceiptPickerDialog
        open={receiptPickerOpen}
        onClose={() => setReceiptPickerOpen(false)}
        receipts={printableReceipts}
        printing={printingReceipt}
        onPrint={(receipt) => void printReceipt(receipt)}
      />

      <SubscriptionSummaryCards sub={row} />

      <MemberPaymentForm
        open
        onOpenChange={() => undefined}
        layout="page"
        audience="member"
        sub={row}
        methods={methods.data ?? []}
        {...memberPaymentDefaults}
      />
    </PageFrame>
  );
}

function MemberReceiptPickerDialog({
  open,
  onClose,
  receipts,
  printing,
  onPrint,
}: {
  open: boolean;
  onClose: () => void;
  receipts: PaymentHistoryRow[];
  printing: boolean;
  onPrint: (row: PaymentHistoryRow) => void;
}) {
  const [pickedId, setPickedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setPickedId(null);
      return;
    }
    setPickedId(receipts[0]?.transactionId ?? null);
  }, [open, receipts]);

  const picked = receipts.find((row) => row.transactionId === pickedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Print receipt</DialogTitle>
          <DialogDescription>
            Choose a receipt number. Partial payments each have their own receipt.
          </DialogDescription>
        </DialogHeader>

        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cleared receipts on your account yet.</p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="member-receipt-pick">Receipt no.</Label>
            <ul
              id="member-receipt-pick"
              className="max-h-64 overflow-auto rounded-md border border-border"
              role="listbox"
              aria-label="Receipt numbers"
            >
              {receipts.map((row) => {
                const selected = row.transactionId === pickedId;
                return (
                  <li key={row.transactionId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60",
                        selected && "bg-muted",
                      )}
                      onClick={() => setPickedId(row.transactionId)}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium tabular-nums">{row.receiptNumber}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[row.paymentDate, row.method, row.feeType].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums font-medium">{formatKes(row.amount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={printing}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" disabled={!picked || printing} onClick={() => picked && onPrint(picked)}>
            {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Print selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplicantPaymentPage() {
  const queryClient = useQueryClient();
  const [openAfterTypeSave, setOpenAfterTypeSave] = useState(false);
  const methods = usePaymentMethods();

  const application = useQuery({
    queryKey: applicationQueryKey(readUser()?.userAccountId),
    queryFn: fetchApplication,
    staleTime: 30_000,
    enabled: Boolean(readUser()?.userAccountId),
  });

  const applicationId = Number(application.data?.id || 0);
  const draft = application.data?.draft ?? emptyDraft();
  const membershipType = String(draft.membership?.membershipType ?? "").trim();

  const dues = useApplicationDues(applicationId);
  const typeOptions = useQuery({
    queryKey: ["membership-types", "applicant"],
    queryFn: () => fetchMembershipTypes({ applicantOnly: true }),
  });

  const hasMembershipClass = Boolean(
    membershipType || dues.data?.membershipTypeId || dues.data?.membershipTypeName,
  );
  const sub = dues.data ? applicationDuesToSubscription(dues.data) : null;
  const invoiced = Boolean(dues.data?.joiningInvoiced || dues.data?.annualInvoiced);
  const canPay = Boolean(applicationId > 0 && hasMembershipClass && sub && invoiced);
  const loading = application.isLoading || (applicationId > 0 && dues.isLoading);

  const saveType = useMutation({
    mutationFn: async (code: string) => {
      const current = application.data?.draft ?? emptyDraft();
      const next = {
        ...current,
        membership: {
          ...current.membership,
          membershipType: code as MembershipType,
        },
      };
      return saveDraft({
        draft: next,
        completedSteps: application.data?.completedSteps ?? [],
      });
    },
    onSuccess: async () => {
      toast.success("Membership type saved. The payment form is ready below.");
      setOpenAfterTypeSave(true);
      await queryClient.invalidateQueries({ queryKey: applicationQueryKey(readUser()?.userAccountId) });
      await queryClient.invalidateQueries({ queryKey: ["application-dues"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  useEffect(() => {
    if (!openAfterTypeSave || !canPay) return;
    document.getElementById("member-make-payment")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpenAfterTypeSave(false);
  }, [openAfterTypeSave, canPay]);

  if (loading) {
    return (
      <PageFrame width="lg">
        <PaymentContextBar />
        <PageHeader
          title="Payment"
          description={PAYMENT_PAGE_DESCRIPTION}
        />
        <PageBodyLoading label="Loading application fees…" />
      </PageFrame>
    );
  }

  return (
    <PageFrame width="lg">
      <PaymentContextBar year={sub?.year ?? null} />
      <PageBackLink to="/" label="Back to home" />
      <PageHeader
        title="Payment"
        description={PAYMENT_PAGE_DESCRIPTION}
        actions={
          <Button asChild variant="outline">
            <Link to="/applications">Back to application</Link>
          </Button>
        }
      />

      {!hasMembershipClass ? (
        <Card>
          <CardHeader>
            <CardTitle>Choose your membership type</CardTitle>
            <CardDescription>
              Amounts come from the club fee schedule. Pick a class, then pay joining and first-year
              subscription on this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {(typeOptions.data ?? []).map((type) => (
                <button
                  key={type.code}
                  type="button"
                  disabled={saveType.isPending}
                  onClick={() => saveType.mutate(type.code)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left transition-colors",
                    "hover:border-primary hover:bg-primary/5",
                    membershipType === type.code && "border-primary bg-primary/5",
                  )}
                >
                  <p className="font-medium">{type.name}</p>
                  <p className="text-xs text-muted-foreground">{type.code}</p>
                </button>
              ))}
            </div>
            <Button asChild variant="outline">
              <Link to="/application">Open full membership form</Link>
            </Button>
          </CardContent>
        </Card>
      ) : !invoiced || !sub ? (
        <Card>
          <CardHeader>
            <CardTitle>No invoice has been issued yet</CardTitle>
            <CardDescription>
              Entrance fee and annual subscription appear here after the manager or the finance desk issues an invoice.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <SubscriptionSummaryCards sub={sub} />
          {applicationId > 0 ? (
            <MemberPaymentForm
              open
              onOpenChange={() => undefined}
              layout="page"
              audience="applicant"
              applicationId={applicationId}
              sub={sub}
              methods={methods.data ?? []}
              initialPurpose={sub.joiningOutstanding > 0 ? "joining" : "annual"}
            />
          ) : null}
        </>
      )}
    </PageFrame>
  );
}
