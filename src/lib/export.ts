import type { GridData, ColWidths, SheetDocument } from "@/types";
import { addressToCellId } from "@/lib/formula";

export function exportToCSV(
  cells: GridData,
  numRows: number,
  numCols: number
): string {
  const rows: string[] = [];
  for (let r = 0; r < numRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < numCols; c++) {
      const id = addressToCellId(c, r);
      const val = cells[id]?.computed ?? "";
      // Escape CSV
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        row.push(`"${val.replace(/"/g, '""')}"`);
      } else {
        row.push(val);
      }
    }
    // Trim trailing empty cells
    while (row.length > 0 && row[row.length - 1] === "") row.pop();
    rows.push(row.join(","));
  }
  // Trim trailing empty rows
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  return rows.join("\n");
}

export function downloadCSV(doc: SheetDocument, numRows: number, numCols: number): void {
  const csv = exportToCSV(doc.cells, numRows, numCols);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.title}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build a simple HTML table for copy-paste into Excel */
export function exportToHTML(
  cells: GridData,
  numRows: number,
  numCols: number
): string {
  let html = "<table>";
  for (let r = 0; r < numRows; r++) {
    html += "<tr>";
    for (let c = 0; c < numCols; c++) {
      const id = addressToCellId(c, r);
      const cell = cells[id];
      const val = cell?.computed ?? "";
      const style: string[] = [];
      if (cell?.format?.bold) style.push("font-weight:bold");
      if (cell?.format?.italic) style.push("font-style:italic");
      if (cell?.format?.color) style.push(`color:${cell.format.color}`);
      if (cell?.format?.bgColor)
        style.push(`background-color:${cell.format.bgColor}`);
      html += `<td style="${style.join(";")}">${escapeHtml(val)}</td>`;
    }
    html += "</tr>";
  }
  html += "</table>";
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
