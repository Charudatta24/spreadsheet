"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import type { LocationType, MeasurementRow } from "@/types";
import { MeasurementCell } from "./MeasurementCell";
import { calculateRowResult, calculatePersonTotal } from "@/lib/measurementExport";
import { Plus, Trash2, Calculator } from "lucide-react";

interface MeasurementGridProps {
  locationType: LocationType;
  rows: MeasurementRow[];
  onChangeRows: (rows: MeasurementRow[]) => void;
}

export function MeasurementGrid({
  locationType,
  rows,
  onChangeRows,
}: MeasurementGridProps) {
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colKey: string } | null>(
    { rowIdx: 0, colKey: "A" }
  );
  const [pendingEdit, setPendingEdit] = useState<{ rowIdx: number; colKey: string } | null>(null);

  const isLocal = locationType === "local";
  const columns = isLocal
    ? [
        { key: "A", label: "A - Length", isCalc: false },
        { key: "B", label: "B - Height", isCalc: false },
        { key: "C", label: "C - Calculated", isCalc: true },
      ]
    : [
        { key: "A", label: "A - Length", isCalc: false },
        { key: "B", label: "B - Length (CM)", isCalc: false },
        { key: "C", label: "C - Height", isCalc: false },
        { key: "D", label: "D - Height (CM)", isCalc: false },
        { key: "E", label: "E - Calculated", isCalc: true },
      ];

  // Ensure there are at least 5 rows initialized
  useEffect(() => {
    if (rows.length === 0) {
      const initial: MeasurementRow[] = Array.from({ length: 5 }, (_, i) => ({
        rowNumber: i + 1,
        A: null,
        B: null,
        C: null,
        D: null,
        E: null,
      }));
      onChangeRows(initial);
    }
  }, [rows.length, onChangeRows]);

  const addRow = useCallback(() => {
    const newRowNumber = rows.length + 1;
    const newRow: MeasurementRow = {
      rowNumber: newRowNumber,
      A: null,
      B: null,
      C: null,
      D: null,
      E: null,
    };
    onChangeRows([...rows, newRow]);
  }, [rows, onChangeRows]);

  const deleteRow = useCallback(
    (index: number) => {
      if (rows.length <= 1) return;
      const updated = rows
        .filter((_, i) => i !== index)
        .map((r, i) => ({ ...r, rowNumber: i + 1 }));
      onChangeRows(updated);
    },
    [rows, onChangeRows]
  );

  const updateCellData = useCallback(
    (rowIdx: number, colKey: string, val: number | null) => {
      const updated = rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const copy = { ...r };
        if (colKey === "A") copy.A = val;
        if (colKey === "B") copy.B = val;
        if (colKey === "C") copy.C = val;
        if (colKey === "D") copy.D = val;
        return copy;
      });
      onChangeRows(updated);
    },
    [rows, onChangeRows]
  );

  // Keyboard navigation logic
  const handleCellNav = useCallback(
    (rowIdx: number, colKey: string, e: React.KeyboardEvent) => {
      let targetRow = rowIdx;
      let targetColKey = colKey;

      let shouldAutoEdit = false;
      if (e.key === "Enter") {
        e.preventDefault();
        shouldAutoEdit = true;
        if (isLocal) {
          // A -> B -> Next Row A
          if (colKey === "A") {
            targetColKey = "B";
          } else {
            targetColKey = "A";
            targetRow = rowIdx + 1;
          }
        } else {
          // A -> B -> C -> D -> Next Row A
          if (colKey === "A") targetColKey = "B";
          else if (colKey === "B") targetColKey = "C";
          else if (colKey === "C") targetColKey = "D";
          else {
            targetColKey = "A";
            targetRow = rowIdx + 1;
          }
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        shouldAutoEdit = !e.shiftKey;
        if (e.shiftKey) {
          if (isLocal) {
            if (colKey === "B") targetColKey = "A";
            else if (colKey === "A" && rowIdx > 0) {
              targetRow = rowIdx - 1;
              targetColKey = "B";
            }
          } else {
            if (colKey === "D") targetColKey = "C";
            else if (colKey === "C") targetColKey = "B";
            else if (colKey === "B") targetColKey = "A";
            else if (colKey === "A" && rowIdx > 0) {
              targetRow = rowIdx - 1;
              targetColKey = "D";
            }
          }
        } else {
          if (isLocal) {
            if (colKey === "A") targetColKey = "B";
            else {
              targetColKey = "A";
              targetRow = rowIdx + 1;
            }
          } else {
            if (colKey === "A") targetColKey = "B";
            else if (colKey === "B") targetColKey = "C";
            else if (colKey === "C") targetColKey = "D";
            else {
              targetColKey = "A";
              targetRow = rowIdx + 1;
            }
          }
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        targetRow = rowIdx + 1;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        targetRow = Math.max(0, rowIdx - 1);
      } else if (e.key === "ArrowRight") {
        if (isLocal && colKey === "A") targetColKey = "B";
        else if (!isLocal) {
          if (colKey === "A") targetColKey = "B";
          else if (colKey === "B") targetColKey = "C";
          else if (colKey === "C") targetColKey = "D";
        }
      } else if (e.key === "ArrowLeft") {
        if (isLocal && colKey === "B") targetColKey = "A";
        else if (!isLocal) {
          if (colKey === "D") targetColKey = "C";
          else if (colKey === "C") targetColKey = "B";
          else if (colKey === "B") targetColKey = "A";
        }
      }

      // Auto add row if navigating beyond last row
      if (targetRow >= rows.length) {
        addRow();
      }

      setActiveCell({ rowIdx: targetRow, colKey: targetColKey });
      if (shouldAutoEdit) {
        setPendingEdit({ rowIdx: targetRow, colKey: targetColKey });
      }
    },
    [isLocal, rows.length, addRow]
  );

  const totalVal = calculatePersonTotal(locationType, rows);

  return (
    <div className="w-full flex flex-col bg-sheet-surface rounded-xl border border-sheet-border overflow-hidden shadow-sm">
      {/* Grid Table Container */}
      <div className="overflow-x-auto">
        <table className="min-w-[600px] w-full border-collapse text-xs">
          <thead>
            <tr className="bg-sheet-header text-sheet-text border-b-2 border-sheet-border">
              <th className="w-12 px-2 py-2 text-center font-bold text-slate-500 border-r border-sheet-border">
                No.
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2 text-right font-bold border-r border-sheet-border ${
                    c.isCalc ? "text-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-10 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const rowResult = calculateRowResult(locationType, row.A, row.B, row.C);

              return (
                <tr
                  key={rIdx}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group"
                >
                  <td className="px-2 py-1 text-center font-mono font-semibold text-slate-400 border-r border-b border-sheet-border bg-slate-50/50 dark:bg-slate-900/30 select-none">
                    {rIdx + 1}
                  </td>
                  {columns.map((col) => {
                    const isActive =
                      activeCell?.rowIdx === rIdx && activeCell?.colKey === col.key;

                    if (col.isCalc) {
                      return (
                        <td key={col.key} className="p-0">
                          <MeasurementCell
                            value={rowResult}
                            isCalculated={true}
                            calculatedValue={rowResult}
                            isActive={isActive}
                            onActivate={() =>
                              setActiveCell({ rowIdx: rIdx, colKey: col.key })
                            }
                            onChange={() => {}}
                            onKeyDownNav={(e) => handleCellNav(rIdx, col.key, e)}
                          />
                        </td>
                      );
                    }

                    const cellVal =
                      col.key === "A"
                        ? row.A
                        : col.key === "B"
                        ? row.B
                        : col.key === "C"
                        ? row.C
                        : col.key === "D"
                        ? row.D
                        : null;

                    return (
                      <td key={col.key} className="p-0">
                        <MeasurementCell
                          value={cellVal}
                          isActive={isActive}
                          onActivate={() =>
                            setActiveCell({ rowIdx: rIdx, colKey: col.key })
                          }
                          onChange={(val) => updateCellData(rIdx, col.key, val)}
                          onKeyDownNav={(e) => handleCellNav(rIdx, col.key, e)}
                        />
                      </td>
                    );
                  })}
                  <td className="px-1 py-1 text-center border-b border-sheet-border">
                    <button
                      onClick={() => deleteRow(rIdx)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                      title="Delete Row"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-900 text-sheet-text border-t border-sheet-border">
              <td className="px-2 py-2 text-center font-mono font-semibold text-slate-500 border-r border-sheet-border"></td>
              <td
                colSpan={columns.length - 1}
                className="px-3 py-2 text-right font-semibold text-slate-500 border-r border-sheet-border"
              >
                TOTAL =
              </td>
              <td className="px-3 py-2 text-right font-bold text-emerald-700 border-r border-sheet-border">
                {totalVal.toFixed(2)}
              </td>
              <td className="px-1 py-2 text-center border-sheet-border"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Grid Footer Controls */}
      <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-sheet-border flex flex-col sm:flex-row items-center justify-start gap-2">
        <button
          onClick={addRow}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-all active:scale-95"
        >
          <Plus size={14} />
          Add Row
        </button>
      </div>
    </div>
  );
}
