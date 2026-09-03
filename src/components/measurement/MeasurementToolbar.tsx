"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  WifiOff,
  User,
  Shield,
  FileText,
} from "lucide-react";
import type { MeasurementSheet, SaveState, WorkerPermissions } from "@/types";
import { exportMeasurementToPDF, calculateSheetTotal } from "@/lib/measurementExport";
import { useAuthStore } from "@/lib/sync/authStore";

interface MeasurementToolbarProps {
  sheet: MeasurementSheet;
  saveState: SaveState;
  isOffline: boolean;
  activePersonIdx: number;
  isOwner: boolean;
  isReadonlyDay: boolean;
  currentUserPermissions?: WorkerPermissions;
  /** Where the back arrow navigates (defaults to measurement sheets list) */
  backHref?: string;
  onSelectPerson: (idx: number) => void;
  onRename: (title: string) => void;
  onUpdatePermissions?: (personIdx: number, newPerms: WorkerPermissions) => void;
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
  isOwner,
  isReadonlyDay,
  currentUserPermissions,
  backHref = "/measurement-sheets",
  onSelectPerson,
  onRename,
  onUpdatePermissions,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: MeasurementToolbarProps) {
  const user = useAuthStore((s) => s.user);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(sheet.title);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);

  const total = calculateSheetTotal(sheet);

  const handleTitleCommit = () => {
    setEditingTitle(false);
    if (isOwner && titleInput.trim() && titleInput !== sheet.title) {
      onRename(titleInput.trim());
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const currentPerson = sheet.people[activePersonIdx];
  const currentPerms: WorkerPermissions = currentPerson?.permissions || {
    canView: true,
    canModifyMeasurements: true,
    canModifySerialNumbers: false,
    canModifyRemarks: true,
    canAddRows: true,
    canDeleteRows: false,
  };

  const togglePermKey = (key: keyof WorkerPermissions) => {
    if (!onUpdatePermissions) return;
    const updated = { ...currentPerms, [key]: !currentPerms[key] };
    onUpdatePermissions(activePersonIdx, updated);
  };

  return (
    <header className="sticky top-0 z-30 bg-sheet-surface border-b border-sheet-border">
      {/* Main toolbar row */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-4 py-2">
        {/* Left: back + title */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <Link
            href={backHref}
            className="p-1.5 rounded-lg hover:bg-sheet-border text-sheet-muted hover:text-sheet-text transition-colors shrink-0"
            title="Back"
          >
            <ArrowLeft size={17} />
          </Link>

          {/* Title */}
          {editingTitle && isOwner ? (
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleCommit}
              onKeyDown={(e) => e.key === "Enter" && handleTitleCommit()}
              autoFocus
              className="px-2 py-1 text-xs sm:text-sm font-semibold text-sheet-text bg-white border border-blue-500 rounded outline-none w-full max-w-[12rem] sm:max-w-[18rem]"
            />
          ) : (
            <h1
              onClick={() => {
                if (isOwner) {
                  setTitleInput(sheet.title);
                  setEditingTitle(true);
                }
              }}
              className={`text-xs sm:text-sm font-semibold text-sheet-text truncate px-2 py-1 rounded transition-colors max-w-[120px] sm:max-w-[200px] md:max-w-xs ${
                isOwner ? "cursor-pointer hover:bg-slate-100" : ""
              }`}
              title={isOwner ? "Click to rename" : sheet.title}
            >
              {sheet.title}
            </h1>
          )}
        </div>

        {/* Right: status, indicator, actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">

          {/* Manage Permissions Button (Owner Only) — only when invited people exist */}
          {isOwner &&
            sheet.sheetCategory !== "cutting" &&
            sheet.people.some((p) => Boolean(p.userId)) && (
            <button
              onClick={() => setShowPermissionsModal(true)}
              className="p-1.5 rounded-lg border border-sheet-border hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1"
              title="Manage Permissions"
            >
              <Shield size={14} className="text-purple-600" />
              <span className="hidden md:inline text-[11px]">Permissions</span>
            </button>
          )}

          {/* Save Status */}
          <div className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-full bg-slate-100 text-[10px] sm:text-[11px] text-slate-500 font-medium">
            {isOffline ? (
              <>
                <WifiOff size={12} className="text-amber-500" />
                <span className="hidden sm:inline text-amber-600">Offline</span>
              </>
            ) : saveState === "saving" || saveState === "pending" ? (
              <>
                <RefreshCw size={11} className="text-blue-500 animate-spin" />
                <span className="hidden sm:inline">Saving...</span>
              </>
            ) : saveState === "error" ? (
              <>
                <AlertCircle size={12} className="text-red-500" />
                <span className="hidden sm:inline text-red-500">Failed</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={12} className="text-blue-500" />
                <span className="hidden sm:inline text-slate-600">Saved</span>
              </>
            )}
          </div>


          {/* PDF Export Only */}
          <button
            onClick={() => exportMeasurementToPDF(sheet, user?.factoryName, user?.phoneNumber)}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
            title="Download as PDF"
          >
            <FileText size={13} />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* People / Machine tabs row — cutting always shows machine tabs (even if only 1) */}
      {(sheet.sheetCategory === "cutting" ? sheet.people.length >= 1 : sheet.people.length > 1) && (
        <div className="flex items-center gap-1 border-t border-sheet-border px-2 sm:px-4 py-1.5 overflow-x-auto">
          <span className="text-[10px] sm:text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
            <User size={11} />
            <span className="hidden sm:inline">
              {sheet.sheetCategory === "cutting" ? "Machines:" : "Measuring:"}
            </span>
          </span>
          {sheet.people.map((person, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPerson(idx)}
              className={`px-2 sm:px-3 py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all shrink-0 ${
                activePersonIdx === idx
                  ? "bg-blue-600 text-white shadow-sm font-semibold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {person.name || (sheet.sheetCategory === "cutting" ? `Machine ${idx + 1}` : `Person ${idx + 1}`)}
            </button>
          ))}
        </div>
      )}

      {/* Permissions Management Modal (Owner Only) */}
      {showPermissionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-sheet-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-sheet-border pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Shield size={18} className="text-purple-600" />
                Manage Permissions for {currentPerson?.name}
              </h3>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 py-2 text-xs">
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <span className="font-semibold text-slate-700">Modify Measurements (Length / Height)</span>
                <input
                  type="checkbox"
                  checked={currentPerms.canModifyMeasurements}
                  onChange={() => togglePermKey("canModifyMeasurements")}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <span className="font-semibold text-slate-700">Change Serial Numbers</span>
                <input
                  type="checkbox"
                  checked={currentPerms.canModifySerialNumbers}
                  onChange={() => togglePermKey("canModifySerialNumbers")}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <span className="font-semibold text-slate-700">Add / Edit Remarks</span>
                <input
                  type="checkbox"
                  checked={currentPerms.canModifyRemarks}
                  onChange={() => togglePermKey("canModifyRemarks")}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <span className="font-semibold text-slate-700">Add New Rows</span>
                <input
                  type="checkbox"
                  checked={currentPerms.canAddRows}
                  onChange={() => togglePermKey("canAddRows")}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <span className="font-semibold text-slate-700">Delete Rows</span>
                <input
                  type="checkbox"
                  checked={currentPerms.canDeleteRows}
                  onChange={() => togglePermKey("canDeleteRows")}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
