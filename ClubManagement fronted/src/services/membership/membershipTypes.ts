import { apiRequest, API_BASE } from "./api";
import { MEMBERSHIP_TYPES } from "./schema";

export type MembershipTypeOption = { code: string; name: string };

/** Applicant election types only (paper form: Full / Country / Overseas). */
const APPLICANT_TYPE_CODES = new Set(
  MEMBERSHIP_TYPES.map((code) => code.toLowerCase()),
);

const fallbackTypes: MembershipTypeOption[] = MEMBERSHIP_TYPES.map((code) => ({
  code,
  name: code,
}));

function normalizeApplicantType(row: MembershipTypeOption): MembershipTypeOption | null {
  const key = row.code.trim().toLowerCase();
  const nameKey = row.name.trim().toLowerCase();
  // Accept "Country" / "County" typos from data as Country.
  if (key === "county" || nameKey === "county") {
    return { code: "Country", name: "Country" };
  }
  if (key === "oversea" || nameKey === "oversea") {
    return { code: "Overseas", name: "Overseas" };
  }
  const match = MEMBERSHIP_TYPES.find(
    (code) => code.toLowerCase() === key || code.toLowerCase() === nameKey,
  );
  if (!match) return null;
  return { code: match, name: match };
}

/** Reads the membership-type catalogue maintained by the C# / EF backend. */
export async function fetchMembershipTypes(options?: {
  /** When true (default), only Full / Country / Overseas for applicant election. */
  applicantOnly?: boolean;
}): Promise<MembershipTypeOption[]> {
  const applicantOnly = options?.applicantOnly !== false;
  if (!API_BASE) return fallbackTypes;

  const rows = await apiRequest<unknown[]>("/api/membership-types");
  const mapped = rows
    .map((row) => {
      if (typeof row === "string") return { code: row, name: row };
      if (!row || typeof row !== "object") return null;
      const value = row as Record<string, unknown>;
      const code = String(
        value["code"] ?? value["Code"] ?? value["id"] ?? value["Id"] ?? "",
      ).trim();
      const name = String(
        value["name"] ?? value["Name"] ?? value["description"] ?? value["Description"] ?? code,
      ).trim();
      return code ? { code, name: name || code } : null;
    })
    .filter((row): row is MembershipTypeOption => row !== null);

  if (!applicantOnly) return mapped;

  const byCode = new Map<string, MembershipTypeOption>();
  for (const row of mapped) {
    const normalized = normalizeApplicantType(row);
    if (!normalized) continue;
    if (!APPLICANT_TYPE_CODES.has(normalized.code.toLowerCase())) continue;
    if (!byCode.has(normalized.code)) byCode.set(normalized.code, normalized);
  }
  const filtered = MEMBERSHIP_TYPES.map((code) => byCode.get(code)).filter(
    (row): row is MembershipTypeOption => Boolean(row),
  );
  return filtered.length > 0 ? filtered : fallbackTypes;
}
