import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canApproveBillingDocuments, readUser } from "@/lib/auth";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

type DocumentKind = "INVOICE" ;
type ApprovalStatus = "PENDING_GM" | "APPROVED" | "REJECTED" | "PUBLISHED";

type ApprovalRow = {
  billingDocumentId: number;
  documentNo: string;
  kind: DocumentKind;
  feeType: string;
  audience: string;
  partyName: string;
  partyNo?: string | null;
  email?: string | null;
  amount: number;
  amountPaid: number;
  balance: number;
  status: ApprovalStatus;
  emailAfterApproval: boolean;
  submittedAt: string;
  submittedBy?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  publishedAt?: string | null;
  sentAt?: string | null;
  year?: number | null;
  documentHtml?: string | null;
};

type PendingCounts = { invoices: number; statements: number };

function statusLabel(status: string) {
  if (status === "PENDING_GM") return "Waiting";
  if (status === "APPROVED") return "Approved";
  if (status === "PUBLISHED") return "Issued";
  if (status === "REJECTED") return "Returned";
  return status;
}

export function DocumentApprovalsPage() {
  const user = readUser();
  const canDecide = canApproveBillingDocuments(user);
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DocumentKind>("INVOICE");
  const [status, setStatus] = useState<ApprovalStatus>("PENDING_GM");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [returnRow, setReturnRow] = useState<ApprovalRow | null>(null);
  const [returnNotes, setReturnNotes] = useState("");

  const counts = useQuery({
    queryKey: ["billing-pending-count"],
    queryFn: () => apiRequest<PendingCounts>("/api/finance/billing/pending-count"),
  });
  const list = useQuery({
    queryKey: ["billing-approvals", kind, status, appliedSearch, page, pageSize],
    queryFn: () =>
      apiRequest<PagedResult<ApprovalRow>>(
        `/api/finance/billing/approvals?${pagedQuery({
          kind,
          status,
          search: appliedSearch || undefined,
          page,
          pageSize,
        })}`,
      ),
  });

  const pageData = list.data ?? emptyPage<ApprovalRow>(page, pageSize);
  const rows = pageData.items;

  const approve = useMutation({
    mutationFn: (row: ApprovalRow) =>
      apiRequest<ApprovalRow>(`/api/finance/billing/${row.billingDocumentId}/approve`, {
        method: "POST",
        body: JSON.stringify({ sendEmail: row.emailAfterApproval }),
      }),
    onSuccess: async () => {
      toast.success("Document approved. The recipient can now see it.");
      await invalidate();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const reject = useMutation({
    mutationFn: (row: ApprovalRow) =>
      apiRequest<ApprovalRow>(`/api/finance/billing/${row.billingDocumentId}/reject`, {
        method: "POST",
        body: JSON.stringify({ notes: returnNotes.trim() }),
      }),
    onSuccess: async () => {
      toast.success("Returned to Finance with your note.");
      setReturnRow(null);
      setReturnNotes("");
      await invalidate();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["billing-approvals"] }),
      queryClient.invalidateQueries({ queryKey: ["billing-pending-count"] }),
      queryClient.invalidateQueries({ queryKey: ["billing-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["billing-stats"] }),
    ]);
  }

  const invoiceCount = counts.data?.invoices ?? 0;
  const statementCount = counts.data?.statements ?? 0;
  const pendingTotal = invoiceCount + statementCount;
  const busyId = approve.isPending ? approve.variables?.billingDocumentId : reject.isPending ? returnRow?.billingDocumentId : null;

  return (
    <PageFrame width="lg">
      <PageHeader
        title=""
        description="Review invoices and statements Finance prepared. Approve to release them to the member or applicant, or return them with a note."
        actions={
          <Button type="button" variant="outline" asChild>
            <Link to="/finance/invoices">
              <FileText className="size-4" />
              Finance invoices
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Waiting for you</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{pendingTotal}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending invoices</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{invoiceCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["INVOICE"] as DocumentKind[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setKind(item);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium",
                kind === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-slate-200 bg-white text-slate-700 hover:border-primary/40",
              )}
            >
              {item === "INVOICE" ? "Invoices" : null}
              {item === "INVOICE" && invoiceCount > 0 ? ` (${invoiceCount})` : null}

            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["PENDING_GM", "APPROVED", "PUBLISHED", "REJECTED"] as ApprovalStatus[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setStatus(item);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                status === item
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-200 bg-white text-slate-600",
              )}
            >
              {statusLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid min-w-[14rem] flex-1 gap-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <Input
            className="bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAppliedSearch(search.trim());
                setPage(1);
              }
            }}
            placeholder="Name, membership no., document no."
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAppliedSearch(search.trim());
            setPage(1);
          }}
        >
          Search
        </Button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {list.isLoading ? (
          <PageBodyLoading label="Loading documents waiting for approval…" minHeightClassName="min-h-[16rem]" />
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 px-3 py-10 text-center text-sm text-muted-foreground">
            {status === "PENDING_GM"
              ? `No ${kind === "INVOICE" ? "invoices" : "statements"} are waiting for approval.`
              : `No ${statusLabel(status).toLowerCase()} ${kind === "INVOICE" ? "invoices" : "statements"} found.`}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-[32%] py-2 pr-3 font-medium">Member name</th>
                    <th className="w-[22%] py-2 pr-3 font-medium">Membership no.</th>
                    <th className="w-[22%] py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="w-[24%] py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowBusy = busyId === row.billingDocumentId;
                    return (
                      <tr key={row.billingDocumentId} className="border-b border-slate-100 last:border-0 hover:bg-muted/40">
                        <td className="py-3 pr-3 align-middle">
                          <p className="font-medium text-slate-900">{row.partyName}</p>
                        </td>
                        <td className="py-3 pr-3 align-middle font-medium">{row.partyNo || "—"}</td>
                        <td className="py-3 pr-3 align-middle text-right tabular-nums font-semibold">
                          {formatKes(row.amount)}
                        </td>
                        <td className="py-3 align-middle">
                          {row.status === "PENDING_GM" && canDecide ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={Boolean(busyId)}
                                onClick={() => approve.mutate(row)}
                              >
                                {rowBusy && approve.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={Boolean(busyId)}
                                onClick={() => {
                                  setReturnRow(row);
                                  setReturnNotes("");
                                }}
                              >
                                <X className="size-4" />
                                Return
                              </Button>
                            </div>
                          ) : (
                            <p className="text-right text-sm text-muted-foreground">{statusLabel(row.status)}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <ListPagination
                page={page}
                pageSize={pageSize}
                totalCount={pageData.totalCount}
                totalPages={pageData.totalPages}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </>
        )}
      </section>

      <Dialog open={Boolean(returnRow)} onOpenChange={(open) => !open && !reject.isPending && setReturnRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to Finance</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add a short note so Finance knows what to correct
            {returnRow ? ` for ${returnRow.partyName}.` : "."}
          </p>
          <Textarea
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
            placeholder="Reason for returning this document"
            rows={4}
          />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={reject.isPending} onClick={() => setReturnRow(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reject.isPending || !returnNotes.trim() || !returnRow}
              onClick={() => returnRow && reject.mutate(returnRow)}
            >
              {reject.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Return document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
