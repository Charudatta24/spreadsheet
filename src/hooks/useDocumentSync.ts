"use client";

import { useEffect, useRef } from "react";
import {
  subscribeDocument,
  subscribeCells,
  loadCells,
  writeCell,
  updateDocumentTitle,
  updateColWidths,
  updateRowHeights,
  updateColOrder,
} from "@/lib/firebase/firestore";
import { useEditorStore } from "@/lib/sync/store";
import type { CellId, CellData, SheetDocument } from "@/types";

const DEBOUNCE_MS = 500;

export function useDocumentSync(docId: string): void {
  const {
    setCells,
    applyRemoteCell,
    applyRemoteMeta,
    setSaveState,
    addPendingWrite,
    removePendingWrite,
  } = useEditorStore();

  const debounceMap = useRef<Map<CellId, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setSaveState("saving");
    loadCells(docId)
      .then((cells) => {
        if (mounted) {
          setCells(cells);
          setSaveState("saved");
        }
      })
      .catch(() => {
        if (mounted) setSaveState("error");
      });
    return () => {
      mounted = false;
    };
  }, [docId, setCells, setSaveState]);

  // ── Real-time document meta ───────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeDocument(docId, (meta) => {
      applyRemoteMeta(meta as Partial<SheetDocument>);
    });
    return unsub;
  }, [docId, applyRemoteMeta]);

  // ── Real-time cell changes ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeCells(docId, (cellId, data) => {
      applyRemoteCell(cellId, data);
    });
    return unsub;
  }, [docId, applyRemoteCell]);

  // ── Write listener ────────────────────────────────────────────────────────
  useEffect(() => {
    // Copy ref value into local variable for safe use in cleanup
    const localDebounceMap = debounceMap.current;

    const handleCellWrite = (e: Event) => {
      const { cellId, data } = (
        e as CustomEvent<{ cellId: CellId; data: CellData }>
      ).detail;

      addPendingWrite(cellId);
      setSaveState("saving");

      const existing = localDebounceMap.get(cellId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        try {
          await writeCell(docId, cellId, data);
          removePendingWrite(cellId);
          setSaveState("saved");
        } catch (err) {
          console.error("Write failed:", err);
          setSaveState("error");
        }
        localDebounceMap.delete(cellId);
      }, DEBOUNCE_MS);

      localDebounceMap.set(cellId, timer);
    };

    const handleTitleWrite = async (e: Event) => {
      const { title } = (e as CustomEvent<{ title: string }>).detail;
      try {
        await updateDocumentTitle(docId, title);
      } catch (err) {
        console.error("Title write failed:", err);
      }
    };

    const handleColWidths = async (e: Event) => {
      const { colWidths } = (e as CustomEvent).detail;
      try {
        await updateColWidths(docId, colWidths);
      } catch (err) {
        console.error("ColWidths write failed:", err);
      }
    };

    const handleRowHeights = async (e: Event) => {
      const { rowHeights } = (e as CustomEvent).detail;
      try {
        await updateRowHeights(docId, rowHeights);
      } catch (err) {
        console.error("RowHeights write failed:", err);
      }
    };

    const handleColOrder = async (e: Event) => {
      const { colOrder } = (e as CustomEvent).detail;
      try {
        await updateColOrder(docId, colOrder);
      } catch (err) {
        console.error("ColOrder write failed:", err);
      }
    };

    window.addEventListener("sheet:cell-write", handleCellWrite);
    window.addEventListener("sheet:title-write", handleTitleWrite);
    window.addEventListener("sheet:col-widths", handleColWidths);
    window.addEventListener("sheet:row-heights", handleRowHeights);
    window.addEventListener("sheet:col-order", handleColOrder);

    return () => {
      window.removeEventListener("sheet:cell-write", handleCellWrite);
      window.removeEventListener("sheet:title-write", handleTitleWrite);
      window.removeEventListener("sheet:col-widths", handleColWidths);
      window.removeEventListener("sheet:row-heights", handleRowHeights);
      window.removeEventListener("sheet:col-order", handleColOrder);
      // Use local copy of the map in cleanup (fixes react-hooks/exhaustive-deps warning)
      localDebounceMap.forEach((t) => clearTimeout(t));
    };
  }, [docId, addPendingWrite, removePendingWrite, setSaveState]);
}

// ── Dispatch helpers ──────────────────────────────────────────────────────────

export function dispatchCellWrite(cellId: CellId, data: CellData): void {
  window.dispatchEvent(
    new CustomEvent("sheet:cell-write", { detail: { cellId, data } })
  );
}

export function dispatchTitleWrite(title: string): void {
  window.dispatchEvent(
    new CustomEvent("sheet:title-write", { detail: { title } })
  );
}

export function dispatchColWidths(colWidths: Record<number, number>): void {
  window.dispatchEvent(
    new CustomEvent("sheet:col-widths", { detail: { colWidths } })
  );
}

export function dispatchRowHeights(rowHeights: Record<number, number>): void {
  window.dispatchEvent(
    new CustomEvent("sheet:row-heights", { detail: { rowHeights } })
  );
}

export function dispatchColOrder(colOrder: number[]): void {
  window.dispatchEvent(
    new CustomEvent("sheet:col-order", { detail: { colOrder } })
  );
}