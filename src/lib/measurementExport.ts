import * as XLSX from "xlsx";
import type { MeasurementSheet, PersonMeasurement } from "@/types";
import { useAuthStore } from "@/lib/sync/authStore";

/**
 * Calculates row C or E value cleanly.
 * Local: C = (A * B) / 144
 * National: E = (A * C) / 144
 */
export function calculateRowResult(
  locationType: "local" | "national",
  A: number | null,
  B: number | null,
  C: number | null
): number {
  if (locationType === "local") {
    if (A == null || B == null || isNaN(A) || isNaN(B) || A === 0 || B === 0) return 0;
    return (A * B) / 144;
  } else {
    // National: Length is A, Height is C
    if (A == null || C == null || isNaN(A) || isNaN(C) || A === 0 || C === 0) return 0;
    return (A * C) / 144;
  }
}

/**
 * Cutting sheets only: ((Length * Height) / 144) * Number of Slabs
 * A = Length, B = Height, C = Number of Slabs
 */
export function calculateCuttingRowResult(
  A: number | null,
  B: number | null,
  numSlabs: number | null
): number {
  if (
    A == null ||
    B == null ||
    numSlabs == null ||
    isNaN(A) ||
    isNaN(B) ||
    isNaN(numSlabs) ||
    A === 0 ||
    B === 0 ||
    numSlabs === 0
  ) {
    return 0;
  }
  return ((A * B) / 144) * numSlabs;
}

/**
 * Sum of cutting calculated values for a person's rows.
 */
export function calculateCuttingPersonTotal(
  rows: MeasurementSheet["people"][0]["rows"]
): number {
  let sum = 0;
  for (const r of rows) {
    sum += calculateCuttingRowResult(r.A, r.B, r.C);
  }
  return sum;
}

/**
 * Customer National only: Calculated (CM) = (Length CM * Height CM) / 929
 */
export function calculateNationalCmResult(
  lengthCm: number | null | undefined,
  heightCm: number | null | undefined
): number {
  if (
    lengthCm == null ||
    heightCm == null ||
    isNaN(lengthCm) ||
    isNaN(heightCm) ||
    lengthCm === 0 ||
    heightCm === 0
  ) {
    return 0;
  }
  return (lengthCm * heightCm) / 929;
}

/**
 * Sum of Calculated (CM) for customer national rows.
 */
export function calculatePersonCmTotal(
  rows: MeasurementSheet["people"][0]["rows"]
): number {
  let sum = 0;
  for (const r of rows) {
    sum += calculateNationalCmResult(r.B, r.D);
  }
  return sum;
}

/**
 * Calculates sum total for a person's rows.
 */
export function calculatePersonTotal(
  locationType: "local" | "national",
  rows: MeasurementSheet["people"][0]["rows"]
): number {
  let sum = 0;
  for (const r of rows) {
    const val = calculateRowResult(locationType, r.A, r.B, r.C);
    sum += val;
  }
  return sum;
}

/**
 * Calculates overall total across all people.
 */
export function calculateSheetTotal(sheet: MeasurementSheet): number {
  let total = 0;
  for (const person of sheet.people) {
    if (sheet.sheetCategory === "cutting") {
      total += calculateCuttingPersonTotal(person.rows);
    } else {
      total += calculatePersonTotal(sheet.locationType, person.rows);
    }
  }
  return total;
}

/**
 * Truncate (NOT round) a number to exactly 2 decimal places, then format.
 * e.g. 43.45556 → "43.45"  (not "43.46")
 */
export function fmt2(n: number): string {
  const truncated = Math.trunc(n * 100) / 100;
  return truncated.toFixed(2);
}

/**
 * Standard 2-decimal rounding with EPSILON protection against float binary imprecision
 * e.g. 69.44 * 120 = 8332.799999999999 -> round2 produces 8332.8
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function fmt2Val(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "0.00";
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Export MeasurementSheet to a formatted Excel .xlsx file.
 */
export function exportMeasurementToExcel(sheet: MeasurementSheet) {
  const wb = XLSX.utils.book_new();

  sheet.people.forEach((person, idx) => {
    const sheetData: (string | number)[][] = [];

    // Filter out empty rows (where Length and Height are empty/null)
    const nonEmptyRows = person.rows.filter((r) => {
      if (sheet.sheetCategory === "cutting") {
        return (r.A != null && r.A !== 0) || (r.B != null && r.B !== 0) || (r.C != null && r.C !== 0);
      } else if (sheet.locationType === "local") {
        return (r.A != null && r.A !== 0) || (r.B != null && r.B !== 0) || (r.remark && r.remark.trim() !== "");
      } else {
        return (r.A != null && r.A !== 0) || (r.B != null && r.B !== 0) || (r.C != null && r.C !== 0) || (r.D != null && r.D !== 0) || (r.remark && r.remark.trim() !== "");
      }
    });

    // Table Headers & Rows — clean column names, S.No., Remark, SQF
    if (sheet.sheetCategory === "cutting") {
      sheetData.push(["S.No.", "Length", "Height", "No. of Slabs", "SQF"]);
      nonEmptyRows.forEach((r, i) => {
        const calcVal = calculateCuttingRowResult(r.A, r.B, r.C);
        sheetData.push([
          r.serialNumber ?? (i + 1),
          r.A ?? "-",
          r.B ?? "-",
          r.C ?? "-",
          calcVal > 0 ? parseFloat(fmt2(calcVal)) : "-",
        ]);
      });
      const pTotal = calculateCuttingPersonTotal(person.rows);
      sheetData.push(["", "", "", "Total SQF:", parseFloat(fmt2(pTotal))]);
    } else if (sheet.locationType === "local") {
      sheetData.push(["S.No.", "Length", "Height", "SQF", "Remark"]);
      nonEmptyRows.forEach((r, i) => {
        const calcVal = calculateRowResult("local", r.A, r.B, r.C);
        sheetData.push([
          r.serialNumber ?? (i + 1),
          r.A ?? "-",
          r.B ?? "-",
          calcVal > 0 ? parseFloat(fmt2(calcVal)) : "-",
          r.remark || "-",
        ]);
      });
      const pTotal = calculatePersonTotal("local", person.rows);
      sheetData.push(["", "", "Total SQF:", parseFloat(fmt2(pTotal)), ""]);
    } else {
      const isCustomerNational = sheet.personType === "customer";
      if (isCustomerNational) {
        sheetData.push([
          "S.No.",
          "Length",
          "Length (CM)",
          "Height",
          "Height (CM)",
          "SQF",
          "Calculated (CM)",
          "Remark",
        ]);
        nonEmptyRows.forEach((r, i) => {
          const calcVal = calculateRowResult("national", r.A, r.B, r.C);
          const calcCmVal = calculateNationalCmResult(r.B, r.D);
          sheetData.push([
            r.serialNumber ?? (i + 1),
            r.A ?? "-",
            r.B ?? "-",
            r.C ?? "-",
            r.D ?? "-",
            calcVal > 0 ? parseFloat(fmt2(calcVal)) : "-",
            calcCmVal > 0 ? parseFloat(fmt2(calcCmVal)) : "-",
            r.remark || "-",
          ]);
        });
        const pTotal = calculatePersonTotal("national", person.rows);
        const pCmTotal = calculatePersonCmTotal(person.rows);
        sheetData.push(["", "", "", "", "Total SQF:", parseFloat(fmt2(pTotal)), parseFloat(fmt2(pCmTotal)), ""]);
      } else {
        sheetData.push(["S.No.", "Length", "Length (CM)", "Height", "Height (CM)", "SQF", "Remark"]);
        nonEmptyRows.forEach((r, i) => {
          const calcVal = calculateRowResult("national", r.A, r.B, r.C);
          sheetData.push([
            r.serialNumber ?? (i + 1),
            r.A ?? "-",
            r.B ?? "-",
            r.C ?? "-",
            r.D ?? "-",
            calcVal > 0 ? parseFloat(fmt2(calcVal)) : "-",
            r.remark || "-",
          ]);
        });
        const pTotal = calculatePersonTotal("national", person.rows);
        sheetData.push(["", "", "", "", "Total SQF:", parseFloat(fmt2(pTotal)), ""]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto-fit column widths and set center alignment
    const colWidths = Array.from({ length: sheetData[0]?.length || 5 }, (_, colIdx) => {
      let maxLen = 8;
      sheetData.forEach((row) => {
        const cellVal = String(row[colIdx] ?? "");
        if (cellVal.length > maxLen) maxLen = cellVal.length;
      });
      return { wch: Math.max(maxLen + 5, 12) };
    });
    ws["!cols"] = colWidths;

    // Apply center alignment to all cells
    Object.keys(ws).forEach((cellKey) => {
      if (cellKey.startsWith("!")) return;
      if (!ws[cellKey].s) ws[cellKey].s = {};
      ws[cellKey].s.alignment = { horizontal: "center", vertical: "center" };
    });

    const sheetTabName = sanitizeSheetName(person.name || `Person ${idx + 1}`);
    XLSX.utils.book_append_sheet(wb, ws, sheetTabName);
  });

  const formattedDate = (sheet.date || "").replace(/[^a-zA-Z0-9]/g, "_");
  const firstPerson = sheet.people[0]?.name?.replace(/[^a-zA-Z0-9]/g, "_") || "Person";
  const fileName =
    sheet.sheetType === "private"
      ? `Measurement_Sheet_${firstPerson}_${formattedDate}.xlsx`
      : `Measurement_Sheet_Multiple_${formattedDate}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

/**
 * Export MeasurementSheet to PDF file with 30-row pagination, subtotals, Factory Name header, and grand total.
 */
export function exportMeasurementToPDF(
  sheet: MeasurementSheet,
  factoryNameOverride?: string,
  phoneNumberOverride?: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // Resolve Factory Name from argument, sheet property, or fallback
  const factoryName = (
    factoryNameOverride ||
    sheet.factoryName ||
    (typeof window !== "undefined" && (window as any).__COLAB_FACTORY_NAME__) ||
    "VALLEY STONE"
  ).toUpperCase();

  // Resolve phone number from argument, sheet property, or auth store
  let phone = phoneNumberOverride || (sheet as any).phoneNumber;
  if (!phone && typeof window !== "undefined") {
    try {
      phone = useAuthStore.getState().user?.phoneNumber;
    } catch (_) {}
  }
  const subText = phone ? `Budawada, Chimakurthy, ${phone}` : "Budawada, Chimakurthy";

  let isFirstPage = true;
  let overallGrandTotalSqf = 0;
  let overallGrandTotalSqfCm = 0;

  const isCutting = sheet.sheetCategory === "cutting";
  const isLocal = sheet.locationType === "local";
  const isCustomer = sheet.personType === "customer";
  const isNational = !isLocal;

  (sheet.people || []).forEach((person, personIdx) => {
    // Filter non-empty rows for this person
    const rows = person.rows || [];
    const nonEmptyRows = rows.filter((r) => {
      if (isCutting) {
        return (r.A != null && r.A !== 0) || (r.B != null && r.B !== 0) || (r.C != null && r.C !== 0);
      } else if (isLocal) {
        return (r.A != null && r.A !== 0) || (r.B != null && r.B !== 0) || (r.remark && r.remark.trim() !== "");
      } else {
        return (
          (r.A != null && r.A !== 0) ||
          (r.B != null && r.B !== 0) ||
          (r.C != null && r.C !== 0) ||
          (r.D != null && r.D !== 0) ||
          (r.remark && r.remark.trim() !== "")
        );
      }
    });

    // Split non-empty rows into chunks of 30 rows
    const chunkSize = 30;
    const chunks: (typeof nonEmptyRows)[] = [];
    if (nonEmptyRows.length === 0) {
      chunks.push([]);
    } else {
      for (let i = 0; i < nonEmptyRows.length; i += chunkSize) {
        chunks.push(nonEmptyRows.slice(i, i + chunkSize));
      }
    }

    chunks.forEach((chunk, chunkIdx) => {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;

      // ── Top Factory Header (Inspired by reference image) ─────────────────────
      // Outer Header Border Box
      doc.setDrawColor(203, 213, 225); // Slate-300
      doc.setLineWidth(1);
      doc.rect(30, 20, 535, 45);

      // Factory Name (Bold Large Text)
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text(factoryName, 42, 42);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text(subText, 42, 54);

      // Right Header Badge Box
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(440, 26, 115, 32, 4, 4, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("MEASUREMENT SHEET", 497, 38, { align: "center" });

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`${sheet.date}`, 497, 49, { align: "center" });

      // ── Metadata Bar ────────────────────────────────────────────────────────
      doc.setFillColor(248, 250, 252); // Slate-50
      doc.rect(30, 72, 535, 22, "F");
      doc.rect(30, 72, 535, 22, "S");

      doc.setTextColor(51, 65, 85);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");

      const personLabel = person.name ? person.name.toUpperCase() : "MAIN";

      doc.text(`TITLE: ${sheet.title}`, 40, 86);
      doc.text(`PERSON: ${personLabel}`, 300, 86);
      doc.text(`PAGE ${chunkIdx + 1}/${chunks.length}`, 510, 86);

      // ── Table Column Definition ─────────────────────────────────────────────
      let head: string[][] = [];
      let body: (string | number)[][] = [];

      let chunkSubtotalSqf = 0;
      let chunkSubtotalSqfCm = 0;

      if (isCutting) {
        if (isNational) {
          head = [["Pos", "L (in)", "L (cm)", "H (in)", "H (cm)", "Slabs", "SQF"]];
          chunk.forEach((r, i) => {
            const slabs = sheet.numSlabs || 1;
            const calcVal = calculateCuttingRowResult(r.A, r.C, slabs);
            chunkSubtotalSqf += calcVal;
            body.push([
              r.serialNumber ?? (chunkIdx * chunkSize + i + 1),
              r.A ?? "-",
              r.B ?? "-",
              r.C ?? "-",
              r.D ?? "-",
              slabs,
              calcVal > 0 ? fmt2(calcVal) : "-",
            ]);
          });
        } else {
          head = [["Pos", "L (in)", "H (in)", "Slabs", "SQF"]];
          chunk.forEach((r, i) => {
            const calcVal = calculateCuttingRowResult(r.A, r.B, r.C);
            chunkSubtotalSqf += calcVal;
            body.push([
              r.serialNumber ?? (chunkIdx * chunkSize + i + 1),
              r.A ?? "-",
              r.B ?? "-",
              r.C ?? "-",
              calcVal > 0 ? fmt2(calcVal) : "-",
            ]);
          });
        }
      } else if (isLocal) {
        head = [["Pos", "L (in)", "H (in)", "SQF", "Remark"]];
        chunk.forEach((r, i) => {
          const calcVal = calculateRowResult("local", r.A, r.B, r.C);
          chunkSubtotalSqf += calcVal;
          body.push([
            r.serialNumber ?? (chunkIdx * chunkSize + i + 1),
            r.A ?? "-",
            r.B ?? "-",
            calcVal > 0 ? fmt2(calcVal) : "-",
            r.remark || "-",
          ]);
        });
      } else {
        // National Sheet (Polish / Customer)
        if (isCustomer) {
          head = [["Pos", "L (in)", "L (cm)", "H (in)", "H (cm)", "SQF", "SQF (cm)", "Remark"]];
          chunk.forEach((r, i) => {
            const calcVal = calculateRowResult("national", r.A, r.B, r.C);
            const calcCmVal = calculateNationalCmResult(r.B, r.D);
            chunkSubtotalSqf += calcVal;
            chunkSubtotalSqfCm += calcCmVal;
            body.push([
              r.serialNumber ?? (chunkIdx * chunkSize + i + 1),
              r.A ?? "-",
              r.B ?? "-",
              r.C ?? "-",
              r.D ?? "-",
              calcVal > 0 ? fmt2(calcVal) : "-",
              calcCmVal > 0 ? fmt2(calcCmVal) : "-",
              r.remark || "-",
            ]);
          });
        } else {
          head = [["Pos", "L (in)", "L (cm)", "H (in)", "H (cm)", "SQF", "Remark"]];
          chunk.forEach((r, i) => {
            const calcVal = calculateRowResult("national", r.A, r.B, r.C);
            chunkSubtotalSqf += calcVal;
            body.push([
              r.serialNumber ?? (chunkIdx * chunkSize + i + 1),
              r.A ?? "-",
              r.B ?? "-",
              r.C ?? "-",
              r.D ?? "-",
              calcVal > 0 ? fmt2(calcVal) : "-",
              r.remark || "-",
            ]);
          });
        }
      }

      overallGrandTotalSqf += chunkSubtotalSqf;
      overallGrandTotalSqfCm += chunkSubtotalSqfCm;

      // Add 30-row Subtotal Row
      if (isCutting) {
        if (isNational) {
          body.push(["", "", "", "", "", "Page Subtotal:", `${fmt2(chunkSubtotalSqf)} SQF`]);
        } else {
          body.push(["", "", "", "Page Subtotal:", `${fmt2(chunkSubtotalSqf)} SQF`]);
        }
      } else if (isLocal) {
        body.push(["", "", "Page Subtotal:", `${fmt2(chunkSubtotalSqf)} SQF`, ""]);
      } else {
        if (isCustomer) {
          body.push([
            "",
            "",
            "",
            "",
            "Page Subtotal:",
            `${fmt2(chunkSubtotalSqf)} SQF`,
            `${fmt2(chunkSubtotalSqfCm)} CM`,
            "",
          ]);
        } else {
          body.push(["", "", "", "", "Page Subtotal:", `${fmt2(chunkSubtotalSqf)} SQF`, ""]);
        }
      }

      autoTable(doc, {
        startY: 102,
        head: head,
        body: body,
        theme: "grid",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
          fontSize: 8.5,
        },
        bodyStyles: {
          halign: "center",
          fontSize: 8.5,
          textColor: [30, 41, 59],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        styles: { cellPadding: 4, overflow: "linebreak" },
      });
    });
  });

  // Final Overall Grand Total Section
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 20 : 500;
  if (finalY > 750) {
    doc.addPage();
  }
  const grandY = finalY > 750 ? 50 : finalY;

  doc.setFillColor(15, 23, 42); // Slate-900
  doc.roundedRect(30, grandY, 535, 36, 6, 6, "F");

  doc.setTextColor(255, 255, 255); // Pure White
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");

  if (overallGrandTotalSqfCm > 0) {
    doc.text(
      `GRAND TOTAL: ${fmt2(overallGrandTotalSqf)} SQF  |  ${fmt2(overallGrandTotalSqfCm)} SQF (CM)`,
      297,
      grandY + 22,
      { align: "center" }
    );
  } else {
    doc.text(`GRAND TOTAL: ${fmt2(overallGrandTotalSqf)} SQF`, 297, grandY + 22, { align: "center" });
  }

  const fileName = `Measurement_${sheet.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  // Force direct browser file download
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (_) {
    doc.save(fileName);
  }
}

/**
 * Export MeasurementSheet to CSV file.
 */
export function exportMeasurementToCSV(sheet: MeasurementSheet, personIndex = 0) {
  const person = sheet.people[personIndex] || sheet.people[0];
  if (!person) return;

  const rows: string[] = [];
  rows.push(`Measurement Sheet`);
  rows.push(`Date:,${sheet.date}`);
  rows.push(`Person Type:,${sheet.personType}`);
  rows.push(`Location Type:,${sheet.locationType}`);
  rows.push(`Person Name:,${person.name}`);
  rows.push(``);

  if (sheet.sheetCategory === "cutting") {
    rows.push(`No.,A - Length,B - Height,C - No. of Slabs,Calculated`);
    person.rows.forEach((r, i) => {
      const calc = calculateCuttingRowResult(r.A, r.B, r.C);
      rows.push(`${i + 1},${r.A ?? ""},${r.B ?? ""},${r.C ?? ""},${calc > 0 ? calc : ""}`);
    });
    rows.push(`,,,,TOTAL: ${calculateCuttingPersonTotal(person.rows)}`);
  } else if (sheet.locationType === "local") {
    rows.push(`No.,A - Length,B - Height,C - Calculated`);
    person.rows.forEach((r, i) => {
      const calc = calculateRowResult("local", r.A, r.B, r.C);
      rows.push(`${i + 1},${r.A ?? ""},${r.B ?? ""},${calc > 0 ? calc : ""}`);
    });
    rows.push(`,,,TOTAL: ${calculatePersonTotal("local", person.rows)}`);
  } else {
    if (sheet.personType === "customer") {
      rows.push(
        `No.,A - Length,B - Length CM,C - Height,D - Height CM,E - Calculated,F - Calculated CM`
      );
      person.rows.forEach((r, i) => {
        const calc = calculateRowResult("national", r.A, r.B, r.C);
        const calcCm = calculateNationalCmResult(r.B, r.D);
        rows.push(
          `${i + 1},${r.A ?? ""},${r.B ?? ""},${r.C ?? ""},${r.D ?? ""},${calc > 0 ? calc : ""},${calcCm > 0 ? calcCm : ""}`
        );
      });
      rows.push(
        `,,,,,TOTAL: ${calculatePersonTotal("national", person.rows)},${calculatePersonCmTotal(person.rows)}`
      );
    } else {
      rows.push(`No.,A - Length,B - Length CM,C - Height,D - Height CM,E - Calculated`);
      person.rows.forEach((r, i) => {
        const calc = calculateRowResult("national", r.A, r.B, r.C);
        rows.push(`${i + 1},${r.A ?? ""},${r.B ?? ""},${r.C ?? ""},${r.D ?? ""},${calc > 0 ? calc : ""}`);
      });
      rows.push(`,,,,,TOTAL: ${calculatePersonTotal("national", person.rows)}`);
    }
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Measurement_${person.name.replace(/[^a-zA-Z0-9]/g, "_")}_${sheet.date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[:\\/?*\[\]]/g, "").slice(0, 31) || "Sheet1";
}

// ─── Calculation Sheet PDF Export ─────────────────────────────────────────────

import type { CalculationSheet } from "@/types";

/**
 * Generates and directly downloads a PDF for a CalculationSheet.
 * Uses the same jsPDF + autoTable setup as exportMeasurementToPDF.
 */
export function exportCalculationToPDF(
  sheet: CalculationSheet,
  phoneNumberOverride?: string
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // Resolve phone number from argument, sheet property, or auth store
  let phone = phoneNumberOverride || (sheet as any).phoneNumber;
  if (!phone && typeof window !== "undefined") {
    try {
      phone = useAuthStore.getState().user?.phoneNumber;
    } catch (_) {}
  }
  const subText = phone ? `Budawada, Chimakurthy, ${phone}` : "Budawada, Chimakurthy";

  // ── Factory Name ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(sheet.factoryName || "Factory", pageW / 2, y, { align: "center" });
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(subText, pageW / 2, y, { align: "center" });
  y += 8;

  // ── Divider ───────────────────────────────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ── Sheet Information ────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(26, 115, 232); // brand blue
  doc.text("Sheet Information", margin, y);
  y += 5;

  const createdDate = (() => {
    try {
      const ms = sheet.createdAt?.toMillis?.() ?? sheet.createdAt ?? Date.now();
      const d = new Date(ms);
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    } catch {
      return "—";
    }
  })();

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5, textColor: [15, 23, 42] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50, textColor: [71, 85, 105] }, 1: { fontStyle: "normal" } },
    body: [
      ["Sheet Name", sheet.sheetName],
      ["Date of Creation", createdDate],
      ["Total SQF", fmt2(sheet.totalSqf)],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Calculation Summary Table ───────────────────────────────────────────
  const underSqf2 = parseFloat(fmt2(sheet.underTotalSqf));
  const underVal = sheet.underValue != null ? round2(sheet.underValue) : null;
  const underTotal = (underVal != null) ? round2(underSqf2 * underVal) : (sheet.underTotalValue != null ? round2(sheet.underTotalValue) : null);

  const belowSqf2 = parseFloat(fmt2(sheet.belowTotalSqf));
  const belowVal = sheet.belowValue != null ? round2(sheet.belowValue) : null;
  const belowTotal = (belowVal != null) ? round2(belowSqf2 * belowVal) : (sheet.belowTotalValue != null ? round2(sheet.belowTotalValue) : null);

  const totalSlabs = sheet.underSlabCount + sheet.belowSlabCount;
  const totalSqfVal = round2(underSqf2 + belowSqf2);
  const grandTotalVal = (underTotal != null || belowTotal != null) ? round2((underTotal ?? 0) + (belowTotal ?? 0)) : null;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    headStyles: { fillColor: [239, 246, 255], textColor: [26, 115, 232], fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3, textColor: [15, 23, 42] },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [15, 23, 42] },
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" },
    },
    head: [["Category", "No. of Slabs", "Total SQF", "Value / SQF", "Total Value"]],
    body: [
      [
        "Undersize",
        String(sheet.underSlabCount),
        fmt2(underSqf2),
        underVal != null ? fmt2Val(underVal) : "—",
        underTotal != null ? fmt2Val(underTotal) : "—",
      ],
      [
        "Below Undersize",
        String(sheet.belowSlabCount),
        fmt2(belowSqf2),
        belowVal != null ? fmt2Val(belowVal) : "—",
        belowTotal != null ? fmt2Val(belowTotal) : "—",
      ],
      [
        "Total",
        String(totalSlabs),
        fmt2(totalSqfVal),
        "—",
        grandTotalVal != null ? fmt2Val(grandTotalVal) : "—",
      ],
    ],
    footStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: "bold" },
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated by MeasureSheets  •  Page ${i} of ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" }
    );
  }

  // Direct download — no preview window
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Calculation_${sheet.sheetName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
