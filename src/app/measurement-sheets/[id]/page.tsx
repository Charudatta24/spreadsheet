"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/sync/authStore";
import { useMeasurementSync } from "@/hooks/useMeasurementSync";
import { MeasurementToolbar } from "@/components/measurement/MeasurementToolbar";
import { MeasurementGrid } from "@/components/measurement/MeasurementGrid";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import type { MeasurementRow } from "@/types";

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

  // Security check: ensure current user is owner OR accepted participant
  useEffect(() => {
    if (!loading && sheet && user) {
      const isOwner = sheet.userId === user.uid;
      const myEntry = sheet.people?.find((p) => p.userId === user.uid);
      const isAcceptedParticipant = myEntry?.status === "accepted";
      if (!isOwner && !isAcceptedParticipant) {
        console.warn("Unauthorized access to measurement sheet");
        router.replace("/measurement-sheets");
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
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {/* Person Header Banner */}
        <div className="mb-4 flex items-center justify-between bg-sheet-surface p-4 rounded-xl border border-sheet-border shadow-sm">
          <div>
            <h2 className="text-sm font-bold text-sheet-text flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {sheet.sheetType === "private"
                ? `Person: ${currentPerson?.name}`
                : `Currently Measuring: ${currentPerson?.name}`}
            </h2>
          </div>
        </div>

        {/* Measurement Grid Table */}
        {currentPerson && (
          <MeasurementGrid
            key={`${sheet.id}_${activePersonIdx}`}
            locationType={sheet.locationType}
            rows={currentPerson.rows}
            onChangeRows={handleRowsChange}
          />
        )}
      </main>
    </div>
  );
}
