import {
  applicantDisplayName,
  applicationReference,
  applicationStage,
  formatMembershipDate,
  type ApplicationRow,
} from "@/services/admin/membershipDesk";
import {
  downloadExcelCsv,
  printHtmlReport,
  rowsToTableHtml,
  selectExportColumns,
  type FinanceExportColumn,
} from "@/utils/financeExport";

export const APPLICATION_EXPORT_COLS: FinanceExportColumn<ApplicationRow>[] = [
  { id: "applicationNo", header: "Application no", value: (row) => applicationReference(row) },
  { id: "applicant", header: "Applicant", value: (row) => applicantDisplayName(row) },
  { id: "membershipType", header: "Class", value: (row) => row.membershipTypeName ?? "" },
  { id: "status", header: "Status", value: (row) => applicationStage(row) },
  { id: "appliedAt", header: "Applied at", value: (row) => formatMembershipDate(row.appliedAt) },
  { id: "updatedAt", header: "Updated at", value: (row) => formatMembershipDate(row.updatedAt) },
];

export type ApplicationImportRow = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  membershipClass: string;
};

const IMPORT_EXAMPLE: ApplicationImportRow = {
  firstName: "Jane",
  lastName: "Mwangi",
  email: "jane.mwangi@example.com",
  mobile: "0712345678",
  membershipClass: "Full Membership",
};

const IMPORT_TEMPLATE_COLS: FinanceExportColumn<ApplicationImportRow>[] = [
  { header: "FirstName", value: (row) => row.firstName },
  { header: "LastName", value: (row) => row.lastName },
  { header: "Email", value: (row) => row.email },
  { header: "Mobile", value: (row) => row.mobile },
  { header: "MembershipClass", value: (row) => row.membershipClass },
];

export function downloadApplicationsExcel(filename: string, rows: ApplicationRow[], columns?: string[] | null) {
  downloadExcelCsv(filename, selectExportColumns(APPLICATION_EXPORT_COLS, columns), rows);
}

export function printApplications(title: string, rows: ApplicationRow[], columns?: string[] | null) {
  return printHtmlReport(
    title,
    rowsToTableHtml(selectExportColumns(APPLICATION_EXPORT_COLS, columns), rows),
    "Applicant Management",
  );
}

export function downloadApplicationImportTemplate() {
  downloadExcelCsv("applicant-import-template.csv", IMPORT_TEMPLATE_COLS, [IMPORT_EXAMPLE]);
}

export function parseApplicationImportFile(text: string): ApplicationImportRow[] {
  const table = parseCsvRows(text);
  if (table.length < 2) return [];
  const headers = table[0].map(normalizeHeader);
  return table
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) => {
      const rec: Record<string, string> = {};
      headers.forEach((header, index) => {
        rec[header] = (cells[index] ?? "").trim();
      });
      return {
        firstName: rec.firstname || rec.fname || "",
        lastName: rec.lastname || rec.lname || rec.surname || "",
        email: rec.email || rec.emailaddress || "",
        mobile: rec.mobile || rec.phone || rec.phonenumber || "",
        membershipClass: rec.membershipclass || rec.class || rec.membershiptype || "",
      };
    })
    .filter((row) => row.firstName && row.lastName);
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === "," || char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
