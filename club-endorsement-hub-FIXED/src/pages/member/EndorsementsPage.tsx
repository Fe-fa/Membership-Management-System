
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

type Invite = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  applicantPhotoUrl?: string | null;
  membershipType: string;
  role: string;
  status: string;
  endorserYearOfJoining?: number | null;
};

type HistoryRow = {
  applicationId: number;
  applicationNo: string;
  applicantName: string;
  role: string;
  outcome: string;
  completedAt: string;
};

export function EndorsementsPage() {
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: ["member-endorsements"],
    queryFn: () =>
      apiRequest<{ pending: Invite[]; history: HistoryRow[] }>("/api/members/me/endorsements"),
  });
  const [active, setActive] = useState<Invite | null>(null);
  const [form, setForm] = useState({
    yearsKnownCandidate: "",
    personalKnowledge: "",
    professionalKnowledge: "",
    valueAddition: "",
    integrityConfirmed: false,
    signatureImageUrl: "",
  });

  const submit = useMutation({
    mutationFn: () =>
      apiRequest(`/api/members/me/endorsements/${active!.applicationId}`, {
        method: "POST",
        body: JSON.stringify({
          endorserRole: active!.role,
          yearsKnownCandidate: Number(form.yearsKnownCandidate),
          personalKnowledge: form.personalKnowledge,
          professionalKnowledge: form.professionalKnowledge,
          valueAddition: form.valueAddition,
          integrityConfirmed: form.integrityConfirmed,
          signatureImageUrl: form.signatureImageUrl.startsWith("typed:")
            ? form.signatureImageUrl
            : `typed:${form.signatureImageUrl}`,
        }),
      }),
    onSuccess: () => {
      toast.success("Endorsement complete.");
      setActive(null);
      void queryClient.invalidateQueries({ queryKey: ["member-endorsements"] });
      void queryClient.invalidateQueries({ queryKey: ["member-me"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const pending = data.data?.pending ?? [];
  const history = data.data?.history ?? [];

  return (
    <PageFrame>
      <PageHeader
        title="Proposer / Seconder requests"
        description="You were named because you already meet the eligibility rule (Life, Full, Country or Overseas; three continuous years)."
      />
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Requests ({pending.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4 space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding endorsements.</p>
          ) : (
            pending.map((row) => (
              <button
                key={`${row.applicationId}-${row.role}`}
                type="button"
                className="w-full rounded-xl border border-border bg-card p-4 text-left"
                onClick={() => {
                  setActive(row);
                  setForm({
                    yearsKnownCandidate: "",
                    personalKnowledge: "",
                    professionalKnowledge: "",
                    valueAddition: "",
                    integrityConfirmed: false,
                    signatureImageUrl: "",
                  });
                }}
              >
                <p className="font-medium">
                  You have been selected as {row.role} for {row.applicantName}'s {row.membershipType} Membership
                  application.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{row.applicationNo}</p>
              </button>
            ))
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-4 space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have not proposed or seconded an application yet.</p>
          ) : (
            history.map((row) => (
              <div key={`${row.applicationId}-${row.role}-${row.completedAt}`} className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <p className="font-medium">
                  {row.role} for {row.applicantName}
                </p>
                <p className="text-muted-foreground">
                  {row.applicationNo} Â· {row.outcome}
                </p>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(active)} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {active?.role} — {active?.applicantName}
            </DialogTitle>
            <DialogDescription>
              {active?.membershipType} membership. Year of joining: {active?.endorserYearOfJoining ?? "from your profile"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="text-sm">
              Years the candidate has been known to you
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={form.yearsKnownCandidate}
                onChange={(e) => setForm({ ...form, yearsKnownCandidate: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Personal-knowledge statement
              <Textarea className="mt-1" value={form.personalKnowledge} onChange={(e) => setForm({ ...form, personalKnowledge: e.target.value })} />
            </label>
            <label className="text-sm">
              Professional-knowledge statement
              <Textarea className="mt-1" value={form.professionalKnowledge} onChange={(e) => setForm({ ...form, professionalKnowledge: e.target.value })} />
            </label>
            <label className="text-sm">
              Value-addition statement
              <Textarea className="mt-1" value={form.valueAddition} onChange={(e) => setForm({ ...form, valueAddition: e.target.value })} />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={form.integrityConfirmed}
                onCheckedChange={(value) => setForm({ ...form, integrityConfirmed: value === true })}
              />
              I am satisfied as to the candidate's integrity in public life
            </label>
            <label className="text-sm">
              Signature (type your full name)
              <Input className="mt-1 font-serif" value={form.signatureImageUrl.replace(/^typed:/, "")} onChange={(e) => setForm({ ...form, signatureImageUrl: e.target.value })} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={submit.isPending} onClick={() => submit.mutate()}>
              Submit endorsement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
