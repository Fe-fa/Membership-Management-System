import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

import {
  type CommitteeDetail,
  useCurrentCommittee,
  useInvalidateCommittee,
} from "./committee/committeeDesk";

export function CommitteeTermPage() {
  const current = useCurrentCommittee();
  const invalidate = useInvalidateCommittee();
  const committee = current.data;
  const [termForm, setTermForm] = useState({
    committeeName: "",
    termStart: "",
    termEnd: "",
  });
  const [editForm, setEditForm] = useState({
    committeeName: "",
    termStart: "",
    termEnd: "",
  });

  const createTerm = useMutation({
    mutationFn: () =>
      apiRequest<CommitteeDetail>("/api/committees", {
        method: "POST",
        body: JSON.stringify({
          committeeName: termForm.committeeName.trim(),
          termStart: termForm.termStart || null,
          termEnd: termForm.termEnd || null,
          type: "main",
        }),
      }),
    onSuccess: (data) => {
      toast.success(`Created “${data.committeeName}”. Previous active term was closed.`);
      setTermForm({ committeeName: "", termStart: "", termEnd: "" });
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const updateTerm = useMutation({
    mutationFn: () => {
      if (!committee) throw new Error("No active committee.");
      return apiRequest<CommitteeDetail>(`/api/committees/${committee.committeeId}`, {
        method: "PUT",
        body: JSON.stringify({
          committeeName: editForm.committeeName.trim(),
          termStart: editForm.termStart || null,
          termEnd: editForm.termEnd || null,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Committee term updated.");
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  useEffect(() => {
    if (committee) {
      setEditForm({
        committeeName: committee.committeeName,
        termStart: committee.termStart ?? "",
        termEnd: committee.termEnd ?? "",
      });
    }
  }, [committee?.committeeId, committee?.committeeName, committee?.termStart, committee?.termEnd]);

  const busy = createTerm.isPending || updateTerm.isPending;

  return (
    <PageFrame>
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Committee term"
        description="Edit the active term, or create a new one. Creating a new term deactivates the previous active committee of the same type."
      />

      <div className="space-y-8">
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Current term</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {current.isLoading
                ? "Loading the active committee term."
                : committee
                  ? `${committee.committeeName}${committee.termStart ? ` · ${committee.termStart}` : ""}${
                      committee.termEnd ? ` → ${committee.termEnd}` : ""
                    }`
                  : "No active committee yet."}
            </p>
          </div>
          <Card>
            <CardContent className="grid gap-3 pt-6">
              {current.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !committee ? (
                <p className="text-sm text-muted-foreground">Create a term below to begin.</p>
              ) : (
                <>
                  <label className="grid gap-1 text-sm">
                    <Label htmlFor="edit-name">Committee name</Label>
                    <Input
                      id="edit-name"
                      value={editForm.committeeName}
                      onChange={(e) => setEditForm((f) => ({ ...f, committeeName: e.target.value }))}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <Label htmlFor="edit-start">Term start</Label>
                      <Input
                        id="edit-start"
                        type="date"
                        value={editForm.termStart}
                        onChange={(e) => setEditForm((f) => ({ ...f, termStart: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <Label htmlFor="edit-end">Term end</Label>
                      <Input
                        id="edit-end"
                        type="date"
                        value={editForm.termEnd}
                        onChange={(e) => setEditForm((f) => ({ ...f, termEnd: e.target.value }))}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Non-officer members: {committee.nonOfficerCount}/8 · Aviation-active:{" "}
                    {committee.aviationActiveNonOfficers}
                    {committee.aviationRuleMet ? "" : " — Article 19 not met yet"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || editForm.committeeName.trim().length < 3}
                    onClick={() => updateTerm.mutate()}
                  >
                    {updateTerm.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Save term details
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">New committee term</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Creating a new term deactivates the previous active committee of the same type.
            </p>
          </div>
          <Card>
            <CardContent className="grid gap-3 pt-6">
              <label className="grid gap-1 text-sm">
                <Label htmlFor="new-name">Committee name</Label>
                <Input
                  id="new-name"
                  value={termForm.committeeName}
                  onChange={(e) => setTermForm((f) => ({ ...f, committeeName: e.target.value }))}
                  placeholder="e.g. Main Committee 2026–2027"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <Label htmlFor="new-start">Term start</Label>
                  <Input
                    id="new-start"
                    type="date"
                    value={termForm.termStart}
                    onChange={(e) => setTermForm((f) => ({ ...f, termStart: e.target.value }))}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <Label htmlFor="new-end">Term end</Label>
                  <Input
                    id="new-end"
                    type="date"
                    value={termForm.termEnd}
                    onChange={(e) => setTermForm((f) => ({ ...f, termEnd: e.target.value }))}
                  />
                </label>
              </div>
              <Button
                type="button"
                disabled={busy || termForm.committeeName.trim().length < 3}
                onClick={() => createTerm.mutate()}
              >
                {createTerm.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create term
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageFrame>
  );
}
