import { useState } from "react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readAutomations, saveAutomations, type ScheduledAction } from "@/lib/userPreferences";

export function AutomationsSettingsPage() {
  const [rows, setRows] = useState<ScheduledAction[]>(readAutomations);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState("weekly");

  function persist(next: ScheduledAction[]) {
    setRows(next);
    saveAutomations(next);
  }

  return (
    <PageFrame width="sm">
      <PageHeader
        title="Automations & Schedules"
        description="View and manage background automations, recurring updates, or scheduled actions."
      />
      <form
        className="space-y-3 rounded-xl border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          persist([
            ...rows,
            { id: crypto.randomUUID(), name: name.trim(), cadence, enabled: true },
          ]);
          setName("");
          toast.success("Scheduled action added.");
        }}
      >
        <label className="grid gap-1 text-sm">
          <Label>Action name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscription reminder" />
        </label>
        <label className="grid gap-1 text-sm">
          <Label>Cadence</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <Button type="submit">Add scheduled action</Button>
      </form>
      <ul className="divide-y rounded-xl border text-sm">
        {rows.length === 0 ? (
          <li className="px-3 py-3 text-muted-foreground">No scheduled actions yet.</li>
        ) : (
          rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <label className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={row.enabled}
                  onChange={(e) =>
                    persist(rows.map((r) => (r.id === row.id ? { ...r, enabled: e.target.checked } : r)))
                  }
                />
                <span className="truncate">
                  {row.name} · {row.cadence}
                </span>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => persist(rows.filter((r) => r.id !== row.id))}
              >
                Remove
              </Button>
            </li>
          ))
        )}
      </ul>
    </PageFrame>
  );
}
