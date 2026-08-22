"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MeasurementSheet, SaveState } from "@/types";
import { calculateSheetTotal } from "@/lib/measurementExport";

const SAVE_DEBOUNCE_MS = 600;

export function useMeasurementSync(sheetId: string, initialUserId?: string) {
  const [sheet, setSheet] = useState<MeasurementSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const pendingRef = useRef<MeasurementSheet | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyStack = useRef<MeasurementSheet[]>([]);
  const redoStack = useRef<MeasurementSheet[]>([]);

  // Monitor network status
  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
      if (pendingRef.current) {
        flushSave();
      }
    }
    function handleOffline() {
      setIsOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Subscribe to Firestore document updates
  useEffect(() => {
    if (!sheetId) return;
    const docRef = doc(db, "measurementSheets", sheetId);

    // ── Warm-start from localStorage cache so the sheet renders immediately ──
    // On slow networks, Firestore can take a few seconds. This prevents a blank
    // full-page spinner by showing cached data while the live snapshot loads.
    try {
      const cached = localStorage.getItem(`measurement_${sheetId}`);
      if (cached) {
        const parsed: MeasurementSheet = JSON.parse(cached);
        if (parsed && parsed.id) {
          setSheet(parsed);
          // Don't clear loading yet — wait for Firestore to confirm
        }
      }
    } catch (_) {}

    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as MeasurementSheet;
          // If we have pending local writes, do not overwrite local state with stale remote snapshot
          if (!pendingRef.current) {
            setSheet(data);
            setLastSavedTime(new Date());
            // Update the cache with the latest server data
            try {
              localStorage.setItem(`measurement_${sheetId}`, JSON.stringify(data));
            } catch (_) {}
          }
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error subscribing to measurement sheet:", err);
        setSaveState("error");
        setLoading(false);
      }
    );
    return unsub;
  }, [sheetId]);

  // Flush pending save to Firestore
  const flushSave = useCallback(async () => {
    if (!pendingRef.current || !sheetId) return;
    const toSave = { ...pendingRef.current };
    pendingRef.current = null;

    setSaveState("saving");

    try {
      const docRef = doc(db, "measurementSheets", sheetId);
      await setDoc(
        docRef,
        {
          ...toSave,
          total: calculateSheetTotal(toSave),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSaveState("saved");
      setLastSavedTime(new Date());
    } catch (err) {
      console.error("Failed auto-saving measurement sheet:", err);
      // Re-queue pending save
      pendingRef.current = toSave;
      setSaveState("error");
    }
  }, [sheetId]);

  // Update sheet state locally & trigger debounced save
  const updateSheet = useCallback(
    (updater: (prev: MeasurementSheet) => MeasurementSheet) => {
      setSheet((prev) => {
        if (!prev) return prev;

        // Save history for Undo
        historyStack.current.push(JSON.parse(JSON.stringify(prev)));
        redoStack.current = []; // Clear redo stack on new edit

        const updated = updater(prev);
        updated.total = calculateSheetTotal(updated);

        pendingRef.current = updated;
        setSaveState("pending");

        // Save locally to localStorage as offline fallback
        try {
          localStorage.setItem(`measurement_${sheetId}`, JSON.stringify(updated));
        } catch (_) {}

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);

        return updated;
      });
    },
    [sheetId, flushSave]
  );

  // Undo / Redo
  const undo = useCallback(() => {
    if (historyStack.current.length === 0 || !sheet) return;
    const previous = historyStack.current.pop()!;
    redoStack.current.push(JSON.parse(JSON.stringify(sheet)));
    setSheet(previous);
    pendingRef.current = previous;
    setSaveState("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [sheet, flushSave]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0 || !sheet) return;
    const next = redoStack.current.pop()!;
    historyStack.current.push(JSON.parse(JSON.stringify(sheet)));
    setSheet(next);
    pendingRef.current = next;
    setSaveState("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [sheet, flushSave]);

  return {
    sheet,
    loading,
    saveState,
    lastSavedTime,
    isOffline,
    updateSheet,
    undo,
    redo,
    canUndo: historyStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
