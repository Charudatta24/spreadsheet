"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/sync/authStore";
import { useMeasurementSync } from "@/hooks/useMeasurementSync";
import { MeasurementToolbar } from "@/components/measurement/MeasurementToolbar";
import { MeasurementGrid } from "@/components/measurement/MeasurementGrid";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import type { MeasurementRow } from "@/types";
import { format } from "date-fns";

export default function MeasurementSheetEditorPage() {
  const params = useParams();
  const router = useRouter();
  const sheetId = params.id as string;

  const { user } = useAuthStore();
  const {
    sheet,
    loading,
    saveState,
    isOffline,
    updateSheet,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useMeasurementSync(sheetId, user?.uid);

  const [activePersonIdx, setActivePersonIdx] = useState(0);

  // Security check: ensure current user is owner OR accepted participant (and for workers, valid for today)
  useEffect(() => {
    if (!loading && sheet && user) {
      const isOwner = sheet.userId === user.uid;
      const myEntry = sheet.people?.find((p) => p.userId === user.uid);
      const isAcceptedParticipant = myEntry?.status === "accepted";

      if (!isOwner && !isAcceptedParticipant) {
        console.warn("Unauthorized access to measurement sheet");
        router.replace("/measurement-sheets");
        return;
      }

      // Worker day-based access check for non-owner workers
      if (!isOwner && sheet.personType === "worker") {
        const todayISO = format(new Date(), "yyyy-MM-dd");
        let sheetDateISO = sheet.dateISO;
        if (!sheetDateISO && sheet.date) {
          try {
            const parsed = new Date(sheet.date);
            if (!isNaN(parsed.getTime())) {
              sheetDateISO = format(parsed, "yyyy-MM-dd");
            }
          } catch (_) {}
        }
        if (sheetDateISO && sheetDateISO !== todayISO) {
          console.warn("Worker access valid only on scheduled date");
          router.replace("/measurement-sheets?type=worker");
        }
      }
    }
  }, [loading, sheet, user, router]);

  // Handle row data updates for active person
  const handleRowsChange = (newRows: MeasurementRow[]) => {
    updateSheet((prev) => {
      const copy = { ...prev };
      const updatedPeople = [...copy.people];
      if (updatedPeople[activePersonIdx]) {
        updatedPeople[activePersonIdx] = {
          ...updatedPeople[activePersonIdx],
          rows: newRows,
        };
      }
      copy.people = updatedPeople;
      return copy;
    });
  };

  // Handle title rename
  const handleRename = (newTitle: string) => {
    updateSheet((prev) => ({
      ...prev,
      title: newTitle,
    }));
  };

  if (loading || !sheet) {
    return <LoadingGrid fullPage size="lg" label="Loading Measurement Sheet..." />;
  }

  const currentPerson = sheet.people[activePersonIdx] || sheet.people[0];

  return (
    <div className="min-h-screen h-screen flex flex-col bg-sheet-bg text-sheet-text overflow-hidden">
      {/* Top Toolbar */}
      <MeasurementToolbar
        sheet={sheet}
        saveState={saveState}
        isOffline={isOffline}
        activePersonIdx={activePersonIdx}
        onSelectPerson={(idx) => setActivePersonIdx(idx)}
        onRename={handleRename}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Main Grid View */}
      <main className="flex-1 overflow-y-auto px-2 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 w-full max-w-5xl mx-auto">
        {/* Person Header Banner */}
        <div className="mb-3 flex items-center justify-between bg-sheet-surface px-3 py-2.5 sm:p-4 rounded-xl border border-sheet-border shadow-sm">
          <h2 className="text-xs sm:text-sm font-bold text-sheet-text flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="truncate">
              {sheet.sheetType === "private"
                ? `Person: ${currentPerson?.name}`
                : `Measuring: ${currentPerson?.name}`}
            </span>
          </h2>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">
              {sheet.locationType}
            </span>
            <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
              {sheet.personType}
            </span>
          </div>
        </div>

        {/* Measurement Grid Table */}
        {currentPerson && (
          <MeasurementGrid
            key={`${sheet.id}_${activePersonIdx}`}
            locationType={sheet.locationType}
            rows={currentPerson.rows}
            onChangeRows={handleRowsChange}
            autoFocusFirstCell={true}
          />
        )}
      </main>
    </div>
  );
}
