"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Printer,
  Undo2,
  Redo2,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  WifiOff,
  User,
  FileSpreadsheet,
} from "lucide-react";
import type { MeasurementSheet, SaveState } from "@/types";
import { exportMeasurementToExcel, exportMeasurementToCSV, calculateSheetTotal } from "@/lib/measurementExport";
import { AppSwitcher } from "@/components/ui/AppSwitcher";

interface MeasurementToolbarProps {
  sheet: MeasurementSheet;
  saveState: SaveState;
  isOffline: boolean;
  activePersonIdx: number;
  onSelectPerson: (idx: number) => void;
  onRename: (title: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function MeasurementToolbar({
  sheet,
  saveState,
  isOffline,
  activePersonIdx,
  onSelectPerson,
  onRename,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: MeasurementToolbarProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(sheet.title);

  const total = calculateSheetTotal(sheet);

  const handleTitleCommit = () => {
    setEditingTitle(false);
    if (titleInput.trim() && titleInput !== sheet.title) {
      onRename(titleInput.trim());
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <header className="sticky top-0 z-30 bg-sheet-surface border-b border-sheet-border">
      {/* Main toolbar row */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-4 py-2">
        {/* Left: back + title */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <Link
            href="/measurement-sheets"
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors shrink-0"
            title="Back"
          >
            <ArrowLeft size={17} />
          </Link>

          <div className="hidden sm:block shrink-0">
            <AppSwitcher currentApp="measurement-sheets" />
          </div>

          <div className="hidden sm:block h-4 w-px bg-sheet-border mx-0.5" />

          {/* Editable Title */}
          {editingTitle ? (
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleCommit}
              onKeyDown={(e) => e.key === "Enter" && handleTitleCommit()}
              autoFocus
              className="px-2 py-1 text-xs sm:text-sm font-semibold text-sheet-text bg-white border border-emerald-500 rounded outline-none w-full max-w-[12rem] sm:max-w-[18rem]"
            />
          ) : (
            <h1
              onClick={() => { setTitleInput(sheet.title); setEditingTitle(true); }}
              className="text-xs sm:text-sm font-semibold text-sheet-text truncate cursor-pointer hover:bg-slate-100 px-2 py-1 rounded transition-colors max-w-[120px] sm:max-w-[200px] md:max-w-xs"
              title="Click to rename"
            >
              {sheet.title}
            </h1>
          )}
        </div>

        {/* Right: save status + actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Save Status — icon only on mobile */}
          <div className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-full bg-slate-100 text-[10px] sm:text-[11px] text-slate-500 font-medium">
            {isOffline ? (
              <>
                <WifiOff size={12} className="text-amber-500" />
                <span className="hidden sm:inline text-amber-600">Offline</span>
              </>
            ) : saveState === "saving" || saveState === "pending" ? (
              <>
                <RefreshCw size={11} className="text-emerald-500 animate-spin" />
                <span className="hidden sm:inline">Saving...</span>
              </>
            ) : saveState === "error" ? (
              <>
                <AlertCircle size={12} className="text-red-500" />
                <span className="hidden sm:inline text-red-500">Failed</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span className="hidden sm:inline text-slate-600">Saved</span>
              </>
            )}
          </div>

          <div className="hidden sm:block h-4 w-px bg-sheet-border mx-0.5" />

          {/* Undo / Redo */}
          <button onClick={onUndo} disabled={!canUndo}
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text disabled:opacity-30 transition-colors"
            title="Undo"
          >
            <Undo2 size={15} />
          </button>
          <button onClick={onRedo} disabled={!canRedo}
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text disabled:opacity-30 transition-colors"
            title="Redo"
          >
            <Redo2 size={15} />
          </button>

          <div className="hidden sm:block h-4 w-px bg-sheet-border mx-0.5" />

          {/* Excel download — always visible */}
          <button
            onClick={() => exportMeasurementToExcel(sheet)}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-all active:scale-95"
            title="Download as Excel (.xlsx)"
          >
            <Download size={13} />
            <span>Excel</span>
          </button>

          {/* CSV — hidden on small mobile */}
          <button
            onClick={() => exportMeasurementToCSV(sheet, activePersonIdx)}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sheet-border hover:bg-sheet-border text-sheet-text font-medium text-xs transition-all"
            title="Export CSV"
          >
            <FileSpreadsheet size={13} />
            <span>CSV</span>
          </button>

          <button onClick={handlePrint}
            className="hidden sm:block p-1.5 rounded-lg border border-sheet-border hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
            title="Print sheet"
          >
            <Printer size={15} />
          </button>
        </div>
      </div>

      {/* People tabs row (multiple sheets) */}
      {sheet.people.length > 1 && (
        <div className="flex items-center gap-1 border-t border-sheet-border px-2 sm:px-4 py-1.5 overflow-x-auto">
          <span className="text-[10px] sm:text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
            <User size={11} />
            <span className="hidden sm:inline">Measuring:</span>
          </span>
          {sheet.people.map((person, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPerson(idx)}
              className={`px-2 sm:px-3 py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all shrink-0 ${
                activePersonIdx === idx
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {person.name || `Person ${idx + 1}`}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
