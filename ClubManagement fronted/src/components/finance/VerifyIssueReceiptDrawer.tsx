import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Download,
  FileImage,
  Loader2,
  Maximize2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatKes } from "@/utils/format";
import { cn } from "@/utils/cn";

export type VerifyPaymentRow = {
  transactionId: number;
  receiptNumber?: string | null;
  memberName?: string | null;
  membershipNo?: string | null;
  method?: string | null;
  methodCode?: string | null;
  amount: number;
  paymentDate?: string | null;
  mpesaCode?: string | null;
  chequeNo?: string | null;
  feeType?: string | null;
  feeTypeCode?: string | null;
  chequeBankName?: string | null;
  chequeBankCode?: string | null;
  chequeFileName?: string | null;
  chequeFileUrl?: string | null;
  applicationId?: number | null;
  applicationNo?: string | null;
  submittedAt?: string | null;
};

export type VerifyClearancePayload = {
  transactionId: number;
  receiptNumber: string;
  chequeNo: string;
  chequeBankName: string;
  chequeBankCode: string;
  mpesaCode: string;
  amountCleared: number;
};

type Props = {
  row: VerifyPaymentRow | null;
  busy?: boolean;
  approving?: boolean;
  rejecting?: boolean;
  onClose: () => void;
  onApprove: (payload: VerifyClearancePayload) => void;
  onReject: (payload: { transactionId: number; reason: string }) => void;
};

function methodKey(row: VerifyPaymentRow) {
  return `${row.methodCode ?? ""} ${row.method ?? ""}`.toUpperCase().replace(/[-\s]/g, "_");
}

function isImageUrl(url?: string | null, fileName?: string | null) {
  const hint = `${url ?? ""} ${fileName ?? ""}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(hint);
}

function defaultReceiptNumber(row: VerifyPaymentRow) {
  return row.receiptNumber?.trim() || `RCT-${String(row.transactionId).padStart(6, "0")}`;
}

function payerLabel(row: VerifyPaymentRow) {
  const name = row.memberName || "—";
  if (row.membershipNo) return `${name} · ${row.membershipNo}`;
  if (row.applicationNo) return `${name} · ${row.applicationNo}`;
  if (row.applicationId) return `${name} · APP-${String(row.applicationId).padStart(4, "0")}`;
  return name;
}

function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ToolbarButton({
  title,
  onClick,
  children,
  asChild,
  href,
}: {
  title: string;
  onClick?: () => void;
  children: ReactNode;
  asChild?: boolean;
  href?: string;
}) {
  const className =
    "inline-flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20";

  if (asChild && href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} title={title}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={className} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function ProofViewer({
  url,
  fileName,
  mpesaCode,
  chequeNo,
}: {
  url?: string | null;
  fileName?: string | null;
  mpesaCode?: string | null;
  chequeNo?: string | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const image = Boolean(url && isImageUrl(url, fileName));

  useEffect(() => {
    setZoom(1);
    setRotate(0);
  }, [url]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Proof viewer</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cheque scan or M-Pesa / transfer proof uploaded with the payment.
          </p>
        </div>
      </div>

      <div className="relative flex min-h-[22rem] flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-1.5 bg-gradient-to-b from-black/70 to-transparent px-3 py-2.5">
          <ToolbarButton title="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}>
            <ZoomOut className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Zoom in" onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}>
            <ZoomIn className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Rotate" onClick={() => setRotate((r) => (r + 90) % 360)}>
            <RotateCw className="size-3.5" />
          </ToolbarButton>
          {url ? (
            <a
              href={url}
              download={fileName || true}
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
              title="Download"
            >
              <Download className="size-3.5" />
            </a>
          ) : null}
          {url ? (
            <ToolbarButton title="Fullscreen" asChild href={url}>
              <Maximize2 className="size-3.5" />
            </ToolbarButton>
          ) : null}
          <span className="ml-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/80">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto p-4 pt-14">
          {url && image ? (
            <img
              src={url}
              alt={fileName || "Payment proof"}
              className="max-h-full max-w-full origin-center object-contain transition-transform duration-200 ease-out"
              style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}
            />
          ) : url ? (
            <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 px-6 py-8 text-center text-white">
              <FileImage className="mx-auto size-10 text-white/60" />
              <p className="text-sm font-medium">{fileName || "Payment proof"}</p>
              <Button asChild variant="secondary" size="sm">
                <a href={url} target="_blank" rel="noreferrer">
                  Open file
                </a>
              </Button>
            </div>
          ) : (
            <p className="max-w-xs px-4 text-center text-sm text-white/60">
              No image uploaded.
              {mpesaCode ? ` M-Pesa ref: ${mpesaCode}` : ""}
              {chequeNo ? ` Cheque no: ${chequeNo}` : ""}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function VerifyIssueReceiptDrawer({
  row,
  busy = false,
  approving = false,
  rejecting = false,
  onClose,
  onApprove,
  onReject,
}: Props) {
  const open = row != null;
  const isCheque = row ? methodKey(row).includes("CHEQUE") : false;
  const category = row?.membershipNo ? "Member" : "Applicant";
  const feeLabel = row?.feeType || row?.feeTypeCode || "Fee";

  const [receiptNumber, setReceiptNumber] = useState("");
  const [overrideReceipt, setOverrideReceipt] = useState(false);
  const [chequeNo, setChequeNo] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeBankCode, setChequeBankCode] = useState("");
  const [mpesaCode, setMpesaCode] = useState("");
  const [amountCleared, setAmountCleared] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    if (!row) return;
    setReceiptNumber(defaultReceiptNumber(row));
    setOverrideReceipt(false);
    setChequeNo(row.chequeNo ?? "");
    setChequeBank(row.chequeBankName ?? "");
    setChequeBankCode(row.chequeBankCode ?? "");
    setMpesaCode(row.mpesaCode ?? "");
    setAmountCleared(String(row.amount ?? ""));
    setRejectReason("");
    setShowReject(false);
  }, [row]);

  const amountPreview = useMemo(() => {
    const n = Number(amountCleared);
    return Number.isFinite(n) ? formatKes(n) : "—";
  }, [amountCleared]);

  function handleApprove() {
    if (!row) return;
    const receipt = receiptNumber.trim();
    if (!receipt) {
      toast.error("Enter or confirm the receipt number (RCT-XXXXXX).");
      return;
    }
    const amount = Number(amountCleared);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter the amount cleared.");
      return;
    }
    if (isCheque && !chequeNo.trim()) {
      toast.error("Enter the cheque number.");
      return;
    }
    onApprove({
      transactionId: row.transactionId,
      receiptNumber: receipt,
      chequeNo: chequeNo.trim(),
      chequeBankName: chequeBank.trim(),
      chequeBankCode: chequeBankCode.trim(),
      mpesaCode: mpesaCode.trim(),
      amountCleared: amount,
    });
  }

  function handleReject() {
    if (!row) return;
    if (!rejectReason.trim()) {
      toast.error("Enter a rejection reason (e.g. Bounced Cheque, Illegible Image).");
      return;
    }
    onReject({ transactionId: row.transactionId, reason: rejectReason.trim() });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <SheetHeader className="sticky top-0 z-20 shrink-0 border-b border-border bg-background px-6 py-4 pr-12 text-left">
          <SheetTitle className="text-lg font-semibold tracking-tight">
            Verify &amp; issue receipt
          </SheetTitle>
          {row ? (
            <SheetDescription className="text-sm text-muted-foreground">
              {payerLabel(row)} · {feeLabel} · {formatKes(row.amount)}
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid h-full gap-0 lg:grid-cols-2">
            <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
              {row ? (
                <ProofViewer
                  url={row.chequeFileUrl}
                  fileName={row.chequeFileName}
                  mpesaCode={row.mpesaCode}
                  chequeNo={row.chequeNo}
                />
              ) : null}
            </div>

            <div className="space-y-5 p-5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Verification</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Confirm clearance details, then clear the payment and issue the official receipt.
                </p>
              </div>

              {row ? (
                <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{payerLabel(row)}</p>
                    <Badge variant="secondary" className="bg-white/80 text-slate-700">
                      {category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-sky-300 bg-sky-100/80 text-sky-900"
                    >
                      {feeLabel}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Submitted {formatStamp(row.submittedAt || row.paymentDate)}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm sm:col-span-2">
                  <Label htmlFor="verify-payment-method">Payment method</Label>
                  <Input
                    id="verify-payment-method"
                    value={row?.method || row?.methodCode || "—"}
                    readOnly
                    className="bg-muted/40"
                  />
                </label>

                {isCheque ? (
                  <>
                    <label className="grid gap-1.5 text-sm">
                      <Label htmlFor="verify-cheque-no">Cheque / ref no.</Label>
                      <Input
                        id="verify-cheque-no"
                        value={chequeNo}
                        onChange={(e) => setChequeNo(e.target.value)}
                        placeholder="Cheque number"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <Label htmlFor="verify-cheque-bank">Bank &amp; branch</Label>
                      <Input
                        id="verify-cheque-bank"
                        value={chequeBank}
                        onChange={(e) => setChequeBank(e.target.value)}
                        placeholder="e.g. Absa Bank - Westlands"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <Label htmlFor="verify-cheque-bank-code">
                        Bank code{" "}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="verify-cheque-bank-code"
                        value={chequeBankCode}
                        onChange={(e) => setChequeBankCode(e.target.value.toUpperCase())}
                        placeholder="e.g. 03 / KCBLKENX"
                      />
                    </label>
                  </>
                ) : (
                  <label className="grid gap-1.5 text-sm sm:col-span-2">
                    <Label htmlFor="verify-mpesa-ref">Cheque / ref no.</Label>
                    <Input
                      id="verify-mpesa-ref"
                      value={mpesaCode}
                      onChange={(e) => setMpesaCode(e.target.value)}
                      placeholder="M-Pesa or bank reference"
                    />
                  </label>
                )}
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-end justify-between gap-3">
                  <label className="grid flex-1 gap-1.5 text-sm">
                    <Label htmlFor="verify-amount-cleared" className="text-emerald-900">
                      Amount cleared (Ksh)
                    </Label>
                    <Input
                      id="verify-amount-cleared"
                      value={amountCleared}
                      readOnly
                      className="border-emerald-200 bg-white/80 font-semibold tabular-nums"
                    />
                  </label>
                  <div className="pb-1 text-right">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-700/80">
                      Formatted
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-emerald-950">
                      {amountPreview}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="verify-receipt-number">Receipt number</Label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={overrideReceipt}
                      onCheckedChange={(checked) => setOverrideReceipt(checked === true)}
                    />
                    Manual override
                  </label>
                </div>
                <Input
                  id="verify-receipt-number"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value.toUpperCase())}
                  disabled={!overrideReceipt}
                  placeholder={row ? defaultReceiptNumber(row) : "RCT-000000"}
                  className={cn(!overrideReceipt && "bg-muted/40")}
                />
              </div>

              {showReject ? (
                <div className="grid gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <Label htmlFor="verify-reject-reason">Rejection reason</Label>
                  <Textarea
                    id="verify-reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Bounced Cheque, Illegible Image"
                    rows={3}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <SheetFooter className="sticky bottom-0 z-20 shrink-0 gap-3 border-t border-border bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          <div className="flex flex-wrap gap-2">
            {showReject ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setShowReject(false)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={handleReject}
                >
                  {rejecting ? <Loader2 className="size-4 animate-spin" /> : null}
                  Confirm reject
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                onClick={() => setShowReject(true)}
              >
                Reject Payment
              </Button>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || showReject}
              className="bg-emerald-700 text-white hover:bg-emerald-800"
              onClick={handleApprove}
            >
              {approving ? <Loader2 className="size-4 animate-spin" /> : null}
              Clear Payment &amp; Issue Receipt
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
