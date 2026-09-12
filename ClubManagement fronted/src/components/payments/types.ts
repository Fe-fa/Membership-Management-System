import type { LucideIcon } from "lucide-react";
import { Banknote, CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";

export type LookupOption = { id?: number; code: string; name: string };

/** Shared payment UI — same modal for members and applicants. */
export type PaymentAudience = "member" | "applicant";

export type FeePurpose =
  | "joining"
  | "annual"
  | "accommodation"
  | "corkage"
  | "other";

/** Dues snapshot from GET /api/applications/{id}/dues */
export type ApplicationDues = {
  membershipTypeId?: number | null;
  membershipTypeName?: string | null;
  joiningFeeTypeId: number;
  annualFeeTypeId: number;
  joiningFee: number;
  annualSubscription: number;
  joiningPaid: number;
  annualPaid: number;
  joiningBalance: number;
  annualBalance: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
  halfYearAnnual: boolean;
};

export type MemberSubscription = {
  standing: string;
  detail: string;
  paysSubscription: boolean;
  year: number;
  amountDue: number;
  amountPaid: number;
  outstanding: number;
  dueDate: string;
  postingDeadline: string;
  removalDeadline: string;
  discountPercent: number;
  joiningFeeDue: number;
  joiningPaid: number;
  joiningOutstanding: number;
  entranceFeeWaived: boolean;
  balance: number;
  membershipNo?: string | null;
  membershipTypeCode?: string | null;
  membershipTypeName?: string | null;
  fullAnnualRate?: number;
  isLifeExempt?: boolean;
  isSeniorMember?: boolean;
  halfYearProrated?: boolean;
  canVote?: boolean;
  votingBlockedByArrears?: boolean;
  clubCreditBalance?: number;
  continuousMembershipYears?: number;
  ageYears?: number | null;
  statusCode?: string;
};

export type PaymentHistoryRow = {
  transactionId: number;
  receiptNumber?: string | null;
  method?: string | null;
  status?: string | null;
  amount: number;
  paymentDate?: string | null;
  mpesaCode?: string | null;
  chequeNo?: string | null;
  chequeBankName?: string | null;
  chequeBankCode?: string | null;
  chequeDate?: string | null;
  chequeFileName?: string | null;
  chequeFileUrl?: string | null;
  feeType?: string | null;
  referenceNote?: string | null;
};

export type MemberPayPayload = {
  paymentMethodId: number;
  feeTypeCode: string;
  amount: number;
  paymentDate: string;
  mpesaCode?: string | undefined;
  mpesaPhone?: string | undefined;
  chequeNo?: string | undefined;
  chequeBankName?: string | undefined;
  chequeBankCode?: string | undefined;
  chequeDate?: string | undefined;
  chequeFileName?: string | undefined;
  chequeFileUrl?: string | undefined;
  referenceNote?: string | undefined;
  paymentStatusCode?: string | undefined;
  lineDescription?: string | undefined;
};

export type MpesaStkResult = {
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
  status: string;
  phone: string;
  amount: number;
};

export const FEE_PURPOSE_LABEL: Record<FeePurpose, string> = {
  joining: "Joining / entrance fee",
  annual: "Annual subscription",
  accommodation: "Accommodation / room",
  corkage: "Corkage / outside food",
  other: "Custom club charge",
};

export const FEE_PURPOSE_CODE: Record<FeePurpose, string> = {
  joining: "JOINING",
  annual: "ANNUAL",
  accommodation: "ACCOMMODATION",
  corkage: "CORKAGE",
  other: "OTHER",
};

export const METHOD_ICONS: Record<string, LucideIcon> = {
  CASH: Wallet,
  MPESA: Smartphone,
  CHEQUE: Landmark,
  BANK_TRANSFER: Landmark,
  CARD: CreditCard,
  CREDIT: CreditCard,
  CREDIT_CARD: CreditCard,
  CLUB_CARD: Banknote,
  ACCOUNT_BALANCE: Banknote,
  CLUB_CREDIT: Banknote,
};

export const CHEQUE_BANKS = [
  "KCB Bank Kenya",
  "Absa Bank Kenya",
  "Equity Bank Kenya",
  "Co-operative Bank of Kenya",
  "NCBA Bank Kenya",
  "Stanbic Bank Kenya",
  "I&M Bank Kenya",
  "Diamond Trust Bank Kenya",
  "Family Bank Kenya",
];

export const PREFERRED_METHODS = [
  "MPESA",
  "CARD",
  "CHEQUE",
  "CLUB_CARD",
  "BANK_TRANSFER",
  "CASH",
];

export function normalizeMethodCode(code?: string | null) {
  return (code ?? "").trim().toUpperCase().replace(/[-\s]/g, "_");
}

export function isPaidStatus(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  return s === "paid" || s === "waived";
}

export function sortPaymentMethods(rows: LookupOption[]) {
  return [...rows].sort((a, b) => {
    const ai = PREFERRED_METHODS.indexOf(normalizeMethodCode(a.code));
    const bi = PREFERRED_METHODS.indexOf(normalizeMethodCode(b.code));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function standingLabel(code?: string | null) {
  return (code ?? "InGoodStanding").replace(/([A-Z])/g, " $1").trim();
}

/** Map application fee schedule dues into the shared payment form model. */
export function applicationDuesToSubscription(dues: ApplicationDues): MemberSubscription {
  const year = new Date().getFullYear();
  return {
    standing: dues.balance <= 0 ? "InGoodStanding" : "PendingPayment",
    detail: dues.halfYearAnnual
      ? "Application fees — annual subscription pro-rated to 31 Dec"
      : "Application joining and first-year subscription fees",
    paysSubscription: true,
    year,
    amountDue: Number(dues.annualSubscription || 0),
    amountPaid: Number(dues.annualPaid || 0),
    outstanding: Number(dues.annualBalance || 0),
    dueDate: "",
    postingDeadline: "",
    removalDeadline: "",
    discountPercent: 0,
    joiningFeeDue: Number(dues.joiningFee || 0),
    joiningPaid: Number(dues.joiningPaid || 0),
    joiningOutstanding: Number(dues.joiningBalance || 0),
    entranceFeeWaived: Number(dues.joiningFee || 0) <= 0,
    balance: Number(dues.balance || 0),
    membershipTypeName: dues.membershipTypeName ?? null,
    halfYearProrated: Boolean(dues.halfYearAnnual),
    clubCreditBalance: 0,
  };
}

export const APPLICANT_FEE_PURPOSES: FeePurpose[] = ["joining", "annual"];
export const MEMBER_FEE_PURPOSES: FeePurpose[] = [
  "joining",
  "annual",
  "accommodation",
  "corkage",
  "other",
];
