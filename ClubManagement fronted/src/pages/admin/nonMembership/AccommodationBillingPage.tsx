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

type AccRow = {
  id: number;
  guestName: string;
  phone?: string | null;
  roomNumber?: string | null;
  checkInDate: string;
  checkOutDate: string;
  numberOfNights: number;
  totalAmount: number;
  status: string;
  receiptNo?: string | null;
};

export function AccommodationBillingPage() {
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
    queryKey: ["nm-accommodation", page, pageSize, appliedSearch, status, method, from, to],
    queryFn: () =>
      apiRequest<PagedResult<AccRow>>(
        `/api/finance/non-membership/accommodation?${pagedQuery({
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
  const pageData = list.data ?? emptyPage<AccRow>(page, pageSize);

  return (
    <PageFrame width="lg">
      {/* <PageHeader
        title="Accommodation collections"
        description="Track bookings and receipts. Members pay from Subscriptions & Payments after booking."
      /> */}
      <NmRevenueSummaryCards />
      <NmFilterBar
        search={search}
        status={status}
        method={method}
        from={from}
        to={to}
        statusOptions={[
          { value: "PENDING_ADVANCE_PAYMENT", label: "Pending advance" },
          { value: "PAID", label: "Paid" },
          { value: "CANCELLED", label: "Cancelled" },
          { value: "REFUNDED", label: "Refunded" },
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
          <PageBodyLoading label="Loading bookings…" minHeightClassName="min-h-[16rem]" />
        ) : pageData.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accommodation bookings match these filters.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2">Guest</th>
                    <th className="p-2">Room</th>
                    <th className="p-2">Dates</th>
                    <th className="p-2">Nights</th>
                    <th className="p-2">Total</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.items.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="p-2">
                        <div className="font-medium">{row.guestName}</div>
                        <div className="text-xs text-muted-foreground">{row.phone || "—"}</div>
                      </td>
                      <td className="p-2">{row.roomNumber || "—"}</td>
                      <td className="p-2">
                        {row.checkInDate.slice(0, 10)} → {row.checkOutDate.slice(0, 10)}
                      </td>
                      <td className="p-2">{row.numberOfNights}</td>
                      <td className="p-2">{formatKes(row.totalAmount)}</td>
                      <td className="p-2">
                        {row.status === "PENDING_ADVANCE_PAYMENT" ? (
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
        kind="accommodation"
        id={receiptId}
        onClose={() => setReceiptId(null)}
      />
    </PageFrame>
  );
}
