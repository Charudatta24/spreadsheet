"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/sync/authStore";
import { useMeasurementSync } from "@/hooks/useMeasurementSync";
import { MeasurementToolbar } from "@/components/measurement/MeasurementToolbar";
import { MeasurementGrid } from "@/components/measurement/MeasurementGrid";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import type { MeasurementRow, WorkerPermissions } from "@/types";
import { format } from "date-fns";
import { Clock, Lock, History } from "lucide-react";

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

  // Derive ownership and dates
  const isOwner = useMemo(() => sheet?.userId === user?.uid, [sheet, user]);

  const todayISO = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const sheetDateISO = useMemo(() => {
    if (!sheet) return null;
    if (sheet.dateISO) return sheet.dateISO;
    if (sheet.date) {
      try {
        const parsed = new Date(sheet.date);
        if (!isNaN(parsed.getTime())) return format(parsed, "yyyy-MM-dd");
      } catch (_) {}
    }
    return null;
  }, [sheet]);

  // isReadonlyDay: worker has passed the scheduled date
  const isReadonlyDay = useMemo(() => {
    if (isOwner) return false;
    if (!sheetDateISO) return false;
    return todayISO > sheetDateISO;
  }, [isOwner, todayISO, sheetDateISO]);

  // Derive current user's permissions from the sheet
  // Cutting: invitees live in invitedWorkers / cuttingData.polishes (people = machines)
  const myPersonEntry = useMemo(() => {
    if (!sheet || !user) return null;
    if (sheet.sheetCategory === "cutting") {
      return (
        sheet.invitedWorkers?.find((p) => p.userId === user.uid) ??
        sheet.cuttingData?.polishes?.find((p) => p.userId === user.uid) ??
        null
      );
    }
    return (
      sheet.people?.find((p) => p.userId === user.uid) ??
      sheet.invitedWorkers?.find((p) => p.userId === user.uid) ??
      sheet.cuttingData?.polishes?.find((p) => p.userId === user.uid) ??
      null
    );
  }, [sheet, user]);

  const myPermissions: WorkerPermissions | undefined = useMemo(() => {
    if (isOwner) return undefined;
    const perms = (myPersonEntry as { permissions?: WorkerPermissions } | null)?.permissions;
    return (
      perms ?? {
        canView: true,
        canModifyMeasurements: true,
        canModifySerialNumbers: false,
        canModifyRemarks: true,
        canAddRows: true,
        canDeleteRows: false,
      }
    );
  }, [isOwner, myPersonEntry]);

  // Security guard: redirect if not authorized
  useEffect(() => {
    if (!loading && sheet && user) {
      if (sheet.deleted) {
        if (sheet.userId === user.uid) {
          router.replace("/hub/account?tab=trash");
        } else {
          const fallbackType = user.workType ? `/measurement-sheets?type=${user.workType}` : "/measurement-sheets";
          router.replace(fallbackType);
        }
        return;
      }

      const isSheetOwner = sheet.userId === user.uid;
      const myEntry =
        sheet.people?.find((p) => p.userId === user.uid) ||
        sheet.invitedWorkers?.find((p) => p.userId === user.uid) ||
        sheet.cuttingData?.polishes?.find((p) => p.userId === user.uid);
      const inParticipantIds = sheet.participantIds?.includes(user.uid) === true;
      const isParticipant =
        myEntry?.status === "accepted" ||
        (inParticipantIds && myEntry?.status !== "declined") ||
        (inParticipantIds && !myEntry);

      if (!isSheetOwner && !isParticipant) {
        console.warn("Unauthorized access to measurement sheet");
        const fallback =
          user.accountType === "non-owner" && user.workType
            ? `/measurement-sheets?type=${user.workType}`
            : "/measurement-sheets";
        router.replace(fallback);
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
      copy.lastUpdatedBy = user?.displayName || user?.nickname || "Unknown";
      copy.lastUpdatedAt = new Date().toISOString();
      return copy;
    });
  };

  // Handle title rename (owner only)
  const handleRename = (newTitle: string) => {
    if (!isOwner) return;
    updateSheet((prev) => ({ ...prev, title: newTitle }));
  };

  // Handle permissions update (owner only) — never apply to cutting machine tabs
  const handleUpdatePermissions = (personIdx: number, newPerms: WorkerPermissions) => {
    if (!isOwner) return;
    updateSheet((prev) => {
      if (prev.sheetCategory === "cutting") {
        const invitees = [...(prev.invitedWorkers || [])];
        if (!invitees[personIdx]) return prev;
        invitees[personIdx] = { ...invitees[personIdx], permissions: newPerms };
        const polishes = (prev.cuttingData?.polishes || []).map((p) =>
          p.userId === invitees[personIdx].userId ? { ...p, permissions: newPerms } : p
        );
        return {
          ...prev,
          invitedWorkers: invitees,
          cuttingData: prev.cuttingData
            ? { ...prev.cuttingData, polishes }
            : prev.cuttingData,
        };
      }
      const updatedPeople = [...prev.people];
      if (updatedPeople[personIdx]) {
        updatedPeople[personIdx] = { ...updatedPeople[personIdx], permissions: newPerms };
      }
      return { ...prev, people: updatedPeople };
    });
  };

  if (loading || !sheet) {
    return <LoadingGrid fullPage size="lg" label="Loading Measurement Sheet..." />;
  }

  if (sheet.deleted) {
    return <LoadingGrid fullPage size="lg" label="Opening Deleted Sheets..." />;
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
        isOwner={isOwner}
        isReadonlyDay={isReadonlyDay}
        currentUserPermissions={myPermissions}
        onSelectPerson={(idx) => setActivePersonIdx(idx)}
        onRename={handleRename}
        onUpdatePermissions={handleUpdatePermissions}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Main Grid View */}
      <main className="flex-1 overflow-y-auto px-2 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 w-full max-w-5xl mx-auto">

        {/* Read-Only Banner for completed/past-day workers */}
        {isReadonlyDay && !isOwner && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs text-amber-700 font-medium">
            <Lock size={14} />
            <span>
              <strong>Completed / Read-Only</strong> — Working date was {sheetDateISO}. You can view measurements but cannot make changes.
            </span>
          </div>
        )}

        {/* Last Updated Info */}
        {sheet.lastUpdatedBy && (
          <div className="mb-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2 text-[11px] text-slate-500">
            <History size={12} />
            <span>Last updated by <strong>{sheet.lastUpdatedBy}</strong>{sheet.lastUpdatedAt ? ` at ${new Date(sheet.lastUpdatedAt).toLocaleString()}` : ""}</span>
          </div>
        )}

        {/* Person Header Banner */}
        <div className="mb-3 flex items-center justify-between bg-sheet-surface px-3 py-2.5 sm:p-4 rounded-xl border border-sheet-border shadow-sm">
          <h2 className="text-xs sm:text-sm font-bold text-sheet-text flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="truncate">
              {sheet.sheetCategory === "cutting"
                ? `Machine: ${currentPerson?.name}`
                : sheet.sheetType === "private"
                ? `Person: ${currentPerson?.name}`
                : `Measuring: ${currentPerson?.name}`}
            </span>
          </h2>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {sheet.date && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                <Clock size={10} />
                {sheet.date}
              </span>
            )}
            <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">
              {sheet.locationType}
            </span>
            <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
              {sheet.sheetCategory === "cutting" ? "Cutting" : sheet.sheetCategory === "polish" ? "Polish" : sheet.personType}
            </span>
          </div>
        </div>

        {/* Measurement Grid Table */}
        {currentPerson && (
          <MeasurementGrid
            key={`${sheet.id}_${activePersonIdx}`}
            locationType={sheet.locationType}
            personType={sheet.personType}
            sheetCategory={sheet.sheetCategory}
            startingSerialNumber={sheet.startingSerialNumber ?? 1}
            rows={currentPerson.rows}
            onChangeRows={handleRowsChange}
            autoFocusFirstCell={true}
            isOwner={isOwner}
            permissions={myPermissions}
            isReadonlyDay={isReadonlyDay}
          />
        )}
      </main>
    </div>
  );
}
