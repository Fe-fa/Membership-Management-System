import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { ApplicantStageChecklist } from "@/components/admin/ManagerStagePanel";
import {
  MemberPaymentForm,
  PaymentHistoryTable,
  SubscriptionStatusBanners,
  SubscriptionSummaryCards,
  applicationDuesToSubscription,
  useApplicationDues,
  useApplicationPaymentHistory,
  useMemberPaymentHistory,
  useMemberSubscription,
  usePaymentMethods,
} from "@/components/payments";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isClubMember, readUser } from "@/lib/auth";
import { fetchApplication, saveDraft, extractErrorMessage } from "@/services/membership/api";
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
  const search = Route.useSearch();
  const [payOpen, setPayOpen] = useState(Boolean(search.purpose || search.nmId || search.amount));
  const sub = useMemberSubscription();
  const history = useMemberPaymentHistory();
  const methods = usePaymentMethods();

  useEffect(() => {
    if (search.purpose || search.nmId || search.amount) setPayOpen(true);
  }, [search.purpose, search.nmId, search.amount]);

  if (sub.isLoading) {
    return (
      <PageFrame>
        <PageHeader title="Payment" description="Review dues and track receipts." />
        <PageBodyLoading label="Loading your dues…" />
      </PageFrame>
    );
  }

  if (!sub.data) {
    return (
      <PageFrame>
        <PageHeader title="Payment" description="Membership account was not found." />
      </PageFrame>
    );
  }

  const row = sub.data;

  return (
    <PageFrame>
      <PageHeader
        title="Payment"
        description="Review dues, pay joining or annual fees, accommodation, corkage, and track receipts."
        actions={
          <Button type="button" onClick={() => setPayOpen(true)}>
            Make a payment
          </Button>
        }
      />

      <SubscriptionSummaryCards sub={row} onPay={() => setPayOpen(true)} />
      <SubscriptionStatusBanners sub={row} />

      <MemberPaymentForm
        open={payOpen}
        onOpenChange={setPayOpen}
        audience="member"
        sub={row}
        methods={methods.data ?? []}
        initialPurpose={search.purpose}
        initialAmount={search.amount}
        initialLineDescription={search.desc}
        nmChargeId={search.nmId}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>Filter by status, fee type, or payment method.</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentHistoryTable rows={history.data ?? []} loading={history.isLoading} showFilters />
        </CardContent>
      </Card>
    </PageFrame>
  );
}

function ApplicantPaymentPage() {
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
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
  const history = useApplicationPaymentHistory(applicationId);
  const typeOptions = useQuery({
    queryKey: ["membership-types", "applicant"],
    queryFn: () => fetchMembershipTypes({ applicantOnly: true }),
  });

  const hasMembershipClass = Boolean(
    membershipType || dues.data?.membershipTypeId || dues.data?.membershipTypeName,
  );
  const sub = dues.data ? applicationDuesToSubscription(dues.data) : null;
  const canOpenPayment = Boolean(applicationId > 0 && hasMembershipClass && sub);
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
      toast.success("Membership type saved. Opening payment desk…");
      setOpenAfterTypeSave(true);
      await queryClient.invalidateQueries({ queryKey: applicationQueryKey(readUser()?.userAccountId) });
      await queryClient.invalidateQueries({ queryKey: ["application-dues"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  useEffect(() => {
    if (!openAfterTypeSave || !canOpenPayment) return;
    setPayOpen(true);
    setOpenAfterTypeSave(false);
  }, [openAfterTypeSave, canOpenPayment]);

  function openPaymentDesk() {
    if (canOpenPayment) {
      setPayOpen(true);
      return;
    }
    if (!applicationId) {
      toast.error("Start or save your application first, then return here to pay.");
      return;
    }
    if (!hasMembershipClass) {
      toast.error("Select a membership type below, then click Make a payment.");
      return;
    }
    toast.error("Fee schedule is still loading. Try again in a moment.");
  }

  if (loading) {
    return (
      <PageFrame>
        <PageHeader
          title="Payment"
          description="Pay joining and first-year subscription fees for your application."
        />
        <PageBodyLoading label="Loading application fees…" />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PageBackLink to="/" label="Back to home" />
      <PageHeader
        title="Payment"
        description="Review dues, pay joining or annual fees, and track receipts — same payment desk as members."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={openPaymentDesk}>
              Make a payment
            </Button>
            <Button asChild variant="outline">
              <Link to="/applications">Back to application</Link>
            </Button>
          </div>
        }
      />

      {applicationId > 0 ? (
        <ApplicantStageChecklist
          applicationId={applicationId}
          statusCode={application.data?.status ?? null}
        />
      ) : null}

      {!hasMembershipClass ? (
        <Card>
          <CardHeader>
            <CardTitle>Choose your membership type</CardTitle>
            <CardDescription>
              Amounts come from Membership_fee_schedule. Pick a class here, then use{" "}
              <strong>Make a payment</strong> to open the payment desk.
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openPaymentDesk} disabled={saveType.isPending}>
                Make a payment
              </Button>
              <Button asChild variant="outline">
                <Link to="/application">Open full membership form</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : sub ? (
        <SubscriptionSummaryCards sub={sub} onPay={openPaymentDesk} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Could not load fees</CardTitle>
            <CardDescription>
              Save your application, then refresh this page to load amounts from the fee schedule.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={openPaymentDesk}>
              Make a payment
            </Button>
          </CardContent>
        </Card>
      )}

      {sub && applicationId > 0 ? (
        <MemberPaymentForm
          open={payOpen}
          onOpenChange={setPayOpen}
          audience="applicant"
          applicationId={applicationId}
          sub={sub}
          methods={methods.data ?? []}
          initialPurpose={sub.joiningOutstanding > 0 ? "joining" : "annual"}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>
            From MTransaction, Fee_type, Payment_status, and MReceiptMaster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentHistoryTable rows={history.data ?? []} loading={history.isLoading} showFilters />
        </CardContent>
      </Card>
    </PageFrame>
  );
}
