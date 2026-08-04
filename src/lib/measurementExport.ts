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
    total += calculatePersonTotal(sheet.locationType, person.rows);
  }
  return total;
}

/**
 * Export MeasurementSheet to a formatted Excel .xlsx file.
 */
export function exportMeasurementToExcel(sheet: MeasurementSheet) {
  const wb = XLSX.utils.book_new();

  sheet.people.forEach((person, idx) => {
    const sheetData: (string | number)[][] = [];

    // Table Headers & Rows — clean column names, S.No., Remark, no metadata
    if (sheet.locationType === "local") {
      sheetData.push(["S.No.", "Length", "Height", "Calculated", "Remark"]);
      person.rows.forEach((r, i) => {
        const calcVal = calculateRowResult("local", r.A, r.B, r.C);
        sheetData.push([
          r.serialNumber ?? (i + 1),
          r.A ?? "",
          r.B ?? "",
          calcVal > 0 ? calcVal : "",
          r.remark ?? "",
        ]);
      });
      const pTotal = calculatePersonTotal("local", person.rows);
      sheetData.push(["", "", "Total:", pTotal, ""]);
    } else {
      const isCustomerNational = sheet.personType === "customer";
      if (isCustomerNational) {
        sheetData.push([
          "S.No.",
          "Length",
          "Length (CM)",
          "Height",
          "Height (CM)",
          "Calculated",
          "Calculated (CM)",
          "Remark",
        ]);
        person.rows.forEach((r, i) => {
          const calcVal = calculateRowResult("national", r.A, r.B, r.C);
          const calcCmVal = calculateNationalCmResult(r.B, r.D);
          sheetData.push([
            r.serialNumber ?? (i + 1),
            r.A ?? "",
            r.B ?? "",
            r.C ?? "",
            r.D ?? "",
            calcVal > 0 ? calcVal : "",
            calcCmVal > 0 ? calcCmVal : "",
            r.remark ?? "",
          ]);
        });
        const pTotal = calculatePersonTotal("national", person.rows);
        const pCmTotal = calculatePersonCmTotal(person.rows);
        sheetData.push(["", "", "", "", "Total:", pTotal, pCmTotal, ""]);
      } else {
        sheetData.push(["S.No.", "Length", "Length (CM)", "Height", "Height (CM)", "Calculated", "Remark"]);
        person.rows.forEach((r, i) => {
          const calcVal = calculateRowResult("national", r.A, r.B, r.C);
          sheetData.push([
            r.serialNumber ?? (i + 1),
            r.A ?? "",
            r.B ?? "",
            r.C ?? "",
            r.D ?? "",
            calcVal > 0 ? calcVal : "",
            r.remark ?? "",
          ]);
        });
        const pTotal = calculatePersonTotal("national", person.rows);
        sheetData.push(["", "", "", "", "Total:", pTotal, ""]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Set column widths
    const colWidths =
      sheet.locationType === "local"
        ? [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 24 }]
        : sheet.personType === "customer"
        ? [
            { wch: 8 },
            { wch: 12 },
            { wch: 14 },
            { wch: 12 },
            { wch: 14 },
            { wch: 16 },
            { wch: 18 },
            { wch: 24 },
          ]
        : [{ wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 24 }];
    ws["!cols"] = colWidths;

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

  if (sheet.locationType === "local") {
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
