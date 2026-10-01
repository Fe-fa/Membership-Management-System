import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Printer, Search } from "lucide-react";

import { ListPagination } from "@/components/common/ListPagination";
import { MembershipReceiptDialog } from "@/components/finance/MembershipReceipt";
import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { ApiError, apiRequest } from "@/services/membership/api";
import { formatKes } from "@/utils/format";

type CreditReportRow = {
  name: string;
  referenceNo?: string | null;
  credit: number;
  source?: string | null;
  date?: string | null;
  owner: string;
  status: string;
};

type CreditReport = {
  totalMemberCredit: number;
  totalCorporateCredit: number;
  creditCreated: number;
  creditUsed: number;
  members: CreditReportRow[];
  companies: CreditReportRow[];
};

function rowStatus(used: number, available: number) {
  if (available > 0.009 && used > 0.009) return "PARTIALLY USED";
  if (available > 0.009) return "AVAILABLE";
  if (used > 0.009) return "FULLY USED";
  return "NO AVAILABLE CREDIT";
}

type AdvanceRow = {
  transactionId: number;
  accountId?: number | null;
  memberName?: string | null;
  membershipNo?: string | null;
  method?: string | null;
  receiptNumber?: string | null;
  paymentDate?: string | null;
  amountReceived: number;
  amountUsed: number;
  amountAvailable: number;
  status?: string | null;
  referenceNote?: string | null;
};

type AdvancePage = {
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalReceived: number;
  totalUsed: number;
  totalAvailable: number;
  items: AdvanceRow[];
};

type PaymentRow = {
  transactionId: number;
  receiptNumber?: string | null;
  memberName?: string | null;
  membershipNo?: string | null;
  method?: string | null;
  feeType?: string | null;
  feeTypeCode?: string | null;
  amount: number;
  paymentDate?: string | null;
  status?: string | null;
  referenceNote?: string | null;
};

const currentYear = new Date().getFullYear();

function isAdvance(row: PaymentRow) {
  const code = (row.feeTypeCode ?? "").trim().toUpperCase();
  const name = (row.feeType ?? "").trim().toLowerCase();
  return code === "ADVANCE" || name.includes("advance");
}

export function AdvanceCreditPage() {
  const [year, setYear] = useState(String(currentYear));
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [receiptTxId, setReceiptTxId] = useState<number | null>(null);
  const yearNum = Number(year) || currentYear;

  const list = useQuery({
    queryKey: ["finance-advances", yearNum, appliedSearch, page, pageSize],
    queryFn: () => loadAdvances(yearNum, appliedSearch, page, pageSize),
  });
  const report = useQuery({
    queryKey: ["advance-credit-report", yearNum],
    queryFn: () => apiRequest<CreditReport>(`/api/finance/advance-credit/report?from=${yearNum}-01-01&to=${yearNum}-12-31`),
  });

  const data = list.data ?? {
    ...emptyPage<AdvanceRow>(page, pageSize),
    totalReceived: 0,
    totalUsed: 0,
    totalAvailable: 0,
  };

  return (
    <PageFrame width="lg" className="space-y-5 bg-[#F8FAFC] p-4 sm:p-5 -mx-4 sm:-mx-6 lg:-mx-8 sm:px-6 lg:px-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Receipts still unused" value={String(data.totalCount)} hint="Held until a bill is issued" />
        <SummaryCard label="Amount received" value={formatKes(data.totalReceived)} hint="Original receipt, never reduced" />
        <SummaryCard label="Still available" value={formatKes(data.totalAvailable)} hint="Not yet used on a bill" />
      </div>

      {/* <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Advance credit report</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Member credit {formatKes(report.data?.totalMemberCredit || 0)} · Corporate credit {formatKes(report.data?.totalCorporateCredit || 0)} · Created in {yearNum} {formatKes(report.data?.creditCreated || 0)} · Used in {yearNum} {formatKes(report.data?.creditUsed || 0)}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Member</th>
                <th className="p-2">Membership no.</th>
                <th className="p-2 text-right">Credit</th>
                <th className="p-2">Source</th>
                <th className="p-2">Date</th>
                <th className="p-2">Owner</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(report.data?.members.length ?? 0) === 0 && (report.data?.companies.length ?? 0) === 0 ? (
                <tr><td colSpan={7} className="p-3 text-muted-foreground">No available credit.</td></tr>
              ) : (
                <>
                  {report.data?.members.map((row) => (
                    <tr key={`m-${row.referenceNo}-${row.name}`} className="border-t">
                      <td className="p-2 font-medium">{row.name}</td>
                      <td className="p-2">{row.referenceNo || "—"}</td>
                      <td className="p-2 text-right tabular-nums">{formatKes(row.credit)}</td>
                      <td className="p-2">{row.source || "—"}</td>
                      <td className="p-2">{row.date?.slice(0, 10) || "—"}</td>
                      <td className="p-2">Member</td>
                      <td className="p-2">{row.status}</td>
                    </tr>
                  ))}
                  {report.data?.companies.map((row) => (
                    <tr key={`c-${row.referenceNo}-${row.name}`} className="border-t">
                      <td className="p-2 font-medium">{row.name}</td>
                      <td className="p-2">{row.referenceNo || "—"}</td>
                      <td className="p-2 text-right tabular-nums">{formatKes(row.credit)}</td>
                      <td className="p-2">{row.source || "—"}</td>
                      <td className="p-2">{row.date?.slice(0, 10) || "—"}</td>
                      <td className="p-2">Corporate</td>
                      <td className="p-2">{row.status}</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section> */}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
            setPage(1);
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Year</span>
            <Input
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setPage(1);
              }}
              className="h-9 w-28 bg-white"
              inputMode="numeric"
            />
          </label>
          <label className="grid min-w-[16rem] flex-1 gap-1 text-sm">
            <span className="text-muted-foreground">Search</span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, membership no, receipt…"
              className="h-9 bg-white"
            />
          </label>
          <Button type="submit" variant="outline" className="h-9">
            <Search className="size-4" />
            Apply
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {list.isLoading ? (
          <PageBodyLoading label="Loading unused advance credit…" minHeightClassName="min-h-[14rem]" />
        ) : list.isError ? (
          <p className="text-sm text-destructive">Advance credit could not be loaded.</p>
        ) : data.items.length === 0 ? (
          <div className="space-y-2 py-6 text-center">
            <p className="text-sm font-medium text-foreground">No unused advance credit for {yearNum}.</p>
            <p className="text-sm text-muted-foreground">
              Money that has paid an invoice stays on{" "}
              <Link to="/finance/desk" className="font-medium text-foreground underline underline-offset-2">
                Settled bills
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Member</th>
                    <th className="p-2">Method</th>
                    <th className="p-2">Receipt</th>
                    <th className="p-2 text-right">Received</th>
                    <th className="p-2 text-right">Used on bills</th>
                    <th className="p-2 text-right">Still available</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.transactionId} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="p-2">{row.paymentDate?.slice(0, 10) || "—"}</td>
                      <td className="p-2">
                        <div className="font-medium">{row.memberName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.membershipNo || "—"}</div>
                      </td>
                      <td className="p-2">{row.method || "—"}</td>
                      <td className="p-2 font-medium">{row.receiptNumber || "—"}</td>
                      <td className="p-2 text-right tabular-nums">{formatKes(row.amountReceived)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{formatKes(row.amountUsed)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">{formatKes(row.amountAvailable)}</td>
                      <td className="p-2">{rowStatus(row.amountUsed, row.amountAvailable)}</td>
                      <td className="p-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!row.receiptNumber}
                          onClick={() => setReceiptTxId(row.transactionId)}
                        >
                          <Printer className="size-3.5" />
                          Receipt
                        </Button>
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
                totalCount={data.totalCount}
                totalPages={data.totalPages}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </>
        )}
      </section>

      <MembershipReceiptDialog
        transactionId={receiptTxId}
        open={receiptTxId != null}
        onClose={() => setReceiptTxId(null)}
      />
    </PageFrame>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

async function loadAdvances(year: number, search: string, page: number, pageSize: number): Promise<AdvancePage> {
  const query = pagedQuery({ page, pageSize, year, search: search || undefined });
  try {
    return await apiRequest<AdvancePage>(`/api/finance/advances?${query}`);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
    const legacy = await apiRequest<PagedResult<PaymentRow>>(
      `/api/finance/payments?${pagedQuery({
        page,
        pageSize,
        status: "SETTLED",
        year,
        feeType: "ADVANCE",
        search: search || undefined,
      })}`,
    );
    const items = legacy.items.filter(isAdvance).map((row) => ({
      transactionId: row.transactionId,
      memberName: row.memberName ?? null,
      membershipNo: row.membershipNo ?? null,
      method: row.method ?? null,
      receiptNumber: row.receiptNumber ?? null,
      paymentDate: row.paymentDate ?? null,
      amountReceived: row.amount,
      amountUsed: 0,
      amountAvailable: row.amount,
      status: row.status ?? null,
      referenceNote: row.referenceNote ?? null,
    }));
    const received = items.reduce((sum, row) => sum + row.amountReceived, 0);
    return {
      totalCount: legacy.totalCount,
      page: legacy.page,
      pageSize: legacy.pageSize,
      totalPages: legacy.totalPages,
      totalReceived: received,
      totalUsed: 0,
      totalAvailable: received,
      items,
    };
  }
}
