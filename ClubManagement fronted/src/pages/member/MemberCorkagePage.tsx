import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatKes } from "@/utils/format";

type CorkRow = {
  id: number;
  itemDescription: string;
  feeAmount: number;
  status: string;
  receiptNo?: string | null;
  authorizedByManager: boolean;
  managerName?: string | null;
};

type Paged<T> = { items: T[] };

export function MemberCorkagePage() {
  const qc = useQueryClient();
  const [itemDescription, setItemDescription] = useState("");
  const [feeAmount, setFeeAmount] = useState("2000");
  const [authorized, setAuthorized] = useState(false);
  const [managerName, setManagerName] = useState("");

  const list = useQuery({
    queryKey: ["member-billing-corkage"],
    queryFn: () => apiRequest<Paged<CorkRow>>("/api/members/me/billing/corkage?page=1&pageSize=50"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/members/me/billing/corkage", {
        method: "POST",
        body: JSON.stringify({
          itemDescription,
          feeAmount: Number(feeAmount) || 0,
          authorizedByManager: authorized,
          managerName: managerName || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Corkage charge logged. Pay at the Finance corkage desk.");
      setItemDescription("");
      void qc.invalidateQueries({ queryKey: ["member-billing-corkage"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <PageFrame>
      <PageHeader
        title="Corkage"
        description="Log outside food & beverage corkage. Finance collects payment and issues the receipt."
      />

      <form
        className="grid gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!itemDescription.trim()) {
            toast.error("Describe the items.");
            return;
          }
          if (authorized && !managerName.trim()) {
            toast.error("Manager name is required when authorized.");
            return;
          }
          create.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          <Label>Item description</Label>
          <Input
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            placeholder="2x Outside wine bottles"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <Label>Fee amount (Ksh)</Label>
          <Input
            type="number"
            min="0"
            value={feeAmount}
            onChange={(e) => setFeeAmount(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          Authorized by manager
        </label>
        {authorized ? (
          <label className="grid gap-1 text-sm">
            <Label>Manager name</Label>
            <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} />
          </label>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending}>
            Log corkage charge
          </Button>
        </div>
      </form>

      <section className="rounded-xl border border-border bg-card">
        {(list.data?.items ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No corkage charges yet.</p>
        ) : (
          (list.data?.items ?? []).map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
            >
              <div>
                <p className="font-medium">{row.itemDescription}</p>
                <p className="text-sm text-muted-foreground">
                  {formatKes(row.feeAmount)} · {row.status}
                  {row.receiptNo ? ` · ${row.receiptNo}` : ""}
                </p>
              </div>
              {row.status === "PENDING" ? (
                <Button asChild size="sm">
                  <Link
                    to="/payment"
                    search={{
                      purpose: "corkage",
                      amount: row.feeAmount,
                      nmId: row.id,
                      desc: row.itemDescription,
                    }}
                  >
                    Pay now
                  </Link>
                </Button>
              ) : null}
            </div>
          ))
        )}
      </section>
    </PageFrame>
  );
}
