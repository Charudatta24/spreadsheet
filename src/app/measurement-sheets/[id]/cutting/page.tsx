"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Scissors,
  Cpu,
  User,
  Users,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Download,
  Printer,
  Plus,
  Minus,
  Ruler,
  AlertCircle,
  Save,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import type {
  MeasurementSheet,
  CuttingData,
  CuttingMachineSection,
  CuttingRowItem,
} from "@/types";
import { calculateRowResult } from "@/lib/measurementExport";
import * as XLSX from "xlsx";

export default function CuttingSheetPage() {
  const params = useParams();
  const router = useRouter();
  const sheetId = params.id as string;
  const { user } = useAuthStore();

  const [sheet, setSheet] = useState<MeasurementSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Cutting sheet local state
  const [numMachines, setNumMachines] = useState<number>(3);
  const [numPolishes, setNumPolishes] = useState<number>(2);
  const [polishesList, setPolishesList] = useState<{ userId?: string; name: string }[]>([]);
  const [machines, setMachines] = useState<CuttingMachineSection[]>([]);

  // Subscribe to measurement sheet
  useEffect(() => {
    if (!sheetId) return;
    const unsub = onSnapshot(doc(db, "measurementSheets", sheetId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as MeasurementSheet;
        setSheet(data);
      }
      setLoading(false);
    });
    return unsub;
  }, [sheetId]);

  // Extract all measurement rows from all people in the same-day measurement sheet
  const allMeasurementRows = useMemo(() => {
    if (!sheet) return [];
    const items: CuttingRowItem[] = [];
    sheet.people?.forEach((person, pIdx) => {
      person.rows?.forEach((row, rIdx) => {
        // Only include rows with actual length or height
        if (row.A !== null || row.B !== null) {
          const calc = calculateRowResult(sheet.locationType, row.A, row.B, row.C);
          items.push({
            rowId: `p${pIdx}_r${rIdx}_sno${row.serialNumber}`,
            sno: row.serialNumber,
            length: row.A,
            height: row.B,
            calculated: calc,
            polishName: person.name,
            remark: row.remark || "",
          });
        }
      });
    });
    return items;
  }, [sheet]);

  // Derive polish list from sheet people or saved polishes
  useEffect(() => {
    if (!sheet) return;
    if (sheet.cuttingData) {
      setNumMachines(sheet.cuttingData.numMachines || 3);
      setNumPolishes(sheet.cuttingData.numPolishes || Math.max(1, sheet.people.length));
      setPolishesList(
        sheet.cuttingData.polishes?.length
          ? sheet.cuttingData.polishes
          : sheet.people.map((p) => ({ userId: p.userId, name: p.name }))
      );
      if (sheet.cuttingData.machines?.length) {
        setMachines(sheet.cuttingData.machines);
      }
    } else {
      const initialPolishes = sheet.people.map((p) => ({ userId: p.userId, name: p.name }));
      setNumPolishes(Math.max(1, initialPolishes.length));
      setPolishesList(initialPolishes);
    }
  }, [sheet]);

  // Initialize or re-sync machine sections when numMachines or measurement rows change
  useEffect(() => {
    if (!sheet || allMeasurementRows.length === 0) return;

    // If machines already initialized from Firestore and machine count matches, update items preserving edits
    const currentMachineCount = numMachines > 0 ? numMachines : 3;

    setMachines((existingMachines) => {
      const updatedMachines: CuttingMachineSection[] = [];

      for (let i = 0; i < currentMachineCount; i++) {
        const machineId = `machine_${i + 1}`;
        const machineName = `Machine ${i + 1}`;
        const prevSection = existingMachines.find((m) => m.id === machineId || m.name === machineName);

        updatedMachines.push({
          id: machineId,
          name: machineName,
          assignedRows: prevSection?.assignedRows ? [...prevSection.assignedRows] : [],
        });
      }

      // Ensure all measurement rows are assigned somewhere (default: round-robin)
      const assignedIds = new Set<string>();
      updatedMachines.forEach((m) => {
        m.assignedRows.forEach((r) => assignedIds.add(r.rowId));
      });

      const unassigned = allMeasurementRows.filter((r) => !assignedIds.has(r.rowId));

      unassigned.forEach((row, idx) => {
        const targetMachineIdx = idx % currentMachineCount;
        updatedMachines[targetMachineIdx].assignedRows.push({ ...row });
      });

      return updatedMachines;
    });
  }, [sheet, allMeasurementRows, numMachines]);

  // Handle saving cutting data to Firestore
  const handleSaveCuttingData = async () => {
    if (!sheetId || !sheet) return;
    setSaving(true);
    setSaveSuccess(false);

    const cuttingDataPayload: CuttingData = {
      numMachines,
      numPolishes,
      polishes: polishesList,
      machines,
      updatedAt: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(db, "measurementSheets", sheetId), {
        cuttingData: cuttingDataPayload,
        updatedAt: serverTimestamp(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving cutting sheet data:", err);
    } finally {
      setSaving(false);
    }
  };

  // Move a row from one machine to another
  const handleMoveRow = (rowId: string, fromMachineId: string, toMachineId: string) => {
    if (fromMachineId === toMachineId) return;
    setMachines((prev) => {
      const updated = prev.map((m) => ({ ...m, assignedRows: [...m.assignedRows] }));
      const sourceMachine = updated.find((m) => m.id === fromMachineId);
      const targetMachine = updated.find((m) => m.id === toMachineId);

      if (sourceMachine && targetMachine) {
        const rowToMoveIdx = sourceMachine.assignedRows.findIndex((r) => r.rowId === rowId);
        if (rowToMoveIdx !== -1) {
          const [movedRow] = sourceMachine.assignedRows.splice(rowToMoveIdx, 1);
          targetMachine.assignedRows.push(movedRow);
        }
      }
      return updated;
    });
  };

  // Update item cut parameters
  const handleUpdateItem = (
    machineId: string,
    rowId: string,
    field: "cutLength" | "cutHeight" | "polishName" | "remark",
    value: any
  ) => {
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        return {
          ...m,
          assignedRows: m.assignedRows.map((item) => {
            if (item.rowId !== rowId) return item;
            const updated = { ...item, [field]: value };
            // Auto calculate waste if cutLength/cutHeight present
            if (field === "cutLength" || field === "cutHeight") {
              const cLen = updated.cutLength ?? updated.length ?? 0;
              const cHgt = updated.cutHeight ?? updated.height ?? 0;
              const actualCalc = updated.calculated || 0;
              const cutCalc = cLen * cHgt;
              updated.waste = Math.max(0, actualCalc - cutCalc);
            }
            return updated;
          }),
        };
      })
    );
  };

  // Export Cutting Sheet to Excel
  const handleExportExcel = () => {
    if (!sheet) return;
    const wb = XLSX.utils.book_new();

    machines.forEach((m) => {
      const data = m.assignedRows.map((r) => ({
        "S.No.": r.sno,
        "Original Length": r.length ?? "-",
        "Original Height": r.height ?? "-",
        "Calculated Area": r.calculated,
        "Polish": r.polishName || "-",
        "Cut Length": r.cutLength ?? "-",
        "Cut Height": r.cutHeight ?? "-",
        "Waste": r.waste ?? 0,
        "Remark": r.remark || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, m.name.substring(0, 31));
    });

    XLSX.writeFile(wb, `${sheet.title}_Cutting_Sheet.xlsx`);
  };

  if (loading || !sheet) {
    return <LoadingGrid fullPage size="lg" label="Loading Cutting Sheet..." />;
  }

  const isOwner = sheet.userId === user?.uid;
  const customerName =
    sheet.people?.find((p) => p.name)?.name || sheet.title;

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text pb-16">
      {/* ── Top Header Bar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-sheet-surface border-b border-sheet-border px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/measurement-sheets/${sheet.id}`}
            className="p-2 rounded-xl border border-sheet-border hover:bg-slate-100 text-slate-600 transition-colors shrink-0"
            title="Back to Measurement Sheet"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Scissors size={18} className="text-indigo-600 shrink-0" />
              <h1 className="font-bold text-sm sm:text-base text-sheet-text truncate">
                Cutting Sheet — {sheet.title}
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-2">
              <span>Date: <strong>{sheet.date}</strong></span>
              <span>·</span>
              <span>Customer: <strong>{customerName}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
            title="Export Cutting Sheet to Excel"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          <button
            onClick={handleSaveCuttingData}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 size={14} className="text-emerald-300" />
            ) : (
              <Save size={14} />
            )}
            <span>{saving ? "Saving…" : saveSuccess ? "Saved!" : "Save Cutting"}</span>
          </button>
        </div>
      </header>

      {/* ── Control Bar: Machines & Polishes Count (Requirements 7 & 8) ────── */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white border border-sheet-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-sheet-border pb-3">
            <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Cpu size={18} className="text-indigo-600" />
              Cutting Structure Setup
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              Same-day Measurement Items: <strong>{allMeasurementRows.length}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Number of Machines Selector (Requirement 7) */}
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-2">
              <label className="block text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <Cpu size={14} className="text-indigo-600" />
                Number of Machines <span className="text-indigo-600">*</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setNumMachines((prev) => Math.max(1, prev - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 shadow-sm"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={numMachines}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1) setNumMachines(v);
                  }}
                  className="w-16 text-center font-mono font-bold text-sm bg-white border border-indigo-200 rounded-lg py-1 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <button
                  type="button"
                  onClick={() => setNumMachines((prev) => Math.min(20, prev + 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 shadow-sm"
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs text-indigo-700 font-medium">
                  {numMachines} machine section{numMachines !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Number of Polishes Selector (Requirement 8) */}
            <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-100 space-y-2">
              <label className="block text-xs font-bold text-purple-900 flex items-center gap-1.5">
                <Users size={14} className="text-purple-600" />
                Number of Polishes <span className="text-purple-600">*</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setNumPolishes((prev) => Math.max(1, prev - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-purple-200 hover:bg-purple-100 flex items-center justify-center font-bold text-purple-700 shadow-sm"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={numPolishes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1) setNumPolishes(v);
                  }}
                  className="w-16 text-center font-mono font-bold text-sm bg-white border border-purple-200 rounded-lg py-1 text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/40"
                />
                <button
                  type="button"
                  onClick={() => setNumPolishes((prev) => Math.min(20, prev + 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-purple-200 hover:bg-purple-100 flex items-center justify-center font-bold text-purple-700 shadow-sm"
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs text-purple-700 font-medium">
                  {numPolishes} Polish{numPolishes !== 1 ? "es" : ""} assigned
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Machines-Based Sections Grid (Requirement 7 & 8) ──────────────── */}
        <div className="space-y-6">
          {machines.map((machine) => {
            const totalMachineArea = machine.assignedRows.reduce((acc, r) => acc + (r.calculated || 0), 0);

            return (
              <div
                key={machine.id}
                className="bg-white border border-sheet-border rounded-2xl shadow-sm overflow-hidden"
              >
                {/* Machine Header */}
                <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu size={18} className="text-indigo-400" />
                    <h3 className="font-bold text-sm sm:text-base tracking-wide">{machine.name}</h3>
                    <span className="ml-2 bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                      {machine.assignedRows.length} item{machine.assignedRows.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="font-mono text-emerald-400 font-bold text-xs sm:text-sm">
                    TOTAL AREA: {totalMachineArea}
                  </div>
                </div>

                {/* Machine Rows Table */}
                {machine.assignedRows.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No items assigned to {machine.name}. You can move measurement items here from other machines.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-sheet-border text-[11px]">
                          <th className="px-3 py-2 text-center w-12">S.No.</th>
                          <th className="px-3 py-2 text-right">Length</th>
                          <th className="px-3 py-2 text-right">Height</th>
                          <th className="px-3 py-2 text-right text-emerald-700 bg-emerald-50/50">Calculated</th>
                          <th className="px-3 py-2 text-left">Assigned Polish</th>
                          <th className="px-3 py-2 text-right">Cut Length</th>
                          <th className="px-3 py-2 text-right">Cut Height</th>
                          <th className="px-3 py-2 text-left">Move Machine</th>
                          <th className="px-3 py-2 text-left">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sheet-border">
                        {machine.assignedRows.map((item) => (
                          <tr key={item.rowId} className="hover:bg-slate-50 transition-colors">
                            {/* S.No. */}
                            <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-600 bg-slate-50">
                              {item.sno}
                            </td>

                            {/* Original Length */}
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-700">
                              {item.length ?? "-"}
                            </td>

                            {/* Original Height */}
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-700">
                              {item.height ?? "-"}
                            </td>

                            {/* Calculated */}
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                              {item.calculated}
                            </td>

                            {/* Assigned Polish (Requirement 8) */}
                            <td className="px-3 py-2.5">
                              <select
                                value={item.polishName || ""}
                                onChange={(e) => handleUpdateItem(machine.id, item.rowId, "polishName", e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-purple-500/30 max-w-[130px] truncate"
                              >
                                <option value="">Select Polish…</option>
                                {polishesList.map((p, i) => (
                                  <option key={i} value={p.name}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Cut Length */}
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                step="any"
                                placeholder={String(item.length ?? "")}
                                value={item.cutLength ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                  handleUpdateItem(machine.id, item.rowId, "cutLength", val);
                                }}
                                className="w-20 text-right font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500/30"
                              />
                            </td>

                            {/* Cut Height */}
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                step="any"
                                placeholder={String(item.height ?? "")}
                                value={item.cutHeight ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                  handleUpdateItem(machine.id, item.rowId, "cutHeight", val);
                                }}
                                className="w-20 text-right font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500/30"
                              />
                            </td>

                            {/* Move Machine selector */}
                            <td className="px-3 py-2.5">
                              <select
                                value={machine.id}
                                onChange={(e) => handleMoveRow(item.rowId, machine.id, e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500/30"
                              >
                                {machines.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Remark */}
                            <td className="px-3 py-2.5 text-slate-600">
                              <input
                                type="text"
                                value={item.remark || ""}
                                onChange={(e) => handleUpdateItem(machine.id, item.rowId, "remark", e.target.value)}
                                placeholder="Add note…"
                                className="w-full min-w-[100px] bg-transparent border-b border-slate-200 px-1 py-0.5 text-xs outline-none focus:border-indigo-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
