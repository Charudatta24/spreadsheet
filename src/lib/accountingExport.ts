import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AccountingTransaction } from "@/types";

/**
 * Rounds a number to 2 decimal places with epsilon guard to avoid floating-point errors.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a number in Indian currency style (e.g. ₹8,500 or ₹8,500.50).
 */
export function formatINR(amount: number): string {
  const rounded = round2(amount);
  const parts = rounded.toFixed(2).split(".");
  const intPart = parts[0];
  const decPart = parts[1];

  // Indian numbering regex
  const lastThree = intPart.substring(intPart.length - 3);
  const otherNumbers = intPart.substring(0, intPart.length - 3);
  const formattedInt = otherNumbers !== ""
    ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
    : lastThree;

  return decPart === "00" ? `₹${formattedInt}` : `₹${formattedInt}.${decPart}`;
}

export interface AccountingSummary {
  totalSent: number;
  totalReceived: number;
  net: number;
  totalCount: number;
  todaySent: number;
  todayReceived: number;
  thisMonthSent: number;
  thisMonthReceived: number;
}

/**
 * Performs exact financial calculations from actual database records.
 * NEVER uses AI for mathematics.
 */
export function calculateAccountingTotals(transactions: AccountingTransaction[]): AccountingSummary {
  let totalSent = 0;
  let totalReceived = 0;
  let todaySent = 0;
  let todayReceived = 0;
  let thisMonthSent = 0;
  let thisMonthReceived = 0;

  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

  for (const tx of transactions) {
    const amt = round2(Number(tx.amount) || 0);
    const txDate = tx.transactionDate || "";

    if (tx.type === "sent") {
      totalSent = round2(totalSent + amt);
      if (txDate === todayStr) {
        todaySent = round2(todaySent + amt);
      }
      if (txDate.startsWith(currentMonthStr)) {
        thisMonthSent = round2(thisMonthSent + amt);
      }
    } else if (tx.type === "received") {
      totalReceived = round2(totalReceived + amt);
      if (txDate === todayStr) {
        todayReceived = round2(todayReceived + amt);
      }
      if (txDate.startsWith(currentMonthStr)) {
        thisMonthReceived = round2(thisMonthReceived + amt);
      }
    }
  }

  const net = round2(totalSent - totalReceived);

  return {
    totalSent,
    totalReceived,
    net,
    totalCount: transactions.length,
    todaySent,
    todayReceived,
    thisMonthSent,
    thisMonthReceived,
  };
}

export interface ExportPDFOptions {
  person?: string;
  transactions: AccountingTransaction[];
  periodLabel?: string;
  factoryName?: string;
  userPhone?: string;
}

/**
 * Generates and downloads a clean, professional PDF accounting report.
 */
export function exportAccountingReportPDF({
  person,
  transactions,
  periodLabel,
  factoryName,
  userPhone,
}: ExportPDFOptions): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const titleHeader = (factoryName || "PERSONAL ACCOUNTING").toUpperCase();
  const subText = userPhone ? `Budawada, Chimakurthy, ${userPhone}` : "Budawada, Chimakurthy";
  const todayFormatted = (() => {
    const d = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
  })();

  // ── Top Header Box (Exact MeasureSheets style) ───────────────────────────
  doc.setDrawColor(203, 213, 225); // Slate-300
  doc.setLineWidth(1);
  doc.rect(30, 20, 535, 45);

  // Factory / Title
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(titleHeader, 42, 40);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(subText, 42, 53);

  // Right Header Badge
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(420, 26, 135, 32, 4, 4, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ACCOUNTING REPORT", 487, 38, { align: "center" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(todayFormatted, 487, 49, { align: "center" });

  // ── Summary Meta Bar ─────────────────────────────────────────────────────
  let y = 78;
  const summary = calculateAccountingTotals(transactions);

  doc.setFillColor(248, 250, 252); // Slate-50
  doc.rect(30, y, 535, 44, "F");
  doc.rect(30, y, 535, 44, "S");

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");

  const personLabel = person ? `Person: ${person}` : "Filter: All Persons";
  const period = periodLabel ? `Period: ${periodLabel}` : `Total Transactions: ${transactions.length}`;

  doc.text(personLabel, 42, y + 17);
  doc.text(period, 42, y + 33);

  doc.text(`Total Sent: ${formatINR(summary.totalSent)}`, 230, y + 17);
  doc.text(`Total Received: ${formatINR(summary.totalReceived)}`, 230, y + 33);

  doc.setTextColor(26, 115, 232); // Brand Blue
  doc.text(`Net: ${formatINR(summary.net)}`, 430, y + 17);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Records: ${summary.totalCount}`, 430, y + 33);

  y += 54;

  // ── Transactions Table ───────────────────────────────────────────────────
  const tableRows = transactions.map((t, idx) => {
    const amtFormatted = formatINR(t.amount);
    const typeLabel = t.type === "sent" ? "Sent" : "Received";
    return [
      String(idx + 1),
      t.transactionDate || "—",
      t.person,
      typeLabel,
      t.description || "—",
      amtFormatted,
    ];
  });

  // Grand total row
  tableRows.push([
    "",
    "TOTAL",
    "",
    `Sent: ${formatINR(summary.totalSent)} | Recv: ${formatINR(summary.totalReceived)}`,
    `Net: ${formatINR(summary.net)}`,
    formatINR(summary.totalSent + summary.totalReceived),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: 30, right: 30 },
    head: [["#", "Date", "Person", "Type", "Description", "Amount"]],
    body: tableRows,
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
    },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 25, halign: "center" },
      1: { cellWidth: 70 },
      2: { cellWidth: 100, fontStyle: "bold" },
      3: { cellWidth: 60 },
      4: { cellWidth: 160 },
      5: { cellWidth: 120, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      // Highlight Grand Total row
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
      } else if (data.column.index === 3) {
        if (data.cell.raw === "Sent") {
          data.cell.styles.textColor = [220, 38, 38]; // Red
        } else {
          data.cell.styles.textColor = [22, 163, 74]; // Green
        }
      }
    },
  });

  // Footer note: 5-month automatic data deletion policy
  const finalY = (doc as any).lastAutoTable?.finalY || y + 100;
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text(
    "* Personal accounting records are private and retained under a strict 5-month automatic deletion policy.",
    30,
    Math.min(finalY + 20, 810)
  );

  const safePersonName = (person || "Accounting").replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`${safePersonName}_Report_${todayFormatted}.pdf`);
}

/**
 * Exports transactions to a downloadable CSV spreadsheet.
 */
export function exportAccountingReportCSV(transactions: AccountingTransaction[], personName?: string): void {
  const headers = ["ID", "Date", "Person", "Type", "Amount", "Currency", "Description", "Original Text", "Created At"];

  const escapeCSV = (str: any) => {
    if (str == null) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = transactions.map((t) => [
    escapeCSV(t.id),
    escapeCSV(t.transactionDate),
    escapeCSV(t.person),
    escapeCSV(t.type),
    escapeCSV(round2(t.amount)),
    escapeCSV(t.currency || "INR"),
    escapeCSV(t.description || ""),
    escapeCSV(t.originalText),
    escapeCSV(new Date(t.createdAt).toISOString()),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (personName || "Accounting").replace(/[^a-zA-Z0-9_-]/g, "_");
  a.download = `${safeName}_Transactions_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}