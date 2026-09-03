"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calculator,
  ArrowLeft,
  Download,
  Plus,
  X,
  FileText,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import type { CalculationSheet, MeasurementSheet } from "@/types";
import {
  subscribeCalculationSheets,
  deleteExpiredCalculationSheets,
  getNationalMeasurementSheets,
  createCalculationSheet,
} from "@/lib/firebase/firestore";
import { calculateSheetTotal, calculateRowResult, fmt2, exportCalculationToPDF } from "@/lib/measurementExport";

function formatDate(ts: any): string {
  try {
    const ms = ts?.toMillis?.() ?? ts ?? Date.now();
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

function expiryLabel(ts: any): { label: string; urgent: boolean } {
  try {
    const ms = ts?.toMillis?.() ?? ts ?? 0;
    const diff = ms - Date.now();
    const hours = Math.ceil(diff / (1000 * 60 * 60));
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (hours <= 0) return { label: "Expired", urgent: true };
    if (hours < 24) return { label: `Expires in ${hours}h`, urgent: true };
    return { label: `Expires in ${days}d`, urgent: days === 1 };
  } catch {
    return { label: "—", urgent: false };
  }
}

function classifySlabs(sheet: MeasurementSheet) {
  let underCount = 0;
  let underSqf = 0;
  let belowCount = 0;
  let belowSqf = 0;
  let totalSqf = 0;

  for (const person of sheet.people) {
    for (const row of person.rows) {
      const length = row.A;
      if (length == null || isNaN(length as number) || length === 0) continue;
      const sqf = calculateRowResult("national", row.A, row.B, row.C);
      totalSqf += sqf;
      if ((length as number) >= 44) {
        underCount++;
        underSqf += sqf;
      } else {
        belowCount++;
        belowSqf += sqf;
      }
    }
  }

  return {
    underCount,
    underSqf: parseFloat(fmt2(underSqf)),
    belowCount,
    belowSqf: parseFloat(fmt2(belowSqf)),
    totalSqf: parseFloat(fmt2(totalSqf)),
  };
}

function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (sheet: MeasurementSheet) => Promise<void>; }) {
  const [sheets, setSheets] = useState<MeasurementSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;
    getNationalMeasurementSheets(user.uid).then(setSheets).finally(() => setLoading(false));
  }, [user]);

  async function handleSelect(sheet: MeasurementSheet) {
    if (importing) return;
    setImporting(sheet.id);
    try { await onImport(sheet); } finally { setImporting(null); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white border border-sheet-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-sheet-border pb-3 mb-4 shrink-0">
          <h2 className="text-base font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif] flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            Import National Sheet
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-sheet-border text-sheet-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10"><LoadingGrid size="md" /></div>
        ) : sheets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
            <AlertCircle size={32} className="text-sheet-border mb-3" />
            <p className="text-sm font-semibold text-slate-900">No National Measurement Sheets available</p>
            <p className="text-xs text-sheet-muted mt-1">Create a National sheet in Measurement Sheets first.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {sheets.map((sheet) => {
              const total = calculateSheetTotal(sheet);
              const dateStr = formatDate(sheet.createdAt);
              const isImporting = importing === sheet.id;
              return (
                <button key={sheet.id} onClick={() => handleSelect(sheet)} disabled={!!importing}
                  className="w-full text-left p-4 rounded-xl border border-sheet-border hover:border-blue-500/50 hover:bg-blue-50/30 transition-all group disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 truncate">{sheet.title}</p>
                      <p className="text-xs text-sheet-muted mt-0.5">Created: {dateStr}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-full">{fmt2(total)} SQF</span>
                    </div>
                  </div>
                  {isImporting && <p className="text-xs text-blue-600 mt-2 font-medium">Importing…</p>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CalcCard({ sheet, onPdf }: { sheet: CalculationSheet; onPdf: () => void }) {
  const { label, urgent } = expiryLabel(sheet.expiresAt);
  return (
    <Link href={`/calculation/${sheet.id}`}
      className="group block rounded-2xl border border-sheet-border bg-white/60 hover:bg-white hover:border-blue-500/30 hover:shadow-xl transition-all duration-300 p-5 relative overflow-hidden">
      <span className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${urgent ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
        <Clock size={9} />{label}
      </span>
      <h3 className="text-sm font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif] pr-24 truncate mb-1">{sheet.sheetName}</h3>
      <p className="text-xs text-sheet-muted mb-4">Created: {formatDate(sheet.createdAt)}</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[{ label: "Total SQF", value: sheet.totalSqf }, { label: "Under SQF", value: sheet.underTotalSqf }, { label: "Below SQF", value: sheet.belowTotalSqf }].map(({ label, value }) => (
          <div key={label} className="bg-sheet-bg rounded-lg p-2 text-center border border-sheet-border/50">
            <p className="text-[10px] text-sheet-muted font-medium leading-tight">{label}</p>
            <p className="text-xs font-bold text-slate-900 mt-0.5">{fmt2(value)}</p>
          </div>
        ))}
      </div>
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPdf(); }}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
        <Download size={12} />PDF
      </button>
    </Link>
  );
}

export default function CalculationPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [sheets, setSheets] = useState<CalculationSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (user && user.accountType !== "owner") router.replace("/hub");
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    deleteExpiredCalculationSheets(user.uid).catch(() => undefined);
    const unsub = subscribeCalculationSheets(user.uid, (data) => { setSheets(data); setLoading(false); });
    return unsub;
  }, [user]);

  const handleImport = useCallback(async (sheet: MeasurementSheet) => {
    if (!user) return;
    const { underCount, underSqf, belowCount, belowSqf, totalSqf } = classifySlabs(sheet);
    const factoryName = user.factoryName ?? sheet.factoryName ?? "";
    const id = await createCalculationSheet(user.uid, factoryName, sheet, underCount, underSqf, belowCount, belowSqf, totalSqf);
    setShowImport(false);
    router.push(`/calculation/${id}`);
  }, [user, router]);

  if (!user) return <LoadingGrid fullPage size="lg" label="Loading…" />;
  if (user.accountType !== "owner") return null;

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text overflow-x-hidden">
      <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />
      <header className="sticky top-0 z-30 h-16 border-b border-sheet-border bg-sheet-bg/90 backdrop-blur-md flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <Link href="/hub" className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"><ArrowLeft size={18} /></Link>
          <span className="font-extrabold tracking-wide uppercase text-lg font-['Cinzel','Playfair_Display',serif]">
            <span className="text-slate-900">Calcu</span><span className="text-blue-600">lation</span>
          </span>
        </div>
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
          <Plus size={15} />Import
        </button>
      </header>

      <main className="relative z-10 pt-3 sm:pt-4 pb-16 px-6 max-w-6xl mx-auto">
        {loading ? (
          <LoadingGrid fullPage size="lg" label="Loading calculation sheets…" />
        ) : sheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200/60 text-blue-600 flex items-center justify-center mb-4"><Calculator size={32} /></div>
            <h2 className="text-lg font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif] mb-1">No Calculation Sheets</h2>
            <p className="text-sm text-sheet-muted mb-6 max-w-xs">Import a National Measurement Sheet to start calculating slab values.</p>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
              <Plus size={15} />Import Sheet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sheets.map((sheet) => (
              <CalcCard key={sheet.id} sheet={sheet} onPdf={() => exportCalculationToPDF(sheet, user?.phoneNumber)} />
            ))}
          </div>
        )}
      </main>

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}

      <style jsx>{`
        .grid-mesh { background-image: linear-gradient(rgba(26,115,232,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,115,232,0.04) 1px, transparent 1px); background-size: 60px 60px; animation: grid-scroll 20s linear infinite; }
        @keyframes grid-scroll { from { background-position: 0 0; } to { background-position: 60px 60px; } }
      `}</style>
    </div>
  );
}
