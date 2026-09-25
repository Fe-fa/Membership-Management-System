import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveInvoiceSetup, useInvoiceSetup } from "@/services/finance/invoiceSetup";
import { extractErrorMessage } from "@/services/membership/api";
import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";
import { clubLogoUrl } from "@/utils/clubLogo";
import { buildInvoiceHtml, type InvoiceDocument } from "@/utils/financeExport";
import { buildReceiptHtml, type ReceiptDocument } from "@/utils/receiptDocument";
import {
  DEFAULT_PAYMENT_SETUP,
  emptyField,
  emptyMethod,
  emptyParameter,
  mergePaymentSetup,
  type ExtraParameter,
  type PaymentMethodBlock,
  type PaymentSetup,
  type ProrationMode,
} from "@/utils/invoiceSetup";
import { cn } from "@/utils/cn";

function sampleInvoice(brand: { clubName: string; clubLogo: string | null }, setup: PaymentSetup): InvoiceDocument {
  return {
    invoiceId: 0,
    invoiceNo: "INV-2026-000001",
    accountId: 1,
    year: new Date().getFullYear(),
    memberName: "Sample Member",
    membershipNo: "AC-0001",
    membershipType: "Full Membership",
    amount: 39500,
    amountPaid: 0,
    balance: 39500,
    dueDate: `${new Date().getFullYear()}-02-28`,
    issuedAt: new Date().toISOString(),
    status: "ISSUED",
    emailSent: false,
    clubName: brand.clubName,
    clubLogo: brand.clubLogo,
    setup,
  };
}

function sampleReceipt(brand: { clubName: string; clubLogo: string | null }, setup: PaymentSetup): ReceiptDocument {
  return {
    transactionId: 1,
    receiptId: 1,
    clubName: brand.clubName,
    clubLogo: brand.clubLogo,
    receiptNumber: "RCT-2026-000001",
    issuedDate: new Date().toISOString(),
    paymentDate: new Date().toISOString(),
    payerName: "Sample Member",
    payerCategory: "Member",
    membershipNo: "AC-0001",
    membershipType: "Full Membership",
    feeType: "Annual subscription",
    paymentMethod: "M-Pesa",
    paymentMethodCode: "MPESA",
    mpesaCode: "QK12ABC345",
    amount: 39500,
    amountInWords: "Thirty nine thousand five hundred Kenya shillings only",
    currency: "KES",
    status: "PAID",
    issuedBy: "Finance desk",
    purpose: "Annual subscription",
    setup,
  };
}

export function InvoiceSetupPage() {
  return <PaymentSetupPage />;
}

export function PaymentSetupPage() {
  const tenant = useCurrentTenant();
  const brand = tenantDocumentBrand(tenant.data);
  const queryClient = useQueryClient();
  const saved = useInvoiceSetup();
  const [draft, setDraft] = useState<PaymentSetup | null>(null);
  const [tab, setTab] = useState("invoice");
  const setup = draft ?? saved.data ?? DEFAULT_PAYMENT_SETUP;

  const invoicePreview = useMemo(
    () => buildInvoiceHtml(sampleInvoice(brand, mergePaymentSetup(setup))),
    [brand, setup],
  );
  const receiptPreview = useMemo(
    () => buildReceiptHtml(sampleReceipt(brand, mergePaymentSetup(setup))),
    [brand, setup],
  );

  const save = useMutation({
    mutationFn: () => saveInvoiceSetup(mergePaymentSetup(setup)),
    onSuccess: (next) => {
      setDraft(mergePaymentSetup(next));
      void queryClient.invalidateQueries({ queryKey: ["invoice-setup"] });
      toast.success("Payment setup saved. Invoices and receipts will use these details.");
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  function patch(update: Partial<PaymentSetup>) {
    setDraft(mergePaymentSetup({ ...setup, ...update }));
  }

  function patchMethod(id: string, update: Partial<PaymentMethodBlock>) {
    patch({
      methods: setup.methods.map((method) => (method.id === id ? { ...method, ...update } : method)),
    });
  }

  function patchParameter(id: string, update: Partial<ExtraParameter>) {
    patch({
      extraParameters: setup.extraParameters.map((item) => (item.id === id ? { ...item, ...update } : item)),
    });
  }

  return (
    <PageFrame width="lg">
      <PageHeader
        title=""
        description="Configure invoice and receipt layouts, choose which payment methods appear, and add extra fields for this club."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/finance/invoices">Back to invoices</Link>
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save payment setup
            </Button>
          </div>
        }
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Club identity (from system)</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {brand.clubLogo ? <img src={clubLogoUrl(brand.clubLogo)} alt="" className="h-12 w-auto" /> : null}
          <dl className="grid gap-1 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Company name</dt>
              <dd className="font-medium">{brand.clubName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Postal address</dt>
              <dd>{tenant.data?.addressLine?.trim() || "P.O. Box 40813 - 00100, Nairobi"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoice">Invoice setup</TabsTrigger>
          <TabsTrigger value="receipt">Receipt setup</TabsTrigger>
        </TabsList>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="space-y-4">
            <TabsContent value="invoice" className="mt-0 space-y-4">
              <DisplayCard title="Show on invoice">
                <Toggle
                  label="PIN number"
                  checked={setup.invoice.showPin}
                  onChange={(showPin) => patch({ invoice: { ...setup.invoice, showPin } })}
                />
                <Toggle
                  label="Due date"
                  checked={setup.invoice.showDueDate}
                  onChange={(showDueDate) => patch({ invoice: { ...setup.invoice, showDueDate } })}
                />
                <Toggle
                  label="Credits column"
                  checked={setup.invoice.showCredits}
                  onChange={(showCredits) => patch({ invoice: { ...setup.invoice, showCredits } })}
                />
              </DisplayCard>
              <ProrationModeCard
                value={setup.prorationMode}
                onChange={(prorationMode) => patch({ prorationMode })}
              />
              <SharedFields setup={setup} patch={patch} />
            </TabsContent>

            <TabsContent value="receipt" className="mt-0 space-y-4">
              <DisplayCard title="Show on receipt">
                <Toggle
                  label="PIN number"
                  checked={setup.receipt.showPin}
                  onChange={(showPin) => patch({ receipt: { ...setup.receipt, showPin } })}
                />
                <Toggle
                  label="Website"
                  checked={setup.receipt.showWebsite}
                  onChange={(showWebsite) => patch({ receipt: { ...setup.receipt, showWebsite } })}
                />
                <Toggle
                  label="Amount in words"
                  checked={setup.receipt.showAmountInWords}
                  onChange={(showAmountInWords) => patch({ receipt: { ...setup.receipt, showAmountInWords } })}
                />
                <Toggle
                  label="Signature lines"
                  checked={setup.receipt.showSignatures}
                  onChange={(showSignatures) => patch({ receipt: { ...setup.receipt, showSignatures } })}
                />
              </DisplayCard>
              <SharedFields setup={setup} patch={patch} />
            </TabsContent>

            <PaymentMethodsCard
              methods={setup.methods}
              kind={tab === "receipt" ? "receipt" : "invoice"}
              onChange={(methods) => patch({ methods })}
              onPatch={patchMethod}
            />

            <ExtraParametersCard
              items={setup.extraParameters}
              kind={tab === "receipt" ? "receipt" : "invoice"}
              onChange={(extraParameters) => patch({ extraParameters })}
              onPatch={patchParameter}
            />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">{tab === "receipt" ? "Receipt preview" : "Invoice preview"}</h2>
            <div className="invoice-preview-frame mt-3 min-h-[28rem] overflow-auto rounded-xl border border-border bg-white">
              <iframe
                title={tab === "receipt" ? "Receipt setup preview" : "Invoice setup preview"}
                srcDoc={tab === "receipt" ? receiptPreview : invoicePreview}
                className="min-h-[40rem] w-full border-0"
              />
            </div>
          </section>
        </div>
      </Tabs>
    </PageFrame>
  );
}

function SharedFields({
  setup,
  patch,
}: {
  setup: PaymentSetup;
  patch: (update: Partial<PaymentSetup>) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Shared details</h2>
      <div className="mt-3 grid gap-3">
        <Field label="PIN" value={setup.pin} onChange={(pin) => patch({ pin })} />
        <Field label="Website" value={setup.website} onChange={(website) => patch({ website })} />
        <Field label="Payable note" value={setup.payableNote} onChange={(payableNote) => patch({ payableNote })} />
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Extra note</span>
          <textarea
            className="min-h-[4.5rem] rounded-md border border-input bg-white px-3 py-2 text-sm"
            value={setup.extraNote}
            onChange={(e) => patch({ extraNote: e.target.value })}
          />
        </label>
      </div>
    </section>
  );
}

function PaymentMethodsCard({
  methods,
  kind,
  onChange,
  onPatch,
}: {
  methods: PaymentMethodBlock[];
  kind: "invoice" | "receipt";
  onChange: (next: PaymentMethodBlock[]) => void;
  onPatch: (id: string, update: Partial<PaymentMethodBlock>) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Payment methods</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...methods, emptyMethod()])}>
          <Plus className="size-4" />
          Add method
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Tick Invoice and/or Receipt to print this method. Add or remove the lines under each method.
      </p>
      <div className="mt-3 space-y-3">
        {methods.map((method) => {
          const shown = kind === "invoice" ? method.showOnInvoice : method.showOnReceipt;
          return (
            <div key={method.id} className={cn("rounded-lg border p-3", shown ? "border-primary/40 bg-primary/5" : "border-slate-200")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    className="h-8 bg-white"
                    value={method.title}
                    onChange={(e) => onPatch(method.id, { title: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        checked={method.showOnInvoice}
                        onCheckedChange={(value) => onPatch(method.id, { showOnInvoice: value === true })}
                      />
                      Invoice
                    </label>
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        checked={method.showOnReceipt}
                        onCheckedChange={(value) => onPatch(method.id, { showOnReceipt: value === true })}
                      />
                      Receipt
                    </label>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onChange(methods.filter((item) => item.id !== method.id))}
                  aria-label={`Remove ${method.title}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {method.fields.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      className="h-8 bg-white"
                      value={item.label}
                      placeholder="Label"
                      onChange={(e) => {
                        const fields = method.fields.map((field, fieldIndex) =>
                          fieldIndex === index ? { ...field, label: e.target.value } : field,
                        );
                        onPatch(method.id, { fields });
                      }}
                    />
                    <Input
                      className="h-8 bg-white"
                      value={item.value}
                      placeholder="Value"
                      onChange={(e) => {
                        const fields = method.fields.map((field, fieldIndex) =>
                          fieldIndex === index ? { ...field, value: e.target.value } : field,
                        );
                        onPatch(method.id, { fields });
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => onPatch(method.id, { fields: method.fields.filter((field) => field.id !== item.id) })}
                      aria-label="Remove field"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => onPatch(method.id, { fields: [...method.fields, emptyField()] })}>
                  <Plus className="size-3.5" />
                  Add field
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ExtraParametersCard({
  items,
  kind,
  onChange,
  onPatch,
}: {
  items: ExtraParameter[];
  kind: "invoice" | "receipt";
  onChange: (next: ExtraParameter[]) => void;
  onPatch: (id: string, update: Partial<ExtraParameter>) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Other parameters</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, emptyParameter()])}>
          <Plus className="size-4" />
          Add parameter
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Extra lines any club can add or remove. Tick Invoice and/or Receipt.
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No extra parameters yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => {
            const shown = kind === "invoice" ? item.showOnInvoice : item.showOnReceipt;
            return (
            <div key={item.id} className={cn("rounded-lg border p-3", shown ? "border-primary/40 bg-primary/5" : "border-slate-200")}>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  className="h-8 bg-white"
                  value={item.label}
                  placeholder="Label"
                  onChange={(e) => onPatch(item.id, { label: e.target.value })}
                />
                <Input
                  className="h-8 bg-white"
                  value={item.value}
                  placeholder="Value"
                  onChange={(e) => onPatch(item.id, { value: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onChange(items.filter((row) => row.id !== item.id))}
                  aria-label="Remove parameter"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={item.showOnInvoice}
                    onCheckedChange={(value) => onPatch(item.id, { showOnInvoice: value === true })}
                  />
                  Invoice
                </label>
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={item.showOnReceipt}
                    onCheckedChange={(value) => onPatch(item.id, { showOnReceipt: value === true })}
                  />
                  Receipt
                </label>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
export function prorationBreakdown(mode: ProrationMode, fullAnnual: number, today = new Date()) {
  const asOf = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const yearStart = Date.UTC(asOf.getUTCFullYear(), 0, 1);
  const yearEnd = Date.UTC(asOf.getUTCFullYear(), 11, 31);
  const asOfMs = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const daysInYear = Math.round((yearEnd - yearStart) / 86_400_000) + 1; // 365, or 366 in a leap year
  const remainingDays = Math.min(Math.max(Math.round((yearEnd - asOfMs) / 86_400_000) + 1, 1), daysInYear);
  const remainingMonths = 13 - (asOf.getUTCMonth() + 1); // join month billed in full

  const full = Math.round(fullAnnual * 100) / 100;
  if (full <= 0) return { full, mode, daysInYear, remainingDays, remainingMonths, payable: 0, isProrated: false };

  const units = mode === "DAILY" ? remainingDays : remainingMonths;
  const divisor = mode === "DAILY" ? daysInYear : 12;
  // Single rounding at the end, half away from zero — same as the backend.
  const payable = Math.round((full * units) / divisor * 100) / 100;
  return { full, mode, daysInYear, remainingDays, remainingMonths, payable, isProrated: payable < full };
}

function money(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ProrationModeCard({
  value,
  onChange,
  sampleAnnual = 39500,
}: {
  value: ProrationMode;
  onChange: (next: ProrationMode) => void;
  sampleAnnual?: number;
}) {
  const options: { mode: ProrationMode; label: string }[] = [
    { mode: "DAILY", label: "Daily" },
    { mode: "MONTHLY", label: "Monthly" },
  ];
  const b = prorationBreakdown(value, sampleAnnual);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Fee proration</h2>
      <div className="mt-3 flex gap-2">
        {options.map(({ mode, label }) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(mode)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-slate-200 bg-white hover:border-primary/40 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DisplayCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {label}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input className="bg-white" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}