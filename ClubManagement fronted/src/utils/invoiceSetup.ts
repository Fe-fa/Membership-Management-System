import { ACEA_FINANCE } from "./aceaFinanceBrand";

export type PaymentField = {
  id: string;
  label: string;
  value: string;
};

export type PaymentMethodBlock = {
  id: string;
  code: string;
  title: string;
  enabled: boolean;
  showOnInvoice: boolean;
  showOnReceipt: boolean;
  fields: PaymentField[];
};

export type ExtraParameter = {
  id: string;
  label: string;
  value: string;
  showOnInvoice: boolean;
  showOnReceipt: boolean;
};

export type InvoiceDisplay = {
  showPin: boolean;
  showDueDate: boolean;
  showCredits: boolean;
};

export type ReceiptDisplay = {
  showPin: boolean;
  showWebsite: boolean;
  showAmountInWords: boolean;
  showSignatures: boolean;
};

export type ProrationMode = "DAILY" | "MONTHLY";

export type PaymentSetup = {
  pin: string;
  website: string;
  payableNote: string;
  extraNote: string;
  invoice: InvoiceDisplay;
  receipt: ReceiptDisplay;
  methods: PaymentMethodBlock[];
  extraParameters: ExtraParameter[];
  /** Controls how the first-year annual subscription is prorated for new joiners. */
  prorationMode: ProrationMode;
};

/** @deprecated Use PaymentSetup. Kept so existing invoice/email callers keep compiling. */
export type InvoiceSetup = PaymentSetup;

export function newSetupId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function field(id: string, label: string, value: string): PaymentField {
  return { id, label, value };
}

export function defaultPaymentMethods(): PaymentMethodBlock[] {
  return [
    {
      id: "bank",
      code: "BANK_TRANSFER",
      title: "Bank transfer",
      enabled: true,
      showOnInvoice: true,
      showOnReceipt: false,
      fields: [
        field("bank-note", "Remittance note", 'Bank remittance charges must be paid by the sender'),
        field("bank-name", "Bank name", ACEA_FINANCE.bankName),
        field("bank-branch", "Branch", ACEA_FINANCE.bankBranch),
        field("bank-account-name", "Account name", ACEA_FINANCE.accountName),
        field("bank-kes", "KES account", ACEA_FINANCE.kesAccount),
        field("bank-usd", "USD account", ACEA_FINANCE.usdAccount),
        field("bank-code", "Bank code", ACEA_FINANCE.bankCode),
        field("bank-branch-code", "Branch code", ACEA_FINANCE.branchCode),
        field("bank-swift", "SWIFT", ACEA_FINANCE.swift),
      ],
    },
    {
      id: "mpesa",
      code: "MPESA",
      title: "M-Pesa",
      enabled: true,
      showOnInvoice: true,
      showOnReceipt: false,
      fields: [
        field("mpesa-paybill", "Paybill no.", ACEA_FINANCE.mpesaPaybill),
        field("mpesa-account", "Account name", "Your Name / Membership No."),
      ],
    },
    {
      id: "cash",
      code: "CASH",
      title: "Cash",
      enabled: true,
      showOnInvoice: false,
      showOnReceipt: false,
      fields: [field("cash-note", "Instructions", "Pay at the finance desk, Wilson Airport.")],
    },
    {
      id: "cheque",
      code: "CHEQUE",
      title: "Cheque",
      enabled: true,
      showOnInvoice: false,
      showOnReceipt: false,
      fields: [field("cheque-payable", "Payable to", ACEA_FINANCE.accountName)],
    },
    {
      id: "card",
      code: "CARD",
      title: "Card",
      enabled: true,
      showOnInvoice: false,
      showOnReceipt: false,
      fields: [field("card-note", "Instructions", "Visa / Mastercard at the finance desk.")],
    },
  ];
}

export const DEFAULT_PAYMENT_SETUP: PaymentSetup = {
  pin: ACEA_FINANCE.pin,
  website: ACEA_FINANCE.website,
  payableNote: `All payments should be made payable to ${ACEA_FINANCE.accountName}.`,
  extraNote: "",
  invoice: { showPin: true, showDueDate: true, showCredits: true },
  receipt: { showPin: true, showWebsite: true, showAmountInWords: true, showSignatures: true },
  methods: defaultPaymentMethods(),
  extraParameters: [],
  prorationMode: "DAILY",
};

export const DEFAULT_INVOICE_SETUP = DEFAULT_PAYMENT_SETUP;

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function flag(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function prorationMode(value: unknown, fallback: ProrationMode): ProrationMode {
  return typeof value === "string" && value.trim().toUpperCase() === "MONTHLY" ? "MONTHLY" : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mergeFields(raw: unknown, fallback: PaymentField[]): PaymentField[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((item) => ({ ...item }));
  return raw
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) return null;
      return {
        id: text(row.id, `field-${index}`),
        label: typeof row.label === "string" ? row.label : "",
        value: typeof row.value === "string" ? row.value : "",
      };
    })
    .filter((item): item is PaymentField => item !== null);
}

function mergeMethods(raw: unknown): PaymentMethodBlock[] {
  const defaults = defaultPaymentMethods();
  if (!Array.isArray(raw)) return defaults;
  return raw
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) return null;
      const id = text(row.id, `method-${index}`);
      const fallback = defaults.find((method) => method.id === id || method.code === text(row.code, ""));
      return {
        id,
        code: text(row.code, fallback?.code ?? "CUSTOM"),
        title: text(row.title, fallback?.title ?? "Payment method"),
        enabled: flag(row.enabled, fallback?.enabled ?? true),
        showOnInvoice: flag(row.showOnInvoice, fallback?.showOnInvoice ?? false),
        showOnReceipt: flag(row.showOnReceipt, fallback?.showOnReceipt ?? false),
        fields: mergeFields(row.fields, fallback?.fields ?? [field(newSetupId(), "Detail", "")]),
      };
    })
    .filter((item): item is PaymentMethodBlock => item !== null);
}

function mergeExtraParameters(raw: unknown): ExtraParameter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) return null;
      return {
        id: text(row.id, `param-${index}`),
        label: typeof row.label === "string" ? row.label : "",
        value: typeof row.value === "string" ? row.value : "",
        showOnInvoice: flag(row.showOnInvoice, true),
        showOnReceipt: flag(row.showOnReceipt, false),
      };
    })
    .filter((item): item is ExtraParameter => item !== null);
}

function fromLegacy(src: Record<string, unknown>): Partial<PaymentSetup> {
  const methods = defaultPaymentMethods();
  const bank = methods.find((method) => method.id === "bank");
  const mpesa = methods.find((method) => method.id === "mpesa");
  if (bank) {
    const set = (id: string, value: unknown) => {
      const row = bank.fields.find((fieldRow) => fieldRow.id === id);
      if (row && typeof value === "string" && value.trim()) row.value = value.trim();
    };
    set("bank-name", src.bankName);
    set("bank-branch", src.bankBranch);
    set("bank-account-name", src.accountName);
    set("bank-kes", src.kesAccount);
    set("bank-usd", src.usdAccount);
    set("bank-code", src.bankCode);
    set("bank-branch-code", src.branchCode);
    set("bank-swift", src.swift);
    bank.showOnInvoice = flag(src.showBankDetails, true);
  }
  if (mpesa) {
    const set = (id: string, value: unknown) => {
      const row = mpesa.fields.find((fieldRow) => fieldRow.id === id);
      if (row && typeof value === "string" && value.trim()) row.value = value.trim();
    };
    set("mpesa-paybill", src.mpesaPaybill);
    set("mpesa-account", src.mpesaAccountHint);
    mpesa.showOnInvoice = flag(src.showMpesaDetails, true);
  }
  return {
    pin: text(src.pin, DEFAULT_PAYMENT_SETUP.pin),
    website: text(src.website, DEFAULT_PAYMENT_SETUP.website),
    payableNote: text(src.payableNote, DEFAULT_PAYMENT_SETUP.payableNote),
    extraNote: typeof src.extraNote === "string" ? src.extraNote : "",
    invoice: {
      showPin: flag(src.showPin, true),
      showDueDate: flag(src.showDueDate, true),
      showCredits: flag(src.showCredits, true),
    },
    methods,
  };
}

export function mergePaymentSetup(partial?: Partial<PaymentSetup> | Record<string, unknown> | null): PaymentSetup {
  const src = asRecord(partial) ?? {};
  const legacy = !Array.isArray(src.methods) && ("bankName" in src || "showBankDetails" in src);
  const lifted = legacy ? fromLegacy(src) : src;
  const invoice = asRecord(lifted.invoice) ?? {};
  const receipt = asRecord(lifted.receipt) ?? {};
  return {
    pin: text(lifted.pin, DEFAULT_PAYMENT_SETUP.pin),
    website: text(lifted.website, DEFAULT_PAYMENT_SETUP.website),
    payableNote: text(lifted.payableNote, DEFAULT_PAYMENT_SETUP.payableNote),
    extraNote: typeof lifted.extraNote === "string" ? lifted.extraNote.trim() : "",
    invoice: {
      showPin: flag(invoice.showPin, DEFAULT_PAYMENT_SETUP.invoice.showPin),
      showDueDate: flag(invoice.showDueDate, DEFAULT_PAYMENT_SETUP.invoice.showDueDate),
      showCredits: flag(invoice.showCredits, DEFAULT_PAYMENT_SETUP.invoice.showCredits),
    },
    receipt: {
      showPin: flag(receipt.showPin, DEFAULT_PAYMENT_SETUP.receipt.showPin),
      showWebsite: flag(receipt.showWebsite, DEFAULT_PAYMENT_SETUP.receipt.showWebsite),
      showAmountInWords: flag(receipt.showAmountInWords, DEFAULT_PAYMENT_SETUP.receipt.showAmountInWords),
      showSignatures: flag(receipt.showSignatures, DEFAULT_PAYMENT_SETUP.receipt.showSignatures),
    },
    methods: mergeMethods(lifted.methods),
    extraParameters: mergeExtraParameters(lifted.extraParameters),
    prorationMode: prorationMode(lifted.prorationMode, DEFAULT_PAYMENT_SETUP.prorationMode),
  };
}

export const mergeInvoiceSetup = mergePaymentSetup;

export function methodsForDocument(setup: PaymentSetup, kind: "invoice" | "receipt") {
  return setup.methods.filter(
    (method) => method.enabled && (kind === "invoice" ? method.showOnInvoice : method.showOnReceipt),
  );
}

export function extraParametersForDocument(setup: PaymentSetup, kind: "invoice" | "receipt") {
  return setup.extraParameters.filter(
    (item) =>
      (item.label.trim() || item.value.trim()) && (kind === "invoice" ? item.showOnInvoice : item.showOnReceipt),
  );
}

export function emptyMethod(): PaymentMethodBlock {
  return {
    id: newSetupId(),
    code: "CUSTOM",
    title: "New payment method",
    enabled: true,
    showOnInvoice: true,
    showOnReceipt: false,
    fields: [field(newSetupId(), "Detail", "")],
  };
}

export function emptyField(): PaymentField {
  return { id: newSetupId(), label: "Label", value: "" };
}

export function emptyParameter(): ExtraParameter {
  return { id: newSetupId(), label: "New parameter", value: "", showOnInvoice: true, showOnReceipt: false };
}