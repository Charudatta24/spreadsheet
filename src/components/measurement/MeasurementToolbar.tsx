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
    <header className="sticky top-0 z-30 bg-sheet-surface border-b border-sheet-border px-4 py-2 flex flex-col gap-3 sm:px-4">
      {/* Top row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-0">
          <Link
            href="/measurement-sheets"
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
            title="Back to Measurement Sheets"
          >
            <ArrowLeft size={18} />
          </Link>

          <AppSwitcher currentApp="measurement-sheets" />

          <div className="h-4 w-px bg-sheet-border mx-1" />

          {/* Editable Title */}
          {editingTitle ? (
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleCommit}
              onKeyDown={(e) => e.key === "Enter" && handleTitleCommit()}
              autoFocus
              className="px-2 py-1 text-sm font-semibold text-sheet-text bg-white border border-emerald-500 rounded outline-none w-full max-w-[18rem]"
            />
          ) : (
            <h1
              onClick={() => {
                setTitleInput(sheet.title);
                setEditingTitle(true);
              }}
              className="text-sm font-semibold text-sheet-text truncate cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded transition-colors"
              title="Click to rename"
            >
              {sheet.title}
            </h1>
          )}

          {/* Badges */}
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            {sheet.locationType}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-500/10 text-slate-600 border border-slate-500/20">
            {sheet.personType}
          </span>
        </div>

        {/* Status Indicator & Toolbar Actions */}
        <div className="flex items-center gap-2">
          {/* Save Status Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500 font-medium">
            {isOffline ? (
              <>
                <WifiOff size={13} className="text-amber-500" />
                <span className="text-amber-600">Offline</span>
              </>
            ) : saveState === "saving" || saveState === "pending" ? (
              <>
                <RefreshCw size={12} className="text-emerald-500 animate-spin" />
                <span>Saving...</span>
              </>
            ) : saveState === "error" ? (
              <>
                <AlertCircle size={13} className="text-red-500" />
                <span className="text-red-500">Save failed. Retrying...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span className="text-slate-600 dark:text-slate-300">All changes saved</span>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-sheet-border mx-1" />

          {/* Undo / Redo */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text disabled:opacity-30 transition-colors"
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text disabled:opacity-30 transition-colors"
            title="Redo"
          >
            <Redo2 size={16} />
          </button>

          <div className="h-4 w-px bg-sheet-border mx-1" />

          {/* Export & Print */}
          <button
            onClick={() => exportMeasurementToExcel(sheet)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-all active:scale-95"
            title="Download as Excel (.xlsx)"
          >
            <Download size={14} />
            <span>Excel</span>
          </button>

          <button
            onClick={() => exportMeasurementToCSV(sheet, activePersonIdx)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sheet-border hover:bg-sheet-border text-sheet-text font-medium text-xs transition-all"
            title="Export CSV"
          >
            <FileSpreadsheet size={14} />
            <span>CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="p-1.5 rounded-lg border border-sheet-border hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors"
            title="Print sheet"
          >
            <Printer size={16} />
          </button>
        </div>
      </div>

      {/* Multiple People Tabs (if sheetType === 'multiple') */}
      {sheet.people.length > 1 && (
        <div className="flex items-center gap-1 border-t border-sheet-border pt-2 overflow-x-auto">
          <span className="text-xs font-semibold text-slate-400 mr-2 flex items-center gap-1 shrink-0">
            <User size={13} /> Currently measuring:
          </span>
          {sheet.people.map((person, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPerson(idx)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activePersonIdx === idx
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
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
