import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Filter, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  REPORT_COLUMN_GROUPS,
  REPORT_COLUMNS,
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
  const [columnQuery, setColumnQuery] = useState("");
  const [showColumnSearch, setShowColumnSearch] = useState(false);
  const [methodQuery, setMethodQuery] = useState("");
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const setup = draft ?? saved.data ?? DEFAULT_PAYMENT_SETUP;
  const columnNeedle = columnQuery.trim().toLowerCase();
  const allColumnsOn = REPORT_COLUMNS.every((column) => setup.reportColumns.includes(column.id));

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
      toast.success("Setup saved. Invoices, receipts, and reports will use these details.");
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
        title="Setup"
        description="Club identity, invoice and receipt layouts, payment methods, and the columns used on reports, Excel, and print."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowColumnSearch((open) => !open)}
            >
              <Filter className="size-4" />
              Filter
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save setup
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Report columns</h2>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allColumnsOn}
                onCheckedChange={(value) => {
                  if (value === true) {
                    patch({ reportColumns: REPORT_COLUMNS.map((column) => column.id) });
                    return;
                  }
                  patch({ reportColumns: [REPORT_COLUMNS[0].id] });
                }}
              />
              Select all
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The same choice is used on the finance desk, the revenue report, invoices, applications, and the member register.
          </p>
          {showColumnSearch ? (
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={columnQuery}
                onChange={(e) => setColumnQuery(e.target.value)}
                placeholder="Filter columns"
                className="bg-white pl-8"
                aria-label="Filter report columns"
              />
            </div>
          ) : null}
          <div className="mt-4 space-y-4">
            {REPORT_COLUMN_GROUPS.map((group) => {
              const columns = group.columns.filter((column) =>
                column.label.toLowerCase().includes(columnNeedle),
              );
              if (columns.length === 0) return null;
              return (
                <div key={group.title}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                  <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
                    {columns.map((column) => (
                      <SwitchRow
                        key={column.id}
                        label={column.label}
                        checked={setup.reportColumns.includes(column.id)}
                        onChange={(checked) => {
                          const next = checked
                            ? [...setup.reportColumns, column.id]
                            : setup.reportColumns.filter((id) => id !== column.id);
                          patch({ reportColumns: next.length > 0 ? next : [column.id] });
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Invoice settings</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {brand.clubLogo ? <img src={clubLogoUrl(brand.clubLogo)} alt="" className="h-10 w-auto" /> : null}
            <dl className="min-w-0 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Club identity (from system)</dt>
                <dd className="font-medium">{brand.clubName}</dd>
              </div>
              <dd className="text-muted-foreground">
                {tenant.data?.addressLine?.trim() || "P.O. Box 40813 - 00100, Nairobi"}
              </dd>
            </dl>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <div className="space-y-1">
              <SwitchRow
                label="PIN number"
                checked={setup.invoice.showPin}
                onChange={(showPin) => patch({ invoice: { ...setup.invoice, showPin } })}
              />
              <SwitchRow
                label="Due date"
                checked={setup.invoice.showDueDate}
                onChange={(showDueDate) => patch({ invoice: { ...setup.invoice, showDueDate } })}
              />
              <SwitchRow
                label="Credits column"
                checked={setup.invoice.showCredits}
                onChange={(showCredits) => patch({ invoice: { ...setup.invoice, showCredits } })}
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <p className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-muted-foreground">Invoice preview</p>
              <iframe
                title="Invoice setup preview"
                srcDoc={invoicePreview}
                className="h-52 w-full border-0"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="invoice">Invoice setup</TabsTrigger>
              <TabsTrigger value="receipt">Receipt settings</TabsTrigger>
            </TabsList>
            <TabsContent value="invoice" className="mt-4 space-y-4">
              <ProrationModeCard
                value={setup.prorationMode}
                onChange={(prorationMode) => patch({ prorationMode })}
              />
              <SharedFields setup={setup} patch={patch} />
            </TabsContent>
            <TabsContent value="receipt" className="mt-4 space-y-4">
              <div className="grid gap-1 sm:grid-cols-2">
                <SwitchRow
                  label="PIN number"
                  checked={setup.receipt.showPin}
                  onChange={(showPin) => patch({ receipt: { ...setup.receipt, showPin } })}
                />
                <SwitchRow
                  label="Website"
                  checked={setup.receipt.showWebsite}
                  onChange={(showWebsite) => patch({ receipt: { ...setup.receipt, showWebsite } })}
                />
                <SwitchRow
                  label="Amount in words"
                  checked={setup.receipt.showAmountInWords}
                  onChange={(showAmountInWords) => patch({ receipt: { ...setup.receipt, showAmountInWords } })}
                />
                <SwitchRow
                  label="Signature lines"
                  checked={setup.receipt.showSignatures}
                  onChange={(showSignatures) => patch({ receipt: { ...setup.receipt, showSignatures } })}
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <p className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-muted-foreground">Receipt preview</p>
                <iframe title="Receipt setup preview" srcDoc={receiptPreview} className="h-52 w-full border-0" />
              </div>
              <SharedFields setup={setup} patch={patch} />
            </TabsContent>
          </Tabs>
          <div className="mt-4">
            <ExtraParametersCard
              items={setup.extraParameters}
              kind={tab === "receipt" ? "receipt" : "invoice"}
              onChange={(extraParameters) => patch({ extraParameters })}
              onPatch={patchParameter}
            />
          </div>
        </section>

        <PaymentMethodsCard
          methods={setup.methods}
          query={methodQuery}
          onQuery={setMethodQuery}
          editingId={editingMethodId}
          onEdit={setEditingMethodId}
          saving={save.isPending}
          onSave={() => save.mutate()}
          onChange={(methods) => patch({ methods })}
          onPatch={patchMethod}
        />
      </div>
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
    <div>
      <h2 className="text-sm font-semibold">Shared details</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="PIN" value={setup.pin} onChange={(pin) => patch({ pin })} />
        <Field label="Website" value={setup.website} onChange={(website) => patch({ website })} />
        <Field label="Payable note" value={setup.payableNote} onChange={(payableNote) => patch({ payableNote })} />
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Extra note</span>
          <textarea
            className="min-h-[4.5rem] rounded-md border border-input bg-white px-3 py-2 text-sm"
            value={setup.extraNote}
            onChange={(e) => patch({ extraNote: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

function fieldValue(method: PaymentMethodBlock, labels: string[]) {
  const wanted = labels.map((label) => label.toLowerCase());
  return method.fields.find((item) => wanted.includes(item.label.trim().toLowerCase()))?.value ?? "";
}

function PaymentMethodsCard({
  methods,
  query,
  onQuery,
  editingId,
  onEdit,
  saving,
  onSave,
  onChange,
  onPatch,
}: {
  methods: PaymentMethodBlock[];
  query: string;
  onQuery: (next: string) => void;
  editingId: string | null;
  onEdit: (id: string | null) => void;
  saving: boolean;
  onSave: () => void;
  onChange: (next: PaymentMethodBlock[]) => void;
  onPatch: (id: string, update: Partial<PaymentMethodBlock>) => void;
}) {
  const needle = query.trim().toLowerCase();
  const rows = methods.filter((method) => {
    if (!needle) return true;
    const blob = [method.title, ...method.fields.map((field) => `${field.label} ${field.value}`)].join(" ").toLowerCase();
    return blob.includes(needle);
  });
  const editing = methods.find((method) => method.id === editingId) ?? null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Payment methods</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onSave()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save setup
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const next = emptyMethod();
              onChange([...methods, next]);
              onEdit(next.id);
            }}
          >
            <Plus className="size-4" />
            Add method
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Turn a method on for invoices, receipts, or both. Edit a row to change its lines.
      </p>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search payment methods"
          className="bg-white pl-8"
          aria-label="Filter payment methods"
        />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">Method</th>
              <th className="px-2 py-2 font-medium">Account name</th>
              <th className="px-2 py-2 font-medium">Account no.</th>
              <th className="px-2 py-2 font-medium">Branch</th>
              <th className="px-2 py-2 font-medium">Invoice</th>
              <th className="px-2 py-2 font-medium">Receipt</th>
              <th className="px-2 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-muted-foreground">
                  No payment methods match this search.
                </td>
              </tr>
            ) : (
              rows.map((method) => (
                <tr key={method.id} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium">{method.title || "Untitled"}</td>
                  <td className="px-2 py-2">{fieldValue(method, ["Account name", "Payable to"]) || "—"}</td>
                  <td className="px-2 py-2">{fieldValue(method, ["KES account", "Paybill no.", "USD account"]) || "—"}</td>
                  <td className="px-2 py-2">{fieldValue(method, ["Branch"]) || "—"}</td>
                  <td className="px-2 py-2">
                    <Switch
                      checked={method.showOnInvoice}
                      onCheckedChange={(showOnInvoice) => onPatch(method.id, { showOnInvoice })}
                      aria-label={`${method.title} on invoice`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Switch
                      checked={method.showOnReceipt}
                      onCheckedChange={(showOnReceipt) => onPatch(method.id, { showOnReceipt })}
                      aria-label={`${method.title} on receipt`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Edit ${method.title}`}
                        onClick={() => onEdit(editingId === method.id ? null : method.id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Remove ${method.title}`}
                        onClick={() => {
                          if (editingId === method.id) onEdit(null);
                          onChange(methods.filter((item) => item.id !== method.id));
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editing ? (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Method name</span>
            <Input
              className="bg-white"
              value={editing.title}
              onChange={(e) => onPatch(editing.id, { title: e.target.value })}
            />
          </label>
          <div className="mt-3 space-y-2">
            {editing.fields.map((item, index) => (
              <div key={item.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  className="h-8 bg-white"
                  value={item.label}
                  placeholder="Label"
                  onChange={(e) => {
                    const fields = editing.fields.map((field, fieldIndex) =>
                      fieldIndex === index ? { ...field, label: e.target.value } : field,
                    );
                    onPatch(editing.id, { fields });
                  }}
                />
                <Input
                  className="h-8 bg-white"
                  value={item.value}
                  placeholder="Value"
                  onChange={(e) => {
                    const fields = editing.fields.map((field, fieldIndex) =>
                      fieldIndex === index ? { ...field, value: e.target.value } : field,
                    );
                    onPatch(editing.id, { fields });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onPatch(editing.id, { fields: editing.fields.filter((field) => field.id !== item.id) })}
                  aria-label="Remove field"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPatch(editing.id, { fields: [...editing.fields, emptyField()] })}
            >
              <Plus className="size-3.5" />
              Add field
            </Button>
          </div>
        </div>
      ) : null}
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
    <div className="border-t border-slate-200 pt-4">
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
    </div>
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

function ProrationModeCard({
  value,
  onChange,
}: {
  value: ProrationMode;
  onChange: (next: ProrationMode) => void;
}) {
  const options: { mode: ProrationMode; label: string }[] = [
    { mode: "DAILY", label: "Daily" },
    { mode: "MONTHLY", label: "Monthly" },
  ];
  return (
    <div>
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
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <label className="flex min-w-0 items-center gap-2 text-sm">
        <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
        <span className="truncate">{label}</span>
      </label>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
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