import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatKes } from "@/utils/format";

type Line = { description: string; unitPrice: string; quantity: string };

type CustomRow = {
  id: number;
  category: string;
  totalAmount: number;
  status: string;
  receiptNo?: string | null;
  lineItems: { description: string }[];
};

type Paged<T> = { items: T[] };

const CATEGORIES = [
  { value: "FACILITY_HIRE", label: "Facility hire" },
  { value: "EVENT_SPACE_DEPOSIT", label: "Event space deposit" },
  { value: "DAMAGE_FEE", label: "Damage fee" },
  { value: "GUEST_DAY_PASS", label: "Guest day pass" },
];

export function MemberCustomChargesPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("FACILITY_HIRE");
  const [lines, setLines] = useState<Line[]>([{ description: "", unitPrice: "0", quantity: "1" }]);

  const lineTotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0),
        0,
      ),
    [lines],
  );

  const list = useQuery({
    queryKey: ["member-billing-custom"],
    queryFn: () => apiRequest<Paged<CustomRow>>("/api/members/me/billing/custom?page=1&pageSize=50"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest("/api/members/me/billing/custom", {
        method: "POST",
        body: JSON.stringify({
          category,
          lineItems: lines.map((l) => ({
            description: l.description,
            unitPrice: Number(l.unitPrice) || 0,
            quantity: Number(l.quantity) || 0,
          })),
        }),
      }),
    onSuccess: () => {
      toast.success("Custom charge created. Pay at the Finance custom charges desk.");
      setLines([{ description: "", unitPrice: "0", quantity: "1" }]);
      void qc.invalidateQueries({ queryKey: ["member-billing-custom"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <PageFrame>
      <PageHeader
        title="Custom charges"
        description="Create facility hire, deposits, damage fees, or guest passes. Finance collects payment."
      />

      <form
        className="grid gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (lines.some((l) => !l.description.trim())) {
            toast.error("Each line needs a description.");
            return;
          }
          create.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          <Label>Category</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line items</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setLines((prev) => [...prev, { description: "", unitPrice: "0", quantity: "1" }])
              }
            >
              <Plus className="size-4" />
              Add line
            </Button>
          </div>
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_6rem_5rem_auto]"
            >
              <Input
                placeholder="Description"
                value={line.description}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l)),
                  )
                }
              />
              <Input
                type="number"
                placeholder="Price"
                value={line.unitPrice}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) => (i === idx ? { ...l, unitPrice: e.target.value } : l)),
                  )
                }
              />
              <Input
                type="number"
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)),
                  )
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={lines.length <= 1}
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">Total {formatKes(lineTotal)}</p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending}>
            Create charge
          </Button>
        </div>
      </form>

      <section className="rounded-xl border border-border bg-card">
        {(list.data?.items ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No custom charges yet.</p>
        ) : (
          (list.data?.items ?? []).map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
            >
              <div>
                <p className="font-medium">
                  {row.category} · {row.lineItems.map((l) => l.description).join(", ")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatKes(row.totalAmount)} · {row.status}
                  {row.receiptNo ? ` · ${row.receiptNo}` : ""}
                </p>
              </div>
              {row.status === "PENDING" ? (
                <Button asChild size="sm">
                  <Link
                    to="/payment"
                    search={{
                      purpose: "other",
                      amount: row.totalAmount,
                      nmId: row.id,
                      desc: `${row.category}: ${row.lineItems.map((l) => l.description).join(", ")}`,
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
