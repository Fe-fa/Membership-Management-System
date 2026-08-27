import { z } from "zod";
import { kenyaTodayISO, kenyaYear } from "@/utils/kenyaDate";

export const MEMBERSHIP_TYPES = ["Full", "Country", "Overseas"] as const;
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];

export const FEES: Record<
  MembershipType,
  { joining: number; joiningUnder30: number; annual: number }
> = {
  Full: { joining: 250000, joiningUnder30: 125000, annual: 39500 },
  Country: { joining: 250000, joiningUnder30: 125000, annual: 31200 },
  Overseas: { joining: 250000, joiningUnder30: 125000, annual: 20300 },
};

const req = (label: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be under ${max} characters`);
const opt = (max = 120) => z.string().trim().max(max).optional().or(z.literal(""));
const email = (label: string) =>
  z.string().trim().min(1, `${label} is required`).email("Enter a valid email").max(255);
const phone = (label: string) =>
  z
    .string()
    .trim()
    .min(7, `${label} is required`)
    .max(24)
    .regex(/^[+0-9][0-9\s()-]*$/, "Digits, spaces, + ( ) and - only");


export const fileRefSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  size: z.number(),
  contentType: z.string(),
  url: z.string().optional(),
});
export type FileRef = z.infer<typeof fileRefSchema>;

export const personalSchema = z.object({
  firstName: req("First name"),
  middleName: opt(),
  lastName: req("Last name"),
  postalAddress: req("Postal address", 200),
  city: req("City"),
  stateCountry: opt(),
  postalCode: opt(24),
  country: req("Country"),
  email: email("Email"),
  altEmail: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
  telPrefix: z
    .string()
    .trim()
    .min(2, "Intl prefix is required")
    .max(6)
    .regex(/^\+[0-9]{1,4}$/, "Use format +254"),
  mobile: phone("Mobile number"),
  telOther: opt(24),
  idPassportNo: req("ID / Passport number", 40),
  nationality: req("Nationality"),
  dateOfBirth: req("Date of birth", 10),
  placeOfBirth: req("Place of birth"),
  countryOfResidence: req("Country of residence"),
  occupation: req("Occupation"),
  company: opt(),
  role: opt(),
  // Lookup values are stored as the lookup `code` (e.g. "A+", "Female"). The
  // SQL Server FK on MProfile.gender_id / blood_group_id is the real
  // enforcement; these are non-empty strings sourced from /api/lookups.
  bloodGroup: req("Blood group"),
  gender: req("Gender"),
  photo: fileRefSchema.nullable().refine((v) => v !== null, "A passport-size photo is required"),
  cv: fileRefSchema.nullable().refine((v) => v !== null, "Please attach your CV"),
  idPassport: fileRefSchema.nullable().refine((v) => v !== null, "Please attach an ID / Passport copy"),
});

export const spouseSchema = z.object({
  name: opt(),
  phone: opt(24),
  email: z.string().trim().max(255).optional().or(z.literal("")),
});

export const familySchema = z
  .object({
    isMarried: z.boolean(),
    spouses: z
      .array(spouseSchema)
      .max(8, "Up to 8 spouses")
      .default([]),
    hasChildren: z.boolean(),
    children: z
      .array(z.object({ name: opt(), dateOfBirth: opt(10) }))
      .max(10, "Up to 10 children")
      .default([]),
    emergencyName: req("Emergency contact name"),
    emergencyPhone: phone("Emergency contact phone"),
    emergencyEmail: email("Emergency contact email"),
  })
  .superRefine((v, ctx) => {
    if (v.isMarried) {
      if (v.spouses.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["spouses"],
          message: "Add at least one spouse",
        });
      }
      v.spouses.forEach((spouse, i) => {
        if (!spouse.name)
          ctx.addIssue({
            code: "custom",
            path: ["spouses", i, "name"],
            message: "Spouse name is required",
          });
        if (!spouse.phone)
          ctx.addIssue({
            code: "custom",
            path: ["spouses", i, "phone"],
            message: "Spouse phone is required",
          });
        if (spouse.email && !z.string().email().safeParse(spouse.email).success)
          ctx.addIssue({
            code: "custom",
            path: ["spouses", i, "email"],
            message: "Enter a valid email",
          });
      });
    }
    if (v.hasChildren) {
      if (v.children.length === 0)
        ctx.addIssue({ code: "custom", path: ["children"], message: "Add at least one child" });
      v.children.forEach((c, i) => {
        if (!c.name)
          ctx.addIssue({
            code: "custom",
            path: ["children", i, "name"],
            message: "Name is required",
          });
        if (!c.dateOfBirth)
          ctx.addIssue({
            code: "custom",
            path: ["children", i, "dateOfBirth"],
            message: "Date of birth is required",
          });
      });
    }
  });

export const aviationSchema = z
  .object({
    isAffiliated: z.boolean(),
    aviationRole: opt(160),
    holdsLicense: z.boolean(),
    licenseType: opt(80),
    licenseNumber: opt(60),
    licenseIssuer: opt(120),
    licenseFile: fileRefSchema.nullable().default(null),
    ownsAircraft: z.boolean(),
    aircraftType: opt(80),
    aircraftRegistration: opt(40),
    hangarLocation: opt(120),
  })
  .superRefine((v, ctx) => {
    if (v.isAffiliated && !v.aviationRole)
      ctx.addIssue({
        code: "custom",
        path: ["aviationRole"],
        message: "Specify your aviation role",
      });
    if (v.holdsLicense) {
      if (!v.licenseType)
        ctx.addIssue({
          code: "custom",
          path: ["licenseType"],
          message: "License type is required",
        });
      if (!v.licenseNumber)
        ctx.addIssue({
          code: "custom",
          path: ["licenseNumber"],
          message: "License number is required",
        });
      if (!v.licenseIssuer)
        ctx.addIssue({ code: "custom", path: ["licenseIssuer"], message: "Issuer is required" });
      if (!v.licenseFile)
        ctx.addIssue({
          code: "custom",
          path: ["licenseFile"],
          message: "Attach a copy of your license",
        });
    }
    if (v.ownsAircraft) {
      if (!v.aircraftType)
        ctx.addIssue({
          code: "custom",
          path: ["aircraftType"],
          message: "Aircraft type is required",
        });
      if (!v.aircraftRegistration)
        ctx.addIssue({
          code: "custom",
          path: ["aircraftRegistration"],
          message: "Registration is required",
        });
      if (!v.hangarLocation)
        ctx.addIssue({
          code: "custom",
          path: ["hangarLocation"],
          message: "Hangar location is required",
        });
    }
  });

export const membershipSchema = z.object({
  membershipType: req("Membership type", 80),
  applicantSignature: req("Signature", 160),
  signatureDate: req("Date", 10),
});

const supporterSchema = z.object({
  memberProfileId: req("Select a club member", 40),
  membershipNo: opt(40),
  name: req("Name"),
  phone: phone("Phone number"),
  email: email("Email"),
  yearOfJoining: z.coerce
    .number({ message: "Enter the year of joining" })
    .int()
    .min(1927)
    .max(kenyaYear())
});
export type Supporter = z.infer<typeof supporterSchema>;

export const supportersSchema = z
  .object({
    proposer: supporterSchema,
    seconder: supporterSchema,
  })
  .superRefine((v, ctx) => {
    if (v.proposer.memberProfileId && v.proposer.memberProfileId === v.seconder.memberProfileId) {
      ctx.addIssue({
        code: "custom",
        path: ["seconder", "memberProfileId"],
        message: "The seconder must be a different club member from the proposer",
      });
    }
  });

export const clubsSchema = z
  .object({
    memberOfOtherClub: z.boolean(),
    otherClubs: z
      .array(z.object({ name: opt(160) }))
      .max(3, "Up to three clubs")
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.memberOfOtherClub) {
      const named = v.otherClubs.filter((c) => c.name);
      if (named.length === 0)
        ctx.addIssue({ code: "custom", path: ["otherClubs"], message: "List at least one club" });
    }
  });

export const consentSchema = z.object({
  privacyPolicyAccepted: z.literal(true, { message: "You must accept the Members Privacy Policy" }),
  declarationAccepted: z.literal(true, { message: "You must confirm the declaration" }),
  declarationName: req("Name", 160),
  declarationSignature: req("Signature", 160),
  declarationDate: req("Date", 10),
});

export const applicationSchema = z.object({
  personal: personalSchema,
  family: familySchema,
  aviation: aviationSchema,
  membership: membershipSchema,
  supporters: supportersSchema,
  clubs: clubsSchema,
  consent: consentSchema,
});

export type ApplicationDraft = {
  personal: z.input<typeof personalSchema>;
  family: z.input<typeof familySchema>;
  aviation: z.input<typeof aviationSchema>;
  membership: Partial<z.input<typeof membershipSchema>>;
  supporters: {
    proposer: Partial<z.input<typeof supporterSchema>>;
    seconder: Partial<z.input<typeof supporterSchema>>;
  };
  clubs: z.input<typeof clubsSchema>;
  consent: Partial<z.input<typeof consentSchema>>;
};

export type StepKey = keyof ApplicationDraft | "review";

export const MIN_SUPPORTER_YEARS = 3;

export function supporterTenureYears(yearOfJoining?: number | string): number | null {
  const year = Number(yearOfJoining);
  if (!Number.isFinite(year) || year < 1900) return null;
  return kenyaYear() - year;
}

export function ageOn(dateOfBirth?: string): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00+03:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const [year, month, day] = kenyaTodayISO().split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const today = new Date(Date.UTC(year, month - 1, day));
  const dobUtc = new Date(Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()));
  let age = today.getUTCFullYear() - dobUtc.getUTCFullYear();
  const m = today.getUTCMonth() - dobUtc.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dobUtc.getUTCDate())) age -= 1;
  return age;
}

type LegacyFamily = ApplicationDraft["family"] & {
  spouseName?: string;
  spousePhone?: string;
  spouseEmail?: string;
};

export function normalizeFamily(family: LegacyFamily): ApplicationDraft["family"] {
  const spouses =
    family.spouses && family.spouses.length > 0
      ? family.spouses
      : family.spouseName || family.spousePhone || family.spouseEmail
        ? [
            {
              name: family.spouseName ?? "",
              phone: family.spousePhone ?? "",
              email: family.spouseEmail ?? "",
            },
          ]
        : [];
  return {
    isMarried: family.isMarried,
    spouses,
    hasChildren: family.hasChildren,
    children: family.children ?? [],
    emergencyName: family.emergencyName,
    emergencyPhone: family.emergencyPhone,
    emergencyEmail: family.emergencyEmail,
  };
}

export function normalizeDraft(draft: ApplicationDraft): ApplicationDraft {
  return { ...draft, family: normalizeFamily(draft.family as LegacyFamily) };
}

export const emptyDraft = (): ApplicationDraft => ({
  personal: {
    firstName: "",
    middleName: "",
    lastName: "",
    postalAddress: "",
    city: "",
    stateCountry: "",
    postalCode: "",
    country: "Kenya",
    email: "",
    altEmail: "",
    telPrefix: "+254",
    mobile: "",
    telOther: "",
    idPassportNo: "",
    nationality: "",
    dateOfBirth: "",
    placeOfBirth: "",
    countryOfResidence: "Kenya",
    occupation: "",
    company: "",
    role: "",
    bloodGroup: undefined as never,
    gender: undefined as never,
    photo: null,
    cv: null,
    idPassport: null,
  },
  family: {
    isMarried: false,
    spouses: [],
    hasChildren: false,
    children: [],
    emergencyName: "",
    emergencyPhone: "",
    emergencyEmail: "",
  },
  aviation: {
    isAffiliated: false,
    aviationRole: "",
    holdsLicense: false,
    licenseType: "",
    licenseNumber: "",
    licenseIssuer: "",
    licenseFile: null,
    ownsAircraft: false,
    aircraftType: "",
    aircraftRegistration: "",
    hangarLocation: "",
  },
  membership: { applicantSignature: "", signatureDate: kenyaTodayISO() },
  supporters: { proposer: {}, seconder: {} },
  clubs: { memberOfOtherClub: false, otherClubs: [] },
  consent: {
    declarationName: "",
    declarationSignature: "",
    declarationDate: kenyaTodayISO(),
  },
});
