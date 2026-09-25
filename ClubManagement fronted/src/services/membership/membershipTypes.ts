import { apiRequest, API_BASE } from "./api";
import { MEMBERSHIP_TYPES } from "./schema";

export type MembershipTypeOption = {
  code: string;
  name: string;
  membershipTypeId?: number;
};

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
  if (key === "county" || nameKey === "county") {
    return { code: "Country", name: "Country", membershipTypeId: row.membershipTypeId };
  }
  if (key === "oversea" || nameKey === "oversea") {
    return { code: "Overseas", name: "Overseas", membershipTypeId: row.membershipTypeId };
  }
  const match = MEMBERSHIP_TYPES.find(
    (code) => code.toLowerCase() === key || code.toLowerCase() === nameKey,
  );
  if (!match) return null;
  return { code: match, name: match, membershipTypeId: row.membershipTypeId };
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
      const membershipTypeId = Number(
        value["membershipTypeId"] ?? value["MembershipTypeId"] ?? value["id"] ?? value["Id"] ?? 0,
      );
      return code
        ? {
            code,
            name: name || code,
            membershipTypeId: Number.isFinite(membershipTypeId) && membershipTypeId > 0
              ? membershipTypeId
              : undefined,
          }
        : null;
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
