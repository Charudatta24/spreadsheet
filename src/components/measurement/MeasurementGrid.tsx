"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import type {
  LocationType,
  PersonType,
  MeasurementRow,
  WorkerPermissions,
  SheetCategory,
} from "@/types";
import { MeasurementCell } from "./MeasurementCell";
import {
  calculateRowResult,
  calculatePersonTotal,
  calculateNationalCmResult,
  calculatePersonCmTotal,
  calculateCuttingRowResult,
  calculateCuttingPersonTotal,
} from "@/lib/measurementExport";
import { Plus, Trash2, MessageSquare, X, Check, AlertCircle } from "lucide-react";

interface MeasurementGridProps {
  locationType: LocationType;
  personType?: PersonType;
  sheetCategory?: SheetCategory;
  startingSerialNumber?: number;
  rows: MeasurementRow[];
  onChangeRows: (rows: MeasurementRow[]) => void;
  autoFocusFirstCell?: boolean;
  isOwner?: boolean;
  permissions?: WorkerPermissions;
  isReadonlyDay?: boolean;
}

export function MeasurementGrid({
  locationType,
  personType = "worker",
  sheetCategory,
  startingSerialNumber = 1,
  rows,
  onChangeRows,
  autoFocusFirstCell = false,
  isOwner = true,
  permissions,
  isReadonlyDay = false,
}: MeasurementGridProps) {
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colKey: string } | null>(
    { rowIdx: 0, colKey: "A" }
  );
  const [pendingEdit, setPendingEdit] = useState<{ rowIdx: number; colKey: string } | null>(
    autoFocusFirstCell ? { rowIdx: 0, colKey: "A" } : null
  );

  const isCustomerSheet = personType === "customer";
  const isCuttingSheet = sheetCategory === "cutting";

  // Remark Modal state
  const [editingRemarkRowIdx, setEditingRemarkRowIdx] = useState<number | null>(null);
  const [remarkInput, setRemarkInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isLocal = locationType === "local";
  const showNationalCmCalc = !isLocal && isCustomerSheet && !isCuttingSheet;
  // Cutting sheets: Length, Height, No. of Slabs → ((L*H)/144)*slabs
  const columns = isCuttingSheet
    ? [
        { key: "SNO", label: "S.No.", isCalc: false, isSno: true },
        { key: "A", label: "Length", isCalc: false },
        { key: "B", label: "Height", isCalc: false },
        { key: "C", label: "No. of Slabs", isCalc: false },
        { key: "E", label: "SQF", isCalc: true },
      ]
    : isLocal
    ? [
        { key: "SNO", label: "S.No.", isCalc: false, isSno: true },
        { key: "A", label: "Length", isCalc: false },
        { key: "B", label: "Height", isCalc: false },
        { key: "C", label: "SQF", isCalc: true },
        ...(isCustomerSheet ? [{ key: "REMARK", label: "Remark", isCalc: false, isRemark: true }] : []),
      ]
    : [
        { key: "SNO", label: "S.No.", isCalc: false, isSno: true },
        { key: "A", label: "Length", isCalc: false },
        { key: "B", label: "Length (CM)", isCalc: false },
        { key: "C", label: "Height", isCalc: false },
        { key: "D", label: "Height (CM)", isCalc: false },
        { key: "E", label: "SQF", isCalc: true },
        ...(showNationalCmCalc
          ? [{ key: "F", label: "Calculated (CM)", isCalc: true, isCalcCm: true }]
          : []),
        ...(isCustomerSheet ? [{ key: "REMARK", label: "Remark", isCalc: false, isRemark: true }] : []),
      ];
  // Effective permissions
  const canEditSerial = isOwner || Boolean(permissions?.canModifySerialNumbers);
  const canEditMeasurements = isOwner || Boolean(permissions?.canModifyMeasurements);
  const canEditRemarks = isOwner || Boolean(permissions?.canModifyRemarks);
  const canAddRows = isOwner || Boolean(permissions?.canAddRows);
  const canDeleteRows = isOwner || Boolean(permissions?.canDeleteRows);

  // Ensure initial rows have valid serialNumbers starting at startingSerialNumber
  useEffect(() => {
    if (rows.length === 0) {
      const initial: MeasurementRow[] = Array.from({ length: 5 }, (_, i) => ({
        rowNumber: i + 1,
        serialNumber: startingSerialNumber + i,
        A: null,
        B: null,
        C: null,
        D: null,
        E: null,
        remark: "",
      }));
      onChangeRows(initial);
    }
  }, [rows.length, startingSerialNumber, onChangeRows]);

  // Keep a ref to the latest rows so updateCellData/addRow never capture stale data
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const onChangeRowsRef = useRef(onChangeRows);
  onChangeRowsRef.current = onChangeRows;

  // Helper to handle rows update.
  // For Worker sheets: auto-sort ascending by serialNumber.
  // For Customer sheets: DO NOT auto-sort by serialNumber (fixed order as assigned).
  const notifyRowsChange = useCallback((updatedRows: MeasurementRow[]) => {
    let result: MeasurementRow[];
    if (isCustomerSheet) {
      result = updatedRows.map((r, idx) => ({ ...r, rowNumber: idx + 1 }));
    } else {
      const sorted = [...updatedRows].sort((a, b) => a.serialNumber - b.serialNumber);
      result = sorted.map((r, idx) => ({ ...r, rowNumber: idx + 1 }));
    }
    rowsRef.current = result;
    onChangeRowsRef.current(result);
  }, [isCustomerSheet]);

  const addRow = useCallback(() => {
    if (!canAddRows) return;
    const currentRows = rowsRef.current;
    const maxSno = currentRows.reduce((max, r) => Math.max(max, r.serialNumber ?? 0), startingSerialNumber - 1);
    const newSno = Math.max(maxSno + 1, startingSerialNumber);
    const newRow: MeasurementRow = {
      rowNumber: currentRows.length + 1,
      serialNumber: newSno,
      A: null,
      B: null,
      C: null,
      D: null,
      E: null,
      remark: "",
    };
    notifyRowsChange([...currentRows, newRow]);
  }, [startingSerialNumber, canAddRows, notifyRowsChange]);

  const deleteRow = useCallback(
    (index: number) => {
      const currentRows = rowsRef.current;
      if (!canDeleteRows || currentRows.length <= 1) return;
      const updated = currentRows.filter((_, i) => i !== index);
      notifyRowsChange(updated);
    },
    [canDeleteRows, notifyRowsChange]
  );

  const updateCellData = useCallback(
    (rowIdx: number, colKey: string, val: number | null) => {
      const currentRows = rowsRef.current;

      if (colKey === "SNO") {
        if (!canEditSerial) return;
        const newSno = val == null ? startingSerialNumber : Math.floor(val);
        // Duplicate check
        const isDuplicate = currentRows.some((r, i) => i !== rowIdx && r.serialNumber === newSno);
        if (isDuplicate) {
          setErrorMessage(`Serial number ${newSno} already exists!`);
          setTimeout(() => setErrorMessage(""), 3000);
          return;
        }
        const updated = currentRows.map((r, i) => (i === rowIdx ? { ...r, serialNumber: newSno } : r));
        notifyRowsChange(updated);
        return;
      }

      if (!canEditMeasurements) return;
      const updated = currentRows.map((r, i) => {
        if (i !== rowIdx) return r;
        const copy = { ...r };
        if (colKey === "A") copy.A = val;
        if (colKey === "B") copy.B = val;
        if (colKey === "C") copy.C = val;
        if (colKey === "D") copy.D = val;
        return copy;
      });
      rowsRef.current = updated;
      onChangeRowsRef.current(updated);
    },
    [canEditSerial, canEditMeasurements, startingSerialNumber, notifyRowsChange]
  );

  const saveRemark = () => {
    if (editingRemarkRowIdx === null) return;
    const currentRows = rowsRef.current;
    const updated = currentRows.map((r, i) => (i === editingRemarkRowIdx ? { ...r, remark: remarkInput.trim() } : r));
    rowsRef.current = updated;
    onChangeRowsRef.current(updated);
    setEditingRemarkRowIdx(null);
    setRemarkInput("");
  };

  // Keyboard navigation
  const handleCellNav = useCallback(
    (rowIdx: number, colKey: string, e: React.KeyboardEvent) => {
      let targetRow = rowIdx;
      let targetColKey = colKey;
      let shouldAutoEdit = false;
      const isEnterKey = e.key === "Enter" || e.key === "NumpadEnter" || e.key === "Done" || e.key === "Go";

      if (isEnterKey) {
        e.preventDefault();
        shouldAutoEdit = true;
        if (colKey === "SNO") {
          targetColKey = "A";
        } else if (isCuttingSheet) {
          // Cutting: Length → Height → No. of Slabs → next row Length
          if (colKey === "A") {
            targetColKey = "B";
          } else if (colKey === "B") {
            targetColKey = "C";
          } else {
            targetRow = rowIdx + 1;
            targetColKey = "A";
          }
        } else if (isLocal) {
          // Local: Length → Height → next row Length
          if (colKey === "A") {
            targetColKey = "B";
          } else {
            targetRow = rowIdx + 1;
            targetColKey = "A";
          }
        } else {
          // National: Length → Length (CM) → Height → Height (CM) → next row Length
          if (colKey === "A") {
            targetColKey = "B";
          } else if (colKey === "B") {
            targetColKey = "C";
          } else if (colKey === "C") {
            targetColKey = "D";
          } else {
            targetRow = rowIdx + 1;
            targetColKey = "A";
          }
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        shouldAutoEdit = !e.shiftKey;
        if (!e.shiftKey) {
          if (isCuttingSheet) {
            if (colKey === "SNO") targetColKey = "A";
            else if (colKey === "A") targetColKey = "B";
            else if (colKey === "B") targetColKey = "C";
            else {
              targetColKey = "A";
              targetRow = rowIdx + 1;
            }
          } else if (isLocal) {
            if (colKey === "SNO") targetColKey = "A";
            else if (colKey === "A") targetColKey = "B";
            else {
              targetColKey = "A";
              targetRow = rowIdx + 1;
            }
          } else {
            if (colKey === "SNO") targetColKey = "A";
            else if (colKey === "A") targetColKey = "B";
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
      }

      if (targetRow >= rows.length && canAddRows) {
        addRow();
      }

      setActiveCell({ rowIdx: targetRow, colKey: targetColKey });
      if (shouldAutoEdit) {
        setPendingEdit({ rowIdx: targetRow, colKey: targetColKey });
      }
    },
    [isLocal, isCuttingSheet, rows.length, addRow, canAddRows]
  );

  const totalVal = isCuttingSheet
    ? calculateCuttingPersonTotal(rows)
    : calculatePersonTotal(locationType, rows);
  const cmTotalVal = showNationalCmCalc ? calculatePersonCmTotal(rows) : 0;
  const firstCalcIdx = columns.findIndex((c) => c.isCalc);
  const footerLabelColSpan = firstCalcIdx > 0 ? firstCalcIdx : Math.max(1, columns.length - 1);

  return (
    <div className="w-full flex flex-col bg-sheet-surface rounded-xl border border-sheet-border overflow-hidden shadow-sm">
      {errorMessage && (
        <div className="bg-red-50 text-red-600 text-xs px-3 py-2 flex items-center gap-2 border-b border-red-200">
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid Table Container */}
      <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
        <table className="min-w-[340px] w-full border-collapse text-xs">
          <thead>
            <tr className="bg-sheet-header text-sheet-text border-b-2 border-sheet-border">
              <th className="w-8 sm:w-10 px-1 py-2 text-center font-bold text-slate-500 border-r border-sheet-border text-[10px] sm:text-xs">
                #
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-2 sm:px-3 py-2 ${c.isRemark ? "text-left" : "text-right"} font-bold border-r border-sheet-border text-[10px] sm:text-xs ${
                    c.isCalc ? "text-emerald-600 bg-emerald-50/40" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
              {canDeleteRows && <th className="w-8 px-1 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const rowResult = isCuttingSheet
                ? calculateCuttingRowResult(row.A, row.B, row.C)
                : calculateRowResult(locationType, row.A, row.B, row.C);
              const rowCmResult = showNationalCmCalc
                ? calculateNationalCmResult(row.B, row.D)
                : 0;

              return (
                <tr key={rIdx} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-1 py-1 text-center font-mono font-semibold text-slate-400 border-r border-b border-sheet-border bg-slate-50/50 select-none text-[10px] sm:text-xs">
                    {rIdx + 1}
                  </td>
                  {columns.map((col) => {
                    const isActive = activeCell?.rowIdx === rIdx && activeCell?.colKey === col.key;
                    const isAutoEdit = pendingEdit?.rowIdx === rIdx && pendingEdit?.colKey === col.key;

                    if (col.isSno) {
                      return (
                        <td key={col.key} className="p-0">
                          <MeasurementCell
                            value={row.serialNumber}
                            isActive={isActive}
                            disabled={!canEditSerial}
                            requireLongPressToEdit={isCustomerSheet}
                            isSno={true}
                            autoEdit={isAutoEdit}
                            onAutoEditDone={() => setPendingEdit(null)}
                            onActivate={() => setActiveCell({ rowIdx: rIdx, colKey: col.key })}
                            onChange={(val) => updateCellData(rIdx, col.key, val)}
                            onKeyDownNav={(e) => handleCellNav(rIdx, col.key, e)}
                          />
                        </td>
                      );
                    }

                    if (col.isCalc) {
                      const calcValue = (col as { isCalcCm?: boolean }).isCalcCm
                        ? rowCmResult
                        : rowResult;
                      return (
                        <td key={col.key} className="p-0">
                          <MeasurementCell
                            value={calcValue}
                            isCalculated={true}
                            calculatedValue={calcValue}
                            isActive={isActive}
                            onActivate={() => setActiveCell({ rowIdx: rIdx, colKey: col.key })}
                            onChange={() => {}}
                            onKeyDownNav={(e) => handleCellNav(rIdx, col.key, e)}
                          />
                        </td>
                      );
                    }

                    if (col.isRemark) {
                      return (
                        <td
                          key={col.key}
                          onClick={() => {
                            if (canEditRemarks) {
                              setEditingRemarkRowIdx(rIdx);
                              setRemarkInput(row.remark || "");
                            }
                          }}
                          className="px-2 py-1 border-r border-b border-sheet-border cursor-pointer hover:bg-emerald-50/30 text-xs font-mono truncate max-w-[120px] sm:max-w-[180px] text-slate-700"
                          title={row.remark ? row.remark : canEditRemarks ? "Tap to add remark" : ""}
                        >
                          {row.remark ? (
                            <span>{row.remark}</span>
                          ) : (
                            <span className="text-slate-300 italic text-[10px]">
                              {canEditRemarks ? "+ Add remark" : ""}
                            </span>
                          )}
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
                          disabled={!canEditMeasurements}
                          autoEdit={isAutoEdit}
                          onAutoEditDone={() => setPendingEdit(null)}
                          onActivate={() => setActiveCell({ rowIdx: rIdx, colKey: col.key })}
                          onChange={(val) => updateCellData(rIdx, col.key, val)}
                          onKeyDownNav={(e) => handleCellNav(rIdx, col.key, e)}
                        />
                      </td>
                    );
                  })}
                  {canDeleteRows && (
                    <td className="px-1 py-1 text-center border-b border-sheet-border">
                      <button
                        onClick={() => deleteRow(rIdx)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                        title="Delete Row"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-sheet-text border-t border-sheet-border">
              <td className="px-1 sm:px-2 py-2 text-center font-mono font-semibold text-slate-500 border-r border-sheet-border"></td>
              <td
                colSpan={footerLabelColSpan}
                className="px-2 sm:px-3 py-2 text-right font-semibold text-slate-500 border-r border-sheet-border text-[10px] sm:text-xs"
              >
                TOTAL SQF =
              </td>
              <td className="px-2 sm:px-3 py-2 text-right font-bold text-emerald-700 border-r border-sheet-border text-[11px] sm:text-xs">
                {totalVal}
              </td>
              {showNationalCmCalc && (
                <td className="px-2 sm:px-3 py-2 text-right font-bold text-emerald-700 border-r border-sheet-border text-[11px] sm:text-xs">
                  {cmTotalVal}
                </td>
              )}
              {isCustomerSheet && <td></td>}
              {canDeleteRows && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Grid Footer Controls */}
      {canAddRows && (
        <div className="p-2 sm:p-3 bg-slate-50 border-t border-sheet-border flex items-center justify-start gap-2">
          <button
            onClick={addRow}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-all active:scale-95"
          >
            <Plus size={14} />
            Add Row
          </button>
        </div>
      )}

      {/* Add / Edit Remark Modal — Customer sheets only */}
      {isCustomerSheet && editingRemarkRowIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-sheet-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-sheet-text flex items-center gap-2">
                <MessageSquare size={16} className="text-emerald-600" />
                Add Remark
              </h3>
              <button
                onClick={() => setEditingRemarkRowIdx(null)}
                className="p-1 rounded-lg hover:bg-sheet-border text-sheet-muted"
              >
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              value={remarkInput}
              onChange={(e) => setRemarkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRemark()}
              placeholder="e.g. Wall measurement - Room 2"
              autoFocus
              className="w-full bg-slate-50 border border-sheet-border rounded-xl px-3 py-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/40"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingRemarkRowIdx(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-sheet-border"
              >
                Cancel
              </button>
              <button
                onClick={saveRemark}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1"
              >
                <Check size={14} />
                Save Remark
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
