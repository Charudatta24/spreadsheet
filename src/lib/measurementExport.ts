import * as XLSX from "xlsx";
import type { MeasurementSheet, PersonMeasurement } from "@/types";

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
          calcVal > 0 ? parseFloat(calcVal.toFixed(2)) : "-",
        ]);
      });
      const pTotal = calculateCuttingPersonTotal(person.rows);
      sheetData.push(["", "", "", "Total SQF:", parseFloat(pTotal.toFixed(2))]);
    } else if (sheet.locationType === "local") {
      sheetData.push(["S.No.", "Length", "Height", "SQF", "Remark"]);
      nonEmptyRows.forEach((r, i) => {
        const calcVal = calculateRowResult("local", r.A, r.B, r.C);
        sheetData.push([
          r.serialNumber ?? (i + 1),
          r.A ?? "-",
          r.B ?? "-",
          calcVal > 0 ? parseFloat(calcVal.toFixed(2)) : "-",
          r.remark || "-",
        ]);
      });
      const pTotal = calculatePersonTotal("local", person.rows);
      sheetData.push(["", "", "Total SQF:", parseFloat(pTotal.toFixed(2)), ""]);
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
            calcVal > 0 ? parseFloat(calcVal.toFixed(2)) : "-",
            calcCmVal > 0 ? parseFloat(calcCmVal.toFixed(2)) : "-",
            r.remark || "-",
          ]);
        });
        const pTotal = calculatePersonTotal("national", person.rows);
        const pCmTotal = calculatePersonCmTotal(person.rows);
        sheetData.push(["", "", "", "", "Total SQF:", parseFloat(pTotal.toFixed(2)), parseFloat(pCmTotal.toFixed(2)), ""]);
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
            calcVal > 0 ? parseFloat(calcVal.toFixed(2)) : "-",
            r.remark || "-",
          ]);
        });
        const pTotal = calculatePersonTotal("national", person.rows);
        sheetData.push(["", "", "", "", "Total SQF:", parseFloat(pTotal.toFixed(2)), ""]);
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
 * Export MeasurementSheet to PDF file with 30-row pagination, subtotals, and grand total.
 */
export function exportMeasurementToPDF(sheet: MeasurementSheet) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  let isFirstPage = true;
  let overallGrandTotalSqf = 0;

  sheet.people.forEach((person, personIdx) => {
    // Filter non-empty rows for this person
    const nonEmptyRows = person.rows.filter((r) => {
      if (sheet.sheetCategory === "cutting") {
        return (r.A != null && r.A !== 0) || (r.B != null && r.B !== 0) || (r.C != null && r.C !== 0);
      } else if (sheet.locationType === "local") {
        return (r.A != null && r.A !== 0) || (r.B != null && r.B !== 0) || (r.remark && r.remark.trim() !== "");
      } else {
        return (r.A != null && r.A !== 0) || (r.B != null && r.B !== 0) || (r.C != null && r.C !== 0) || (r.D != null && r.D !== 0) || (r.remark && r.remark.trim() !== "");
      }
    });

    const isCutting = sheet.sheetCategory === "cutting";
    const isLocal = sheet.locationType === "local";

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

      // Header Banner
      doc.setFillColor(16, 185, 129); // Emerald-600
      doc.rect(0, 0, 595, 55, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${sheet.title}`, 20, 32);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Date: ${sheet.date}  |  Person: ${person.name || "Main"}  |  Page ${chunkIdx + 1} of ${chunks.length}`, 320, 32);

      // Table columns & rows
      let head: string[][] = [];
      let body: (string | number)[][] = [];

      if (isCutting) {
        head = [["S.No.", "Length", "Height", "No. of Slabs", "SQF"]];
        chunk.forEach((r, i) => {
          const calcVal = calculateCuttingRowResult(r.A, r.B, r.C);
          body.push([
            r.serialNumber ?? (chunkIdx * chunkSize + i + 1),
            r.A ?? "-",
            r.B ?? "-",
            r.C ?? "-",
            calcVal > 0 ? calcVal.toFixed(2) : "-",
          ]);
        });
      } else if (isLocal) {
        head = [["S.No.", "Length", "Height", "SQF", "Remark"]];
        chunk.forEach((r, i) => {
          const calcVal = calculateRowResult("local", r.A, r.B, r.C);
          body.push([
            r.serialNumber ?? (chunkIdx * chunkSize + i + 1),
            r.A ?? "-",
            r.B ?? "-",
            calcVal > 0 ? calcVal.toFixed(2) : "-",
            r.remark || "-",
          ]);
        });
      } else {
        head = [["S.No.", "Length", "Length CM", "Height", "Height CM", "SQF", "Remark"]];
        chunk.forEach((r, i) => {
          const calcVal = calculateRowResult("national", r.A, r.B, r.C);
          body.push([
            r.serialNumber ?? (chunkIdx * chunkSize + i + 1),
            r.A ?? "-",
            r.B ?? "-",
            r.C ?? "-",
            r.D ?? "-",
            calcVal > 0 ? calcVal.toFixed(2) : "-",
            r.remark || "-",
          ]);
        });
      }

      // Compute Chunk Subtotal
      let chunkSubtotalSqf = 0;
      chunk.forEach((r) => {
        if (isCutting) {
          chunkSubtotalSqf += calculateCuttingRowResult(r.A, r.B, r.C);
        } else {
          chunkSubtotalSqf += calculateRowResult(sheet.locationType, r.A, r.B, r.C);
        }
      });
      overallGrandTotalSqf += chunkSubtotalSqf;

      // Add subtotal row at bottom of 30-row chunk
      if (isCutting) {
        body.push(["", "", "", "Page Subtotal:", `${chunkSubtotalSqf.toFixed(2)} SQF`]);
      } else if (isLocal) {
        body.push(["", "", "Page Subtotal:", `${chunkSubtotalSqf.toFixed(2)} SQF`, ""]);
      } else {
        body.push(["", "", "", "", "Page Subtotal:", `${chunkSubtotalSqf.toFixed(2)} SQF`, ""]);
      }

      autoTable(doc, {
        startY: 70,
        head: head,
        body: body,
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
        bodyStyles: { halign: "center", fontSize: 9 },
        styles: { cellPadding: 5, overflow: "linebreak" },
      });
    });
  });

  // Final Overall Grand Total Section at the end
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 25 : 500;
  if (finalY > 750) {
    doc.addPage();
  }
  const grandY = finalY > 750 ? 50 : finalY;

  doc.setFillColor(15, 23, 42); // Slate-900
  doc.roundedRect(40, grandY, 515, 40, 8, 8, "F");

  doc.setTextColor(52, 211, 153); // Emerald-400
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`GRAND OVERALL TOTAL: ${overallGrandTotalSqf.toFixed(2)} SQF`, 297, grandY + 25, { align: "center" });

  const fileName = `Measurement_${sheet.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  doc.save(fileName);
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
