"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, CheckCircle, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/lib/sync/authStore";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import type { CalculationSheet } from "@/types";
import { getCalculationSheet, updateCalculationValues } from "@/lib/firebase/firestore";
import { fmt2, round2, fmt2Val, exportCalculationToPDF } from "@/lib/measurementExport";

function formatDate(ts: any): string {
  try {
    const ms = ts?.toMillis?.() ?? ts ?? Date.now();
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

export default function CalculationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const [sheet, setSheet] = useState<CalculationSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const id = params?.id as string;

  // Undersize inputs & states
  const [underInput, setUnderInput] = useState("");
  const [underSaving, setUnderSaving] = useState(false);
  const [underSaved, setUnderSaved] = useState(false);
  const [underError, setUnderError] = useState("");

  // Below Undersize inputs & states
  const [belowInput, setBelowInput] = useState("");
  const [belowSaving, setBelowSaving] = useState(false);
  const [belowSaved, setBelowSaved] = useState(false);
  const [belowError, setBelowError] = useState("");

  useEffect(() => {
    if (user && user.accountType !== "owner") {
      router.replace("/hub");
    }
  }, [user, router]);

  useEffect(() => {
    if (!id) return;
    getCalculationSheet(id)
      .then((data) => {
        if (!data) {
          setNotFound(true);
          return;
        }
        if (user && data.userId !== user.uid) {
          router.replace("/calculation");
          return;
        }
        const exp = data.expiresAt?.toMillis?.() ?? data.expiresAt ?? 0;
        if (exp <= Date.now()) {
          setNotFound(true);
          return;
        }
        setSheet(data);
        if (data.underValue != null) setUnderInput(String(data.underValue));
        if (data.belowValue != null) setBelowInput(String(data.belowValue));
      })
      .finally(() => setLoading(false));
  }, [id, user, router]);

  const underSqf2 = sheet ? parseFloat(fmt2(sheet.underTotalSqf)) : 0;
  const belowSqf2 = sheet ? parseFloat(fmt2(sheet.belowTotalSqf)) : 0;

  // Live and saved calculation using round2 (fixes IEEE 754 float precision)
  const liveUnderVal = parseFloat(underInput.trim());
  const effectiveUnderTotal =
    !isNaN(liveUnderVal) && isFinite(liveUnderVal) && liveUnderVal >= 0
      ? round2(underSqf2 * liveUnderVal)
      : sheet?.underValue != null
      ? round2(underSqf2 * sheet.underValue)
      : sheet?.underTotalValue != null
      ? round2(sheet.underTotalValue)
      : null;

  const liveBelowVal = parseFloat(belowInput.trim());
  const effectiveBelowTotal =
    !isNaN(liveBelowVal) && isFinite(liveBelowVal) && liveBelowVal >= 0
      ? round2(belowSqf2 * liveBelowVal)
      : sheet?.belowValue != null
      ? round2(belowSqf2 * sheet.belowValue)
      : sheet?.belowTotalValue != null
      ? round2(sheet.belowTotalValue)
      : null;

  // Combined totals
  const totalSlabs = (sheet?.underSlabCount ?? 0) + (sheet?.belowSlabCount ?? 0);
  const totalSqf2 = round2(underSqf2 + belowSqf2);
  const grandTotalVal =
    effectiveUnderTotal != null || effectiveBelowTotal != null
      ? round2((effectiveUnderTotal ?? 0) + (effectiveBelowTotal ?? 0))
      : null;

  async function handleUnderSubmit() {
    if (!sheet) return;
    setUnderError("");
    const trimmed = underInput.trim();
    if (!trimmed) {
      setUnderError("Enter value");
      return;
    }
    const num = parseFloat(trimmed);
    if (isNaN(num) || !isFinite(num) || num < 0) {
      setUnderError("Invalid number");
      return;
    }
    setUnderSaving(true);
    try {
      const total = round2(underSqf2 * num);
      await updateCalculationValues(sheet.id, { underValue: num, underTotalValue: total });
      setSheet((prev) => (prev ? { ...prev, underValue: num, underTotalValue: total } : prev));
      setUnderSaved(true);
      setTimeout(() => setUnderSaved(false), 2000);
    } catch {
      setUnderError("Save failed");
    } finally {
      setUnderSaving(false);
    }
  }

  async function handleBelowSubmit() {
    if (!sheet) return;
    setBelowError("");
    const trimmed = belowInput.trim();
    if (!trimmed) {
      setBelowError("Enter value");
      return;
    }
    const num = parseFloat(trimmed);
    if (isNaN(num) || !isFinite(num) || num < 0) {
      setBelowError("Invalid number");
      return;
    }
    setBelowSaving(true);
    try {
      const total = round2(belowSqf2 * num);
      await updateCalculationValues(sheet.id, { belowValue: num, belowTotalValue: total });
      setSheet((prev) => (prev ? { ...prev, belowValue: num, belowTotalValue: total } : prev));
      setBelowSaved(true);
      setTimeout(() => setBelowSaved(false), 2000);
    } catch {
      setBelowError("Save failed");
    } finally {
      setBelowSaving(false);
    }
  }

  if (!user) return <LoadingGrid fullPage size="lg" label="Loading..." />;
  if (loading) return <LoadingGrid fullPage size="lg" label="Loading calculation sheet..." />;

  if (notFound) {
    return (
      <div className="min-h-screen bg-sheet-bg flex flex-col items-center justify-center text-center p-6">
        <AlertCircle size={40} className="text-sheet-border mb-4" />
        <h2 className="text-lg font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif] mb-2">Sheet Not Found</h2>
        <p className="text-sm text-sheet-muted mb-6">This calculation sheet may have expired or been deleted.</p>
        <Link href="/calculation" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors">
          Back to Calculation
        </Link>
      </div>
    );
  }

  if (!sheet) return null;

  return (
    <div className="min-h-screen bg-sheet-bg text-sheet-text overflow-x-hidden">
      <div className="grid-mesh fixed inset-0 pointer-events-none z-0" />

      {/* Header */}
      <header className="sticky top-0 z-30 h-16 border-b border-sheet-border bg-sheet-bg/90 backdrop-blur-md flex items-center px-6 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/calculation" className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <span className="font-extrabold tracking-wide uppercase text-base font-['Cinzel','Playfair_Display',serif] truncate">
            <span className="text-slate-900">{sheet.sheetName.split(" ")[0]}</span>
            {sheet.sheetName.split(" ").length > 1 && (
              <span className="text-blue-600"> {sheet.sheetName.split(" ").slice(1).join(" ")}</span>
            )}
          </span>
        </div>
        <button
          onClick={() => exportCalculationToPDF(sheet, user?.phoneNumber)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shrink-0"
        >
          <Download size={15} />
          <span className="hidden sm:inline">Download</span> PDF
        </button>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-3 sm:pt-4 pb-16 px-4 sm:px-6 max-w-4xl mx-auto space-y-4">

        {/* Sheet Information Card */}
        <div className="bg-white rounded-2xl border border-sheet-border p-5 sm:p-6 shadow-sm">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900 font-['Cinzel','Playfair_Display',serif] mb-3 pb-2 border-b border-sheet-border">
            Sheet Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-sheet-muted uppercase tracking-wider">Sheet Name</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{sheet.sheetName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-sheet-muted uppercase tracking-wider">Date of Creation</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{formatDate(sheet.createdAt)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-sheet-muted uppercase tracking-wider">Total SQF</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{fmt2(sheet.totalSqf)}</p>
            </div>
          </div>
        </div>

        {/* Single-Line Calculation Table */}
        <div className="bg-white rounded-2xl border border-sheet-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[620px]">
              <thead>
                <tr className="border-b border-sheet-border bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-5">Category</th>
                  <th className="py-3.5 px-4 text-center">Number of Slabs</th>
                  <th className="py-3.5 px-4 text-right">Total SQF</th>
                  <th className="py-3.5 px-4 text-center">Enter Value (Per SQF)</th>
                  <th className="py-3.5 px-5 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sheet-border text-sm">

                {/* Undersize Row */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-5 font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif]">
                    Undersize
                  </td>
                  <td className="py-4 px-4 text-center font-bold text-slate-800">
                    {sheet.underSlabCount}
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-slate-800">
                    {fmt2(underSqf2)}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center justify-center gap-1.5 max-w-[210px] mx-auto">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={underInput}
                        onChange={(e) => {
                          setUnderInput(e.target.value);
                          setUnderError("");
                          setUnderSaved(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUnderSubmit();
                        }}
                        placeholder="0.00"
                        className="w-24 bg-sheet-bg border border-sheet-border rounded-lg px-2.5 py-1.5 text-sm font-semibold text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={handleUnderSubmit}
                        disabled={underSaving}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors shadow-sm shrink-0 flex items-center gap-1"
                      >
                        {underSaving ? "..." : underSaved ? <><CheckCircle size={13} />Saved</> : "Submit"}
                      </button>
                    </div>
                    {underError && (
                      <p className="text-[11px] text-red-500 text-center mt-1">{underError}</p>
                    )}
                  </td>
                  <td className="py-4 px-5 text-right font-extrabold text-slate-900 text-base">
                    {effectiveUnderTotal != null ? fmt2Val(effectiveUnderTotal) : "—"}
                  </td>
                </tr>

                {/* Below Undersize Row */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-5 font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif]">
                    Below Undersize
                  </td>
                  <td className="py-4 px-4 text-center font-bold text-slate-800">
                    {sheet.belowSlabCount}
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-slate-800">
                    {fmt2(belowSqf2)}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center justify-center gap-1.5 max-w-[210px] mx-auto">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={belowInput}
                        onChange={(e) => {
                          setBelowInput(e.target.value);
                          setBelowError("");
                          setBelowSaved(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleBelowSubmit();
                        }}
                        placeholder="0.00"
                        className="w-24 bg-sheet-bg border border-sheet-border rounded-lg px-2.5 py-1.5 text-sm font-semibold text-sheet-text placeholder:text-sheet-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={handleBelowSubmit}
                        disabled={belowSaving}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors shadow-sm shrink-0 flex items-center gap-1"
                      >
                        {belowSaving ? "..." : belowSaved ? <><CheckCircle size={13} />Saved</> : "Submit"}
                      </button>
                    </div>
                    {belowError && (
                      <p className="text-[11px] text-red-500 text-center mt-1">{belowError}</p>
                    )}
                  </td>
                  <td className="py-4 px-5 text-right font-extrabold text-slate-900 text-base">
                    {effectiveBelowTotal != null ? fmt2Val(effectiveBelowTotal) : "—"}
                  </td>
                </tr>

                {/* Combined Total Row */}
                <tr className="bg-blue-50/60 border-t-2 border-blue-200">
                  <td className="py-4 px-5 font-extrabold uppercase text-xs tracking-wider text-slate-900">
                    Total
                  </td>
                  <td className="py-4 px-4 text-center font-extrabold text-slate-900">
                    {totalSlabs}
                  </td>
                  <td className="py-4 px-4 text-right font-extrabold text-slate-900">
                    {fmt2(totalSqf2)}
                  </td>
                  <td className="py-4 px-4 text-center text-slate-400 font-medium">
                    —
                  </td>
                  <td className="py-4 px-5 text-right font-extrabold text-blue-600 text-lg">
                    {grandTotalVal != null ? fmt2Val(grandTotalVal) : "—"}
                  </td>
                </tr>

              </tbody>
            </table>
          </div>
        </div>

        {/* Highlighted Combined Total Value Card */}
        {grandTotalVal != null && (
          <div className="bg-white border-2 border-blue-200/80 rounded-2xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-blue-600">
                Combined Total Value
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-['Cinzel','Playfair_Display',serif]">
                {fmt2Val(grandTotalVal)}
              </p>
            </div>
          </div>
        )}

      </main>

      <style jsx>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
        .grid-mesh { background-image: linear-gradient(rgba(26,115,232,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,115,232,0.04) 1px, transparent 1px); background-size: 60px 60px; animation: grid-scroll 20s linear infinite; }
        @keyframes grid-scroll { from { background-position: 0 0; } to { background-position: 60px 60px; } }
      `}</style>
    </div>
  );
}