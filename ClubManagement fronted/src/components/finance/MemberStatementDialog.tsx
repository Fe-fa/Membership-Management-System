import { useEffect, useRef, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";
import { buildStatementHtml, printHtmlDocument, type StatementDocument } from "@/utils/financeExport";
import { cn } from "@/utils/cn";

type SettlementMemberHit = {
  accountId: number;
  membershipNo: string;
  memberName: string;
  accountStatus: string;
  membershipType?: string | null;
};


type Props = {
  open: boolean;
  onClose: () => void;
  /** Staff lookup across the club; self prints only the signed-in member. */
  mode: "staff" | "self";
  year?: number;
};

function yearStart(year: number) {
  return `${year}-01-01`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function MemberStatementDialog({ open, onClose, mode, year }: Props) {
  const tenant = useCurrentTenant();
  const y = year ?? new Date().getFullYear();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [from, setFrom] = useState(yearStart(y));
  const [to, setTo] = useState(todayIso());
  const [picked, setPicked] = useState<SettlementMemberHit | null>(null);
  const [hits, setHits] = useState<SettlementMemberHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeLockTimer = useRef<number | null>(null);

  function dismiss() {
    if (closeLockTimer.current != null) window.clearTimeout(closeLockTimer.current);
    setClosing(true);
    onClose();
    closeLockTimer.current = window.setTimeout(() => {
      setClosing(false);
      closeLockTimer.current = null;
    }, 400);
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    return () => {
      if (closeLockTimer.current != null) window.clearTimeout(closeLockTimer.current);
    };
  }, []);

  useEffect(() => {
    if (open && closing) onClose();
  }, [open, closing, onClose]);

  useEffect(() => {
    if (!open) return;
    if (closing) return;
    setSearch("");
    setDebounced("");
    setPicked(null);
    setHits([]);
    setFrom(yearStart(y));
    setTo(todayIso());
  }, [open, y, closing]);

  useEffect(() => {
    if (!open || closing || mode !== "staff" || picked != null || debounced.length < 2) {
      if (picked != null || debounced.length < 2) setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    apiRequest<SettlementMemberHit[]>(
      `/api/finance/settlement/members?search=${encodeURIComponent(debounced)}&year=${y}`,
    )
      .then((rows) => {
        if (!cancelled) setHits(rows);
      })
      .catch((err) => {
        if (!cancelled) toast.error(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, debounced, y]);

  async function printStatement() {
    if (from > to) {
      toast.error("End date must be on or after the start date.");
      return;
    }
    try {
      setPrinting(true);
      const doc =
        mode === "self"
          ? await apiRequest<StatementDocument>(`/api/members/me/statement?from=${from}&to=${to}`)
          : await apiRequest<StatementDocument>(
              `/api/finance/statements/${picked!.accountId}?from=${from}&to=${to}`,
            );
      const user = readUser();
      printHtmlDocument(
        buildStatementHtml({
          ...doc,
          ...tenantDocumentBrand(tenant.data),
          issuedBy: user?.fullName?.trim() || user?.username || "—",
        }),
      );
      toast.success(
        mode === "self"
          ? "Your statement is ready to print."
          : `Statement for ${doc.membershipNo ?? picked?.membershipNo} · ${doc.memberName}.`,
      );
      dismiss();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setPrinting(false);
    }
  }

  const canPrint = mode === "self" || picked != null;

  return (
    <Dialog open={open && !closing} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <DialogContent
        className="z-[80] sm:max-w-lg"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          dismiss();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          dismiss();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "self" ? "My statement of account" : "Print member statement"}
          </DialogTitle>
          <DialogDescription>
            {mode === "self"
              ? "Choose a period and print your statement of account."
              : "Look up a member and print their statement of account."}
          </DialogDescription>
        </DialogHeader>

        {mode === "staff" ? (
          <div className="space-y-2">
            <Label htmlFor="statement-lookup">Member no. or email</Label>
            <Input
              id="statement-lookup"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPicked(null);
              }}
              placeholder="AC-0024 or member@email.com"
            />
            {picked ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                {picked.membershipNo} · {picked.memberName}
                {picked.membershipType ? ` · ${picked.membershipType}` : ""}
              </p>
            ) : searching ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </p>
            ) : hits.length > 0 ? (
              <ul className="max-h-40 overflow-auto rounded-md border border-slate-200">
                {hits.map((hit) => (
                  <li key={hit.accountId}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50",
                      )}
                      onClick={() => {
                        setPicked(hit);
                        setSearch(`${hit.membershipNo} · ${hit.memberName}`);
                        setHits([]);
                      }}
                    >
                      <span className="font-medium">
                        {hit.membershipNo} · {hit.memberName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {hit.membershipType || "—"} · {hit.accountStatus}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : debounced.length >= 2 ? (
              <p className="text-sm text-muted-foreground">No members matched that lookup.</p>
            ) : (
              <p className="text-sm text-muted-foreground"></p>
            )}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="statement-from">From</Label>
            <Input id="statement-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="statement-to">To</Label>
            <Input id="statement-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={dismiss}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" disabled={!canPrint || printing} onClick={() => void printStatement()}>
            {printing ? <Loader2 className="size-4 animate-spin" /> : <ScrollText className="size-4" />}
            Print statement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
