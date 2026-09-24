import { formatMembershipDate, type MemberRow } from "@/services/admin/membershipDesk";
import {
  downloadExcelCsv,
  printHtmlReport,
  rowsToTableHtml,
  type FinanceExportColumn,
} from "@/utils/financeExport";

export const MEMBER_EXPORT_COLS: FinanceExportColumn<MemberRow>[] = [
  { header: "MembershipNo", value: (row) => row.membershipNo },
  { header: "Member", value: (row) => row.fullName },
  { header: "Class", value: (row) => row.membershipType },
  { header: "Status", value: (row) => row.status },
  { header: "Joined", value: (row) => formatMembershipDate(row.joinedDate) },
  { header: "Arrears", value: (row) => row.outstandingArrears },
];

export type MemberImportRow = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  membershipNo: string;
  membershipClass: string;
  joinedDate: string;
};

const IMPORT_EXAMPLE: MemberImportRow = {
  firstName: "Jane",
  lastName: "Mwangi",
  email: "jane.mwangi@example.com",
  mobile: "0712345678",
  membershipNo: "AC-9001",
  membershipClass: "Full",
  joinedDate: "2010-03-15",
};

const IMPORT_TEMPLATE_COLS: FinanceExportColumn<MemberImportRow>[] = [
  { header: "FirstName", value: (row) => row.firstName },
  { header: "LastName", value: (row) => row.lastName },
  { header: "Email", value: (row) => row.email },
  { header: "Mobile", value: (row) => row.mobile },
  { header: "MembershipNo", value: (row) => row.membershipNo },
  { header: "MembershipClass", value: (row) => row.membershipClass },
  { header: "JoinedDate", value: (row) => row.joinedDate },
];

export function downloadMembersExcel(filename: string, rows: MemberRow[]) {
  downloadExcelCsv(filename, MEMBER_EXPORT_COLS, rows);
}

export function downloadMemberImportTemplate() {
  downloadExcelCsv("member-register-template.csv", IMPORT_TEMPLATE_COLS, [IMPORT_EXAMPLE]);
}

export function printMembers(title: string, rows: MemberRow[]) {
  return printHtmlReport(title, rowsToTableHtml(MEMBER_EXPORT_COLS, rows), "Member register");
}

export async function readMemberImportFile(file: File): Promise<MemberImportRow[]> {
  const name = file.name.toLowerCase();
  const table = name.endsWith(".xlsx") || name.endsWith(".xls")
    ? await readSpreadsheet(file)
    : parseCsvRows(await file.text());
  return tableToMembers(table);
}

function tableToMembers(table: string[][]): MemberImportRow[] {
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
        membershipNo: rec.membershipno || rec.membershipnumber || rec.memberno || "",
        membershipClass: rec.membershipclass || rec.class || rec.membershiptype || "",
        joinedDate: excelDate(rec.joineddate || rec.joined || rec.datejoined || ""),
      };
    })
    .filter((row) => row.firstName && row.lastName && row.membershipNo);
}

function excelDate(value: string) {
  const serial = Number(value);
  if (value && Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value;
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
    if (char === '"') quoted = true;
    else if (char === "," || char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

async function readSpreadsheet(file: File): Promise<string[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder().decode(bytes.slice(0, 200));
  if (text.includes("<Workbook") || text.includes("<html")) return htmlTable(new TextDecoder().decode(bytes));
  const files = await unzip(bytes);
  const sheetName = [...files.keys()].find((name) => /xl\/worksheets\/sheet1\.xml$/i.test(name));
  if (!sheetName) throw new Error("The workbook has no sheet to read.");
  const sharedName = [...files.keys()].find((name) => /xl\/sharedStrings\.xml$/i.test(name));
  const shared = sharedName ? sharedStrings(files.get(sharedName)!) : [];
  return sheetRows(files.get(sheetName)!, shared);
}

function htmlTable(xml: string): string[][] {
  const doc = new DOMParser().parseFromString(xml, "text/html");
  return [...doc.querySelectorAll("tr")].map((tr) =>
    [...tr.querySelectorAll("th,td")].map((cell) => cell.textContent?.trim() ?? ""),
  );
}

function sharedStrings(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagName("si")].map((item) =>
    [...item.getElementsByTagName("t")].map((node) => node.textContent ?? "").join(""),
  );
}

function sheetRows(xml: string, shared: string[]) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rows: string[][] = [];
  for (const row of doc.getElementsByTagName("row")) {
    const cells: string[] = [];
    for (const cell of row.getElementsByTagName("c")) {
      const ref = cell.getAttribute("r") ?? "";
      const col = ref.replace(/[0-9]/g, "");
      const index = columnIndex(col);
      while (cells.length < index) cells.push("");
      const type = cell.getAttribute("t");
      const raw = cell.getElementsByTagName("v")[0]?.textContent
        ?? cell.getElementsByTagName("t")[0]?.textContent
        ?? "";
      cells[index] = type === "s" ? shared[Number(raw)] ?? "" : raw;
    }
    rows.push(cells);
  }
  return rows;
}

function columnIndex(letters: string) {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.toUpperCase().charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

async function unzip(data: Uint8Array) {
  const out = new Map<string, string>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset + 30 <= data.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(data.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = data.subarray(dataStart, dataStart + compressedSize);
    if (compressedSize > 0 && (name.endsWith(".xml") || name.endsWith(".rels"))) {
      const raw = method === 0 ? compressed : await inflateRaw(compressed);
      out.set(name.replaceAll("\\", "/"), decoder.decode(raw));
    }
    offset = dataStart + compressedSize;
    if (compressedSize === 0) break;
  }
  return out;
}

async function inflateRaw(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
