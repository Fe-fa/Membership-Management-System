import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  NmFilterBar,
  NmRevenueSummaryCards,
} from "@/components/finance/nonMembership/shared";
import { NonMembershipReceiptDrawer } from "@/components/finance/nonMembership/ReceiptDrawer";
import { ListPagination } from "@/components/common/ListPagination";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { Button } from "@/components/ui/button";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { apiRequest } from "@/services/membership/api";
import { formatKes } from "@/utils/format";

type CorkRow = {
  id: number;
  payerName: string;
  itemDescription: string;
  feeAmount: number;
  authorizedByManager: boolean;
  managerName?: string | null;
  status: string;
  receiptNo?: string | null;
};

export function CorkageBillingPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [receiptId, setReceiptId] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["nm-corkage", page, pageSize, appliedSearch, status, method, from, to],
    queryFn: () =>
      apiRequest<PagedResult<CorkRow>>(
        `/api/finance/non-membership/corkage?${pagedQuery({
          page,
          pageSize,
          search: appliedSearch || undefined,
          status: status || undefined,
          paymentMethod: method || undefined,
          from: from || undefined,
          to: to || undefined,
        })}`,
      ),
  });
  const pageData = list.data ?? emptyPage<CorkRow>(page, pageSize);

  return (
    <PageFrame width="lg">
      <PageHeader
        title="Corkage collections"
        description="Track corkage charges and receipts. Members pay from Subscriptions & Payments."
      />
      <NmRevenueSummaryCards />
      <NmFilterBar
        search={search}
        status={status}
        method={method}
        from={from}
        to={to}
        statusOptions={[
          { value: "PENDING", label: "Pending" },
          { value: "PAID", label: "Paid" },
          { value: "CANCELLED", label: "Cancelled" },
        ]}
        onSearch={setSearch}
        onStatus={setStatus}
        onMethod={setMethod}
        onFrom={setFrom}
        onTo={setTo}
        onApply={() => {
          setAppliedSearch(search.trim());
          setPage(1);
        }}
      />

      <section className="rounded-xl border border-border bg-card p-4">
        {list.isLoading ? (
          <PageBodyLoading label="Loading corkage charges…" minHeightClassName="min-h-[16rem]" />
        ) : pageData.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No corkage charges match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2">Payer</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Fee</th>
                    <th className="p-2">Manager</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.items.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="p-2 font-medium">{row.payerName}</td>
                      <td className="p-2">{row.itemDescription}</td>
                      <td className="p-2">{formatKes(row.feeAmount)}</td>
                      <td className="p-2">
                        {row.authorizedByManager ? row.managerName || "Authorized" : "—"}
                      </td>
                      <td className="p-2">
                        {row.status === "PENDING" ? (
                          <span className="text-amber-800">Awaiting member payment</span>
                        ) : (
                          row.status
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {row.receiptNo ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setReceiptId(row.id)}
                          >
                            Receipt
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
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

      <NonMembershipReceiptDrawer
        open={receiptId != null}
        kind="corkage"
        id={receiptId}
        onClose={() => setReceiptId(null)}
      />
    </PageFrame>
  );
}
