import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Award, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { PageBodyLoading } from "@/components/layout/PageLoading";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMembershipDate } from "@/services/admin/membershipDesk";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";

type SeniorRow = {
  accountId: number;
  membershipNo: string;
  memberName: string;
  joinedDate?: string | null;
  currentClass: string;
  yearsOfService: number;
};

type Hub = {
  totalMembers: number;
  fullMembers: number;
  activeLifeMembers: number;
  seniorLifeCandidates: SeniorRow[];
};

export function MemberTransitionPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);

  const hub = useQuery({
    queryKey: ["membership-transitions"],
    queryFn: () => apiRequest<Hub>("/api/membership-transitions"),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["membership-transitions"] });
    void queryClient.invalidateQueries({ queryKey: ["members"] });
  }

  const confirmSenior = useMutation({
    mutationFn: (accountIds: number[]) =>
      apiRequest<{ converted: number }>("/api/membership-transitions/senior-life", {
        method: "POST",
        body: JSON.stringify({ accountIds }),
      }),
    onSuccess: (result) => {
      toast.success(
        result.converted === 1
          ? "Life membership recorded. The congratulation letter was emailed to the member."
          : `${result.converted} members moved to Life. Congratulation letters were emailed.`,
      );
      setSelected([]);
      refresh();
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  function toggle(accountId: number) {
    setSelected((ids) =>
      ids.includes(accountId) ? ids.filter((id) => id !== accountId) : [...ids, accountId],
    );
  }

  if (hub.isLoading) {
    return (
      <PageFrame width="lg">
        <PageBodyLoading label="Loading membership transitions…" />
      </PageFrame>
    );
  }

  if (hub.isError || !hub.data) {
    return (
      <PageFrame width="lg">
        <PageBackLink to="/admin" label="Back to admin dashboard" />
        <p className="text-sm text-destructive">{extractErrorMessage(hub.error)}</p>
      </PageFrame>
    );
  }

  const data = hub.data;
  const candidates = data.seniorLifeCandidates ?? [];
  const allChecked = candidates.length > 0 && candidates.every((row) => selected.includes(row.accountId));
  const confirmLabel =
    selected.length === 0
      ? "Confirm transition"
      : selected.length === 1
        ? "Confirm 1 member"
        : `Confirm ${selected.length} members`;

  return (
    <PageFrame width="lg">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Pending" value={candidates.length} icon={<Award className="size-4" />} />
        <Stat label="Life members" value={data.activeLifeMembers} icon={<Award className="size-4" />} />
      </div>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4">
          <div>
            <h2 className="text-base font-semibold">Membership transitions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {candidates.length === 0
                ? "No active Full, Country, Overseas, or Senior member has reached 50 years yet."
                : "Tick a member, then confirm. Full, Country, Overseas, and Senior members are all included."}
            </p>
          </div>
          <Button
            type="button"
            disabled={selected.length === 0 || confirmSenior.isPending}
            onClick={() => confirmSenior.mutate(selected)}
          >
            {confirmSenior.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>

        {candidates.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">Nothing to confirm.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(value) =>
                        setSelected(value === true ? candidates.map((row) => row.accountId) : [])
                      }
                      aria-label="Select all eligible members"
                    />
                  </th>
                  <th className="px-3 py-3">Member</th>
                  <th className="px-3 py-3">Joined</th>
                  <th className="px-3 py-3">Current class</th>
                  <th className="px-3 py-3">Years</th>
                  <th className="px-4 py-3">After confirm</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((row) => {
                  const isSelected = selected.includes(row.accountId);
                  return (
                    <tr
                      key={row.accountId}
                      className={cn("cursor-pointer border-t", isSelected && "bg-muted/60")}
                      onClick={() => toggle(row.accountId)}
                    >
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggle(row.accountId)}
                          aria-label={`Select ${row.memberName}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{row.memberName}</p>
                        <p className="text-xs text-muted-foreground">{row.membershipNo}</p>
                      </td>
                      <td className="px-3 py-3">{formatMembershipDate(row.joinedDate)}</td>
                      <td className="px-3 py-3">{row.currentClass}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          {row.yearsOfService.toFixed(1)} years
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        Life
                        <span className="mt-0.5 block text-xs text-muted-foreground">Life privileges, annual fee Ksh 0</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageFrame>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
