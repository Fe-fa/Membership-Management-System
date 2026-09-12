/** CSV / print helpers for the admin Finance desk. */

export type FinanceExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function escapeCsv(value: string | number | null | undefined) {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

/** Downloads a UTF-8 CSV that Excel opens cleanly. */
export function downloadExcelCsv<T>(
  filename: string,
  columns: FinanceExportColumn<T>[],
  rows: T[],
) {
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCsv(c.value(row))).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF" + header + "\r\n" + body], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Prints via a hidden iframe so browsers do not treat it as a pop-up
 * (works after async fetches and without requiring pop-up permission).
 */
export function printHtmlReport(title: string, tableHtml: string) {
  const safeTitle = title.replace(/</g, "&lt;");
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: "Segoe UI", Tahoma, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p class="meta">Printed ${new Date().toLocaleString()} · Aero Club Finance Desk</p>
  ${tableHtml}
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Print report");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    return false;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 500);
  };

  const triggerPrint = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      cleanup();
    }
  };

  // Give the iframe a tick to layout before opening the print dialog.
  if (frameDoc.readyState === "complete") {
    setTimeout(triggerPrint, 50);
  } else {
    iframe.onload = () => setTimeout(triggerPrint, 50);
  }
  return true;
}

export function rowsToTableHtml<T>(
  columns: FinanceExportColumn<T>[],
  rows: T[],
) {
  const head = `<tr>${columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("")}</tr>`;
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td>${escapeHtml(c.value(row) ?? "—")}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
